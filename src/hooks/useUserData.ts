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
      const { data: existingLogs, error } = await supabase
        .from('logs')
        .select('message, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading logs:', error);
        return currentProducts;
      }

      setLogs((existingLogs || []).map(log => ({
        message: log.message,
        createdAt: log.created_at,
      })));

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

    const loadUserData = async () => {
      try {
        const { data: configData, error: configError } = await supabase
          .from('configurations')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (configData) {
          setConfig(configData);
        }

        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        let initialProducts: ProductStatus[] = [];
        if (productsData) {
          initialProducts = productsData.map(p => ({
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

        await loadExistingLogs(user.id, initialProducts);
        setProducts(initialProducts);

      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadUserData();

    const channel = supabase
      .channel(`db-changes-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs', filter: `user_id=eq.${user.id}` }, 
        (payload) => addLog(payload.new.message, payload.new.created_at)
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
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
        });
      
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
      };
      
      const { data, error } = await supabase
        .from('products')
        .upsert(productData)
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setProducts(prev => {
          const index = prev.findIndex(p => p.product_id === data.product_id);
          const newProd: ProductStatus = {
            product_id: data.product_id,
            name: data.name,
            category: data.category,
            minPrice: data.min_price,
            maxPrice: data.max_price,
            priceUndercutAmount: data.undercut_amount,
            game_id: data.game_id,
            item_type_id: data.item_type_id,
            item_info_group_id: data.item_info_group_id,
            item_info_id: data.item_info_id,
            isActive: data.is_active,
            cron_interval_minutes: data.cron_interval_minutes,
            rivalStoreName: data.rival_store_name,
            status: 'idle',
            message: 'logic.waiting',
          };
          if (index > -1) {
            const list = [...prev];
            list[index] = newProd;
            return list;
          }
          return [newProd, ...prev];
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
    if (!user) return false;
    try {
      for (const update of updates) {
        await supabase
          .from('products')
          .update({ is_active: update.isActive })
          .eq('user_id', user.id)
          .eq('product_id', update.productId);
      }
      setProducts(prev => prev.map(p => {
        const up = updates.find(u => u.productId === p.product_id);
        return up ? { ...p, isActive: up.isActive } : p;
      }));
      return true;
    } catch (error) {
      console.error('Error batch updating status:', error);
      return false;
    }
  };

  const processSingleProduct = useCallback(async (productId: number) => {
    if (!user) return;
    setProducts(prev => prev.map(p => p.product_id === productId ? { ...p, status: 'loading', message: 'logic.checking' } : p));
    try {
      const { data, error } = await supabase.functions.invoke('process-single-product', {
        body: { user_id: user.id, product_id: productId },
      });
      if (error) throw error;
      if (data?.result) updateProductsWithResults([data.result]);
    } catch (error) {
      console.error('Process error:', error);
      setProducts(prev => prev.map(p => p.product_id === productId ? { ...p, status: 'error', message: 'logic.processFailed' } : p));
    }
  }, [user, updateProductsWithResults]);

  return { config, products, loading, logs, saveConfig, saveProduct, deleteProduct, batchUpdateProductStatus, processSingleProduct };
};

export default useUserData;