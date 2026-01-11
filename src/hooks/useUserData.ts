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
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const mapDbToProductStatus = useCallback((p: any): ProductStatus => ({
    id: p.id,
    product_id: Number(p.product_id),
    name: p.name,
    category: p.category,
    minPrice: p.min_price,
    maxPrice: p.max_price,
    priceUndercutAmount: p.undercut_amount,
    price_war_undercut_amount: p.price_war_undercut_amount,
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
    mySoldCount: (p.last_my_sold_count as any) || 0,
    competitorPrice: p.last_competitor_price,
    competitorStoreName: p.last_competitor_store_name,
    competitorStock: p.last_competitor_stock,
    competitorSoldCount: (p.last_competitor_sold_count as any) || 0,
    newPrice: p.proposed_price,
  }), []);

  const addLog = useCallback((logData: any, createdAt: string) => {
    const newLog: LogEntry = {
      message: logData?.message || 'Activity log entry',
      messageParams: logData?.messageParams || {},
      productName: logData?.productName || logData?.name || 'Product',
      createdAt: createdAt
    };
    
    setLogs(prev => {
      const exists = prev.some(l => l.createdAt === createdAt && l.productName === newLog.productName);
      if (exists) return prev;
      return [newLog, ...prev].slice(0, 200);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadInitialData = async () => {
      try {
        const { data: configData } = await supabase.from('user_configurations').select('*').eq('user_id', user.id).maybeSingle();
        if (configData) setConfig(configData);

        const { data: productsData } = await supabase.from('user_products').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (productsData) {
          setProducts(productsData.map(mapDbToProductStatus));
        }

        const { data: logsData } = await supabase.from('product_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
        if (logsData) {
          setLogs(logsData.map(l => ({
            message: l.log_data?.message || 'Activity log entry',
            messageParams: l.log_data?.messageParams || {},
            productName: l.log_data?.productName || l.log_data?.name || 'Product',
            createdAt: l.created_at
          })));
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();

    const channel = supabase
      .channel('app-realtime-sync')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'product_logs'
      }, (payload) => {
        addLog(payload.new.log_data, payload.new.created_at);
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'user_products'
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setProducts(prev => prev.filter(p => String(p.id) !== String(payload.old.id)));
        } else {
          const updatedProduct = mapDbToProductStatus(payload.new);
          setProducts(prev => {
            const index = prev.findIndex(p => String(p.product_id) === String(updatedProduct.product_id));
            if (index !== -1) {
              const newProducts = [...prev];
              newProducts[index] = updatedProduct;
              return newProducts;
            }
            return [updatedProduct, ...prev];
          });
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'user_configurations'
      }, (payload) => {
        setConfig(payload.new as UserConfig);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, addLog, mapDbToProductStatus]);

  const saveConfig = async (newConfig: Partial<UserConfig>) => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('user_configurations').upsert({ user_id: user.id, ...newConfig, updated_at: new Date().toISOString() });
      if (error) throw error;
      return true;
    } catch (e) { return false; }
  };

  const saveProduct = async (product: Omit<Product, 'isActive'> & { id?: number }) => {
    if (!user) return false;
    try {
      const existingProduct = products.find(p => String(p.product_id) === String(product.product_id));
      
      const productData: any = {
        user_id: user.id,
        product_id: product.product_id,
        name: product.name,
        category: product.category || null,
        min_price: product.minPrice,
        max_price: product.maxPrice,
        undercut_amount: product.priceUndercutAmount ?? null,
        price_war_undercut_amount: product.price_war_undercut_amount ?? null,
        game_id: product.game_id,
        item_type_id: product.item_type_id,
        item_info_group_id: product.item_info_group_id ?? null,
        item_info_id: product.item_info_id,
        is_active: existingProduct ? existingProduct.isActive : true,
        cron_interval_minutes: product.cron_interval_minutes ?? null,
        rival_store_name: product.rivalStoreName || null,
        updated_at: new Date().toISOString()
      };

      if (product.id) {
        productData.id = product.id;
      } else if (existingProduct) {
        productData.id = existingProduct.id;
      }

      const { error } = await supabase.from('user_products').upsert(productData);
      if (error) throw error;
      return true;
    } catch (e) { return false; }
  };

  const deleteProduct = async (productId: number) => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('user_products').delete().eq('user_id', user.id).eq('product_id', productId);
      if (error) throw error;
      return true;
    } catch (e) { return false; }
  };

  const batchUpdateProductStatus = async (updates: { productId: number; isActive: boolean }[]) => {
    if (!user) return false;
    
    const originalProducts = [...products];
    setProducts(prev => prev.map(p => {
      const update = updates.find(u => String(u.productId) === String(p.product_id));
      return update ? { ...p, isActive: update.isActive } : p;
    }));

    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('user_products')
          .update({ is_active: update.isActive, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('product_id', update.productId);
        
        if (error) throw error;
      }
      return true;
    } catch (e) {
      setProducts(originalProducts);
      return false;
    }
  };

  const processSingleProduct = useCallback(async (productId: number) => {
    if (!user) return false;
    
    // Set loading state locally for immediate feedback
    setProducts(prev => prev.map(p => 
      String(p.product_id) === String(productId) 
        ? { ...p, status: 'loading', message: 'logic.checking' } 
        : p
    ));
    
    try {
      const { data, error } = await supabase.functions.invoke('process-single-product', {
        body: { user_id: user.id, product_id: productId },
      });
      
      if (error) throw error;
      
      // If we got a direct result, update UI immediately as fallback for realtime
      if (data && data.status) {
        setProducts(prev => prev.map(p => 
          String(p.product_id) === String(productId) 
            ? { 
                ...p, 
                status: data.status, 
                message: data.message, 
                messageParams: data.messageParams || {},
                newPrice: data.newPrice || p.newPrice,
                myPrice: data.myPrice || p.myPrice,
                competitorPrice: data.competitorPrice || p.competitorPrice,
                competitorStoreName: data.competitorStoreName || p.competitorStoreName
              } 
            : p
        ));
      }
      
      return true;
    } catch (error) {
      // Revert status on error
      setProducts(prev => prev.map(p => 
        String(p.product_id) === String(productId) 
          ? { ...p, status: 'error', message: 'logic.processFailed' } 
          : p
      ));
      return false;
    }
  }, [user]);

  return { config, products, loading, logs, saveConfig, saveProduct, deleteProduct, batchUpdateProductStatus, processSingleProduct };
};

export default useUserData;