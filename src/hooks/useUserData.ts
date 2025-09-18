import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Product, ProductStatus } from '@/types';
import { formatMessage } from '@/utils/translations';

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

    const loadUserData = async () => {
      try {
        setLoading(true);
        
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

        const { data: productsData, error: productsError } = await supabase
          .from('user_products')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        if (productsError) {
          console.error('Error loading products:', productsError);
        } else {
          const formattedProducts: ProductStatus[] = (productsData || []).map(p => ({
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
          }));
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
      
      const { error } = await supabase
        .from('user_products')
        .upsert(productData, { onConflict: 'user_id,product_id' });
      
      if (error) throw error;
      
      setProducts(prev => {
        const existingIndex = prev.findIndex(p => p.product_id === product.product_id);
        if (existingIndex > -1) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...product,
            status: 'idle',
            message: 'logic.waiting'
          };
          return updated;
        } else {
          return [{
            ...product,
            isActive: true,
            status: 'idle',
            message: 'logic.waiting'
          }, ...prev];
        }
      });
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
    if (!user || updates.length === 0) return false;
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
      );

      const results = await Promise.all(updatePromises);

      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        errors.forEach(errorResult => console.error('Batch update error:', errorResult.error));
        throw new Error('Some product updates failed.');
      }

      setProducts(prev => {
        const updatesMap = new Map(updates.map(u => [u.productId, u.isActive]));
        return prev.map(p =>
          updatesMap.has(p.product_id)
            ? { ...p, isActive: updatesMap.get(p.product_id)! }
            : p
        );
      });

      return true;
    } catch (error) {
      console.error('Error in batchUpdateProductStatus:', error);
      return false;
    }
  };

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
  };
};

export default useUserData;