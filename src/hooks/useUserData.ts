import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Product, ProductStatus } from '@/types';
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
  price_war_trigger_count: number;
  price_war_trigger_hours: number;
}

export interface LogEntry {
  message: string;
  messageParams?: Record<string, any>;
  productName?: string;
  createdAt: string;
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
    price_war_trigger_count: 5,
    price_war_trigger_hours: 1,
  });
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const addLog = useCallback((logData: any, createdAt: string) => {
    const newLog: LogEntry = {
      message: logData?.message || 'Activity log entry',
      messageParams: logData?.messageParams || {},
      productName: logData?.productName || logData?.name || 'Product',
      createdAt: createdAt
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  const updateProductsWithResults = useCallback((results: any[]) => {
    setProducts(prev => {
      const resultsMap = new Map(results.map(r => [r.product_id, r]));
      return prev.map(p => {
        const newResult = resultsMap.get(p.product_id);
        if (!newResult) return p;
        
        return { 
          ...p, 
          status: newResult.status || newResult.last_status || p.status,
          message: newResult.message || newResult.last_message || p.message,
          messageParams: newResult.messageParams || newResult.last_message_params || p.messageParams,
          myPrice: newResult.myPrice !== undefined ? newResult.myPrice : (newResult.last_my_price !== undefined ? newResult.last_my_price : p.myPrice),
          myStock: newResult.myStock !== undefined ? newResult.myStock : (newResult.last_my_stock !== undefined ? newResult.last_my_stock : p.myStock),
          mySoldCount: newResult.mySoldCount !== undefined ? newResult.mySoldCount : (newResult.last_my_sold_count !== undefined ? newResult.last_my_sold_count : p.mySoldCount),
          competitorPrice: newResult.competitorPrice !== undefined ? newResult.competitorPrice : (newResult.last_competitor_price !== undefined ? newResult.last_competitor_price : p.competitorPrice),
          competitorStoreName: newResult.competitorStoreName || newResult.last_competitor_store_name || p.competitorStoreName,
          competitorStock: newResult.competitorStock !== undefined ? newResult.competitorStock : (newResult.last_competitor_stock !== undefined ? newResult.last_competitor_stock : p.competitorStock),
          competitorSoldCount: newResult.competitorSoldCount !== undefined ? newResult.competitorSoldCount : (newResult.last_competitor_sold_count !== undefined ? newResult.last_competitor_sold_count : p.competitorSoldCount),
          newPrice: newResult.newPrice !== undefined ? newResult.newPrice : (newResult.proposed_price !== undefined ? newResult.proposed_price : p.newPrice),
        };
      });
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadUserData = async () => {
      try {
        const { data: configData } = await supabase.from('user_configurations').select('*').eq('user_id', user.id).maybeSingle();
        if (configData) setConfig(configData);

        const { data: productsData } = await supabase.from('user_products').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

        if (productsData) {
          const initialProducts: ProductStatus[] = productsData.map(p => ({
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
            status: (p.last_status as any) || 'idle',
            message: p.last_message || 'logic.waiting',
            messageParams: p.last_message_params || {},
            myPrice: p.last_my_price,
            myStock: p.last_my_stock,
            mySoldCount: p.last_my_sold_count,
            competitorPrice: p.last_competitor_price,
            competitorStoreName: p.last_competitor_store_name,
            competitorStock: p.last_competitor_stock,
            competitorSoldCount: p.last_competitor_sold_count,
            newPrice: p.proposed_price,
          }));
          setProducts(initialProducts);
        }

        const { data: logsData } = await supabase.from('product_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
        if (logsData) {
          setLogs(logsData.map(l => ({
            message: l.log_data?.message || 'Activity log entry',
            messageParams: l.log_data?.messageParams || {},
            productName: l.log_data?.productName || l.log_data?.name || 'Product',
            createdAt: l.created_at
          })));
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();

    const channel = supabase
      .channel(`db-changes-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'product_logs', filter: `user_id=eq.${user.id}` }, 
        (payload) => addLog(payload.new.log_data, payload.new.created_at)
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_products', filter: `user_id=eq.${user.id}` },
        (payload) => updateProductsWithResults([payload.new])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, addLog, updateProductsWithResults]);

  const saveConfig = async (newConfig: Partial<UserConfig>) => {
    if (!user) return false;
    try {
      await supabase.from('user_configurations').upsert({ user_id: user.id, ...newConfig, updated_at: new Date().toISOString() });
      setConfig(prev => ({ ...prev, ...newConfig }));
      return true;
    } catch (e) { return false; }
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
      const { data, error } = await supabase.from('user_products').upsert(productData).select().single();
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
            status: data.last_status || 'idle',
            message: data.last_message || 'logic.waiting',
            messageParams: data.last_message_params || {},
            myPrice: data.last_my_price,
            myStock: data.last_my_stock,
            mySoldCount: data.last_my_sold_count,
            competitorPrice: data.last_competitor_price,
            competitorStoreName: data.last_competitor_store_name,
            competitorStock: data.last_competitor_stock,
            competitorSoldCount: data.last_competitor_sold_count,
          };
          if (index > -1) { const list = [...prev]; list[index] = newProd; return list; }
          return [newProd, ...prev];
        });
      }
      return true;
    } catch (e) { return false; }
  };

  const deleteProduct = async (productId: number) => {
    if (!user) return false;
    try {
      await supabase.from('user_products').delete().eq('user_id', user.id).eq('product_id', productId);
      setProducts(prev => prev.filter(p => p.product_id !== productId));
      return true;
    } catch (e) { return false; }
  };

  const batchUpdateProductStatus = async (updates: { productId: number; isActive: boolean }[]) => {
    if (!user) return false;
    try {
      for (const update of updates) {
        await supabase.from('user_products').update({ is_active: update.isActive }).eq('user_id', user.id).eq('product_id', update.productId);
      }
      setProducts(prev => prev.map(p => {
        const up = updates.find(u => u.productId === p.product_id);
        return up ? { ...p, isActive: up.isActive } : p;
      }));
      return true;
    } catch (e) { return false; }
  };

  const processSingleProduct = useCallback(async (productId: number) => {
    if (!user) return;
    setProducts(prev => prev.map(p => p.product_id === productId ? { ...p, status: 'loading', message: 'logic.checking' } : p));
    try {
      const { data, error } = await supabase.functions.invoke('process-single-product', {
        body: { user_id: user.id, product_id: productId },
      });
      if (error) throw error;
      if (data) updateProductsWithResults([data]);
    } catch (error) {
      setProducts(prev => prev.map(p => p.product_id === productId ? { ...p, status: 'error', message: 'logic.processFailed' } : p));
    }
  }, [user, updateProductsWithResults]);

  return { config, products, loading, logs, saveConfig, saveProduct, deleteProduct, batchUpdateProductStatus, processSingleProduct };
};

export default useUserData;