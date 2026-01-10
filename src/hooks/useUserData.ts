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
  price_undercut_amount: number;
  is_cron_active: boolean;
  cron_interval: number;
  last_cron_run: string | null;
  discord_webhook_url: string | null;
}

const useUserData = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<UserConfig>({
    api_key: '',
    secret_key: '',
    store_name: '',
    whitelist: '',
    price_undercut_amount: 10,
    is_cron_active: false,
    cron_interval: 15,
    last_cron_run: null,
    discord_webhook_url: null,
  });
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [logs, setLogs] = useState<{ message: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const addLog = useCallback((message: string, createdAt: string) => {
    const formattedMessage = `${new Date(createdAt).toLocaleTimeString()}: ${message}`;
    setLogs(prev => [{ message: formattedMessage, createdAt }, ...prev].slice(0, 100));
  }, []);

  const updateProductsWithResults = useCallback((results: ProductStatus[]) => {
    setProducts(prev => {
      const resultsMap = new Map(results.map(r => [r.product_id, r]));
      return prev.map(p => {
        const newResult = resultsMap.get(p.product_id);
        return newResult ? { 
          ...p, 
          status: newResult.status,
          message: newResult.message,
          messageParams: newResult.messageParams,
          myPrice: newResult.myPrice,
          competitorPrice: newResult.competitorPrice,
          competitorStoreName: newResult.competitorStoreName,
          newPrice: newResult.newPrice,
          myStock: newResult.myStock,
          mySoldCount: newResult.mySoldCount,
          competitorStock: newResult.competitorStock,
          competitorSoldCount: newResult.competitorSoldCount,
        } : p;
      });
    });
  }, []);

  const loadExistingLogs = useCallback(async (userId: string, currentProducts: ProductStatus[]) => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data: existingLogs, error } = await supabase
        .from('logs')
        .select('message, created_at')
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading existing logs:', error);
        return currentProducts;
      }

      const formattedLogs = (existingLogs || []).map(log => ({
        message: log.message,
        createdAt: log.created_at,
      }));
      setLogs(formattedLogs);

      return currentProducts;
    } catch (error) {
      console.error('Error in loadExistingLogs:', error);
      return currentProducts;
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
        const { data: configData, error: configError } = await supabase
          .from('configurations')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (configError && configError.code !== 'PGRST116') {
          console.error('Error loading config:', configError);
        } else if (configData) {
          setConfig(configData);
        }

        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        let initialProducts: ProductStatus[] = [];
        if (productsError) {
          console.error('Error loading products:', productsError);
        } else {
          initialProducts = (productsData || []).map(p => ({
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
            cron_interval_minutes: p.cron_interval_minutes,
            rivalStoreName: p.rival_store_name,
            status: 'idle',
            message: 'logic.waiting',
          }));
        }

        const productsWithLogs = await loadExistingLogs(user.id, initialProducts);
        setProducts(productsWithLogs);

      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUserData();

    configPollingInterval = setInterval(() => {
      if (isMounted) {
        loadUserData();
      }
    }, 30000);

    const channel = supabase
      .channel(`product-updates-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.new.message) {
             addLog(payload.new.message, payload.new.created_at);
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
  }, [user, addLog, loadExistingLogs]);

  const saveConfig = async (newConfig: Partial<UserConfig>) => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('configurations')
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
        cron_interval_minutes: product.cron_interval_minutes,
        rival_store_name: product.rivalStoreName || null,
        updated_at: new Date().toISOString(),
      };
      
      const { data: upsertResult, error: upsertError } = await supabase
        .from('products')
        .upsert(productData, { onConflict: 'user_id,product_id' })
        .select('*');

      if (upsertError) {
        showError(`Failed to save product: ${upsertError.message}`);
        throw upsertError;
      }
      
      if (upsertResult?.[0]) {
        const updated = upsertResult[0];
        setProducts(prev => {
          const existingIndex = prev.findIndex(p => p.product_id === updated.product_id);
          const newStatus: ProductStatus = {
            product_id: updated.product_id,
            name: updated.name,
            category: updated.category,
            minPrice: updated.min_price,
            maxPrice: updated.max_price,
            priceUndercutAmount: updated.undercut_amount,
            game_id: updated.game_id,
            item_type_id: updated.item_type_id,
            item_info_group_id: updated.item_info_group_id,
            item_info_id: updated.item_info_id,
            isActive: updated.is_active,
            cron_interval_minutes: updated.cron_interval_minutes,
            rivalStoreName: updated.rival_store_name,
            status: 'idle',
            message: 'logic.waiting',
          };

          if (existingIndex > -1) {
            const list = [...prev];
            list[existingIndex] = { ...list[existingIndex], ...newStatus };
            return list;
          }
          return [newStatus, ...prev];
        });
      }
      return true;
    } catch (error) {
      console.error('Error saving product:', error);
      return false;
    }
  };

  const deleteProduct = async (productId: number) => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('products')
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
    if (!user || updates.length === 0) return false;
    try {
      const promises = updates.map(({ productId, isActive }) =>
        supabase
          .from('products')
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('product_id', productId)
      );

      const results = await Promise.all(promises);
      if (results.some(r => r.error)) throw new Error('Some updates failed');

      setProducts(prev => {
        const map = new Map(updates.map(u => [u.productId, u.isActive]));
        return prev.map(p => map.has(p.product_id) ? { ...p, isActive: map.get(p.product_id)! } : p);
      });
      return true;
    } catch (error) {
      console.error('Error in batchUpdateProductStatus:', error);
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

      if (error) throw error;

      if (data && data.result) {
        updateProductsWithResults([data.result]);
        showSuccess(`Produk ${data.result.name} berhasil diproses.`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showError(`Gagal memproses: ${msg}`);
      setProducts(prev => prev.map(p => 
        p.product_id === productId ? { ...p, status: 'error', message: 'logic.processFailed' } : p
      ));
    }
  }, [user, updateProductsWithResults]);

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