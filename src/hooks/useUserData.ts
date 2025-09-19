import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Product, ProductStatus } from '@/types';
import { formatMessage } from '@/utils/translations';
import { showError, showSuccess } from '@/utils/toast';

export interface UserConfig {
  api_key: string;
  secret_key: string;
  store_name: string;
  whitelist: string;
  undercut_amount: number;
  is_cron_active: boolean;
  cron_interval_minutes: number;
  cron_last_run_at: string | null;
}

const useUserData = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<UserConfig>({
    api_key: '',
    secret_key: '',
    store_name: '',
    whitelist: '',
    undercut_amount: 10,
    is_cron_active: false,
    cron_interval_minutes: 15,
    cron_last_run_at: null,
  });
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [`${new Date().toLocaleTimeString()}: ${message}`, ...prev].slice(0, 100));
  }, []);

  const updateProductsWithResults = useCallback((results: ProductStatus[]) => {
    setProducts(prev => {
      const resultsMap = new Map(results.map(r => [r.product_id, r]));
      return prev.map(p => {
        const newResult = resultsMap.get(p.product_id);
        return newResult ? { ...p, ...newResult } : p;
      });
    });
  }, []);

  const loadExistingLogs = useCallback(async (userId: string) => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data: existingLogs, error } = await supabase
        .from('product_logs')
        .select('log_data, created_at')
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading existing logs:', error);
        return;
      }

      if (existingLogs && existingLogs.length > 0) {
        const formattedLogs = existingLogs.map(log => {
          const logData = log.log_data as ProductStatus;
          const timestamp = new Date(log.created_at).toLocaleTimeString();
          return `${timestamp}: ${logData.name}: ${formatMessage(logData.message, logData.messageParams)}`;
        });
        setLogs(formattedLogs);

        const latestLogsByProduct = new Map();
        existingLogs.forEach(log => {
          const logData = log.log_data as ProductStatus;
          if (!latestLogsByProduct.has(logData.product_id)) {
            latestLogsByProduct.set(logData.product_id, logData);
          }
        });

        setProducts(prev => prev.map(product => {
          const latestLog = latestLogsByProduct.get(product.product_id);
          return latestLog ? { ...product, ...latestLog } : product;
        }));
      }
    } catch (error) {
      console.error('Error in loadExistingLogs:', error);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let configPollingInterval: ReturnType<typeof setInterval> | undefined;

    const loadUserData = async () => {
      try {
        // Fetch config
        const { data: configData, error: configError } = await supabase
          .from('user_configurations')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (configError && configError.code !== 'PGRST116') {
          console.error('Error loading config:', configError);
        } else if (configData) {
          setConfig(configData);
        }

        // Fetch products
        const { data: productsData, error: productsError } = await supabase
          .from('user_products')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        if (productsError) {
          console.error('Error loading products:', productsError);
        } else {
          const formattedProducts: ProductStatus[] = (productsData || []).map(p => {
            return {
              product_id: p.product_id,
              name: p.name,
              category: p.category,
              minPrice: p.min_price,
              maxPrice: p.max_price,
              priceUndercutAmount: p.undercut_amount,
              game_id: p.game_id,
              item_type_id: p.item_type_id,
              item_info_group_id: p.item_info_group_id,
              item_info_id: p.item_info_id,
              isActive: p.is_active,
              status: 'idle',
              message: 'logic.waiting',
            };
          });
          setProducts(formattedProducts);
        }

        await loadExistingLogs(user.id);

      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUserData();

    // Start polling for config updates (e.g., cron_last_run_at)
    configPollingInterval = setInterval(() => {
      if (isMounted) {
        loadUserData(); // Re-fetch all data, including config
      }
    }, 30000); // Poll every 30 seconds

    const channel = supabase
      .channel(`product-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'product_logs',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newLogData = payload.new.log_data as ProductStatus;
          if (newLogData) {
            updateProductsWithResults([newLogData]);
            const timestamp = new Date(payload.new.created_at).toLocaleTimeString();
            addLog(`${timestamp}: ${newLogData.name}: ${formatMessage(newLogData.message, newLogData.messageParams)}`);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      if (configPollingInterval) {
        clearInterval(configPollingInterval);
      }
    };
  }, [user, updateProductsWithResults, addLog, loadExistingLogs]);

  const saveConfig = async (newConfig: Partial<UserConfig>) => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('user_configurations')
        .upsert({
          user_id: user.id,
          ...newConfig,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) throw error;
      setConfig(prev => ({ ...prev, ...newConfig }));
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      return false;
    }
  };

  const saveProduct = async (product: Omit<Product, 'isActive'>) => {
    if (!user) return false;
    try {
      console.log('[useUserData] saveProduct - Product data received:', JSON.stringify(product, null, 2));

      const existingProduct = products.find(p => p.product_id === product.product_id);
      const productData = {
        user_id: user.id,
        product_id: product.product_id,
        name: product.name,
        category: product.category,
        min_price: product.minPrice,
        max_price: product.maxPrice,
        undercut_amount: product.priceUndercutAmount,
        game_id: product.game_id,
        item_type_id: product.item_type_id,
        item_info_group_id: product.item_info_group_id,
        item_info_id: product.item_info_id,
        is_active: existingProduct ? existingProduct.isActive : true,
        updated_at: new Date().toISOString(),
      };
      
      console.log('[useUserData] saveProduct - Payload sent to Supabase:', JSON.stringify(productData, null, 2));

      const { data: upsertResult, error: upsertError } = await supabase
        .from('user_products')
        .upsert(productData, { onConflict: 'user_id,product_id' })
        .select('*');

      if (upsertError) {
        console.error('[useUserData] saveProduct - Supabase upsert error:', upsertError);
        showError(`Failed to save product: ${upsertError.message}`);
        throw upsertError;
      }
      
      const updatedProductData = upsertResult?.[0];

      if (!updatedProductData) {
        console.error('[useUserData] saveProduct - Supabase upsert returned no data for the updated product. This might indicate an RLS issue or an unexpected Supabase behavior.');
        showError('Failed to retrieve updated product data from Supabase. Please try again.');
        throw new Error('No data returned after product upsert.');
      }
      
      console.log('[useUserData] saveProduct - Data received from Supabase:', JSON.stringify(updatedProductData, null, 2));

      if (updatedProductData) {
        setProducts(prev => {
          const existingIndex = prev.findIndex(p => p.product_id === updatedProductData.product_id);
          const newProductStatus: ProductStatus = {
            product_id: updatedProductData.product_id,
            name: updatedProductData.name,
            category: updatedProductData.category,
            minPrice: updatedProductData.min_price,
            maxPrice: updatedProductData.max_price,
            priceUndercutAmount: updatedProductData.undercut_amount,
            game_id: updatedProductData.game_id,
            item_type_id: updatedProductData.item_type_id,
            item_info_group_id: updatedProductData.item_info_group_id,
            item_info_id: updatedProductData.item_info_id,
            isActive: updatedProductData.is_active,
            status: 'idle', // Reset status after save
            message: 'logic.waiting', // Reset message
          };

          if (existingIndex > -1) {
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...newProductStatus };
            return updated;
          } else {
            return [newProductStatus, ...prev];
          }
        });
      }
      return true;
    } catch (error) {
      console.error('[useUserData] saveProduct - Error saving product:', error);
      return false;
    }
  };

  const deleteProduct = async (productId: number) => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('user_products')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
      
      if (error) throw error;
      setProducts(prev => prev.filter(p => p.product_id !== productId));
      return true;
    } catch (error) {
      console.error('Error deleting product:', error);
      return false;
    }
  };

  const batchUpdateProductStatus = async (updates: { productId: number; isActive: boolean }[]) => {
    if (!user || updates.length === 0) {
      console.warn('[useUserData] Batch update skipped: No user or no updates provided.');
      return false;
    }
    try {
      const updatePromises = updates.map(({ productId, isActive }) =>
        supabase
          .from('user_products')
          .update({
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('product_id', productId)
          .then(response => {
            if (response.error) {
              console.error(`[useUserData] Supabase update error for product ${productId}:`, response.error);
            }
            return response;
          })
      );

      const results = await Promise.all(updatePromises);

      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        errors.forEach(errorResult => console.error('[useUserData] Batch update failed for some products:', errorResult.error));
        throw new Error('Some product updates failed. Check console for details.');
      }

      setProducts(prev => {
        const updatesMap = new Map(updates.map(u => [u.productId, u.isActive]));
        const newProducts = prev.map(p =>
          updatesMap.has(p.product_id)
            ? { ...p, isActive: updatesMap.get(p.product_id)! }
            : p
        );
        return newProducts;
      });
      return true;
    } catch (error) {
      console.error('[useUserData] Error in batchUpdateProductStatus:', error);
      return false;
    }
  };

  const processSingleProduct = useCallback(async (productId: number) => {
    if (!user) {
      showError('Anda harus login untuk memproses produk.');
      return;
    }

    setProducts(prev => prev.map(p => 
      p.product_id === productId ? { ...p, status: 'loading', message: 'logic.checking' } : p
    ));

    try {
      const { data, error } = await supabase.functions.invoke('process-single-product', {
        body: { user_id: user.id, product_id: productId },
      });

      if (error) {
        console.error('Error invoking process-single-product:', error);
        const errorMessage = error.message || 'Unknown error';
        showError(`Gagal memproses produk: ${errorMessage}`);
        setProducts(prev => prev.map(p => 
          p.product_id === productId ? { ...p, status: 'error', message: 'logic.processFailed', messageParams: { errorMessage } } : p
        ));
        // Tambahkan ke log lokal untuk umpan balik instan
        addLog(`${new Date().toLocaleTimeString()}: Product ID ${productId}: ${formatMessage('logic.processFailed', { errorMessage })}`);
        return;
      }

      if (data && data.result) {
        updateProductsWithResults([data.result]);
        showSuccess(`Produk ${data.result.name} berhasil diproses.`);
        // Tambahkan ke log lokal untuk umpan balik instan
        const timestamp = new Date().toLocaleTimeString();
        addLog(`${timestamp}: ${data.result.name}: ${formatMessage(data.result.message, data.result.messageParams)}`);
      } else {
        showError('Respon tidak valid dari server.');
        setProducts(prev => prev.map(p => 
          p.product_id === productId ? { ...p, status: 'error', message: 'logic.processFailed', messageParams: { errorMessage: 'Respon tidak valid' } } : p
        ));
        addLog(`${new Date().toLocaleTimeString()}: Product ID ${productId}: ${formatMessage('logic.processFailed', { errorMessage: 'Respon tidak valid dari server.' })}`);
      }
    } catch (error) {
      console.error('Exception during processSingleProduct:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showError(`Terjadi kesalahan saat memproses produk: ${errorMessage}`);
      setProducts(prev => prev.map(p => 
        p.product_id === productId ? { ...p, status: 'error', message: 'logic.processFailed', messageParams: { errorMessage } } : p
      ));
      addLog(`${new Date().toLocaleTimeString()}: Product ID ${productId}: ${formatMessage('logic.processFailed', { errorMessage })}`);
    }
  }, [user, updateProductsWithResults, addLog]);

  return {
    config,
    products,
    loading,
    logs,
    addLog,
    saveConfig,
    saveProduct,
    deleteProduct,
    batchUpdateProductStatus,
    updateProductsWithResults,
    processSingleProduct,
  };
};

export default useUserData;