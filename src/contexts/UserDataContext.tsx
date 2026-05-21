import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Product, ProductStatus } from '@/types';

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

interface UserDataContextType {
  config: UserConfig | null;
  products: ProductStatus[];
  logs: LogEntry[];
  loading: boolean;
  saveConfig: (newConfig: Partial<UserConfig>) => Promise<boolean>;
  saveProduct: (product: Omit<Product, 'isActive'> & { id?: number }) => Promise<boolean>;
  deleteProduct: (productId: number) => Promise<boolean>;
  batchUpdateProductStatus: (updates: { productId: number; isActive: boolean }[]) => Promise<boolean>;
  processSingleProduct: (productId: number) => Promise<boolean>;
}

const UserDataContext = createContext<UserDataContextType | undefined>(undefined);

export const UserDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const parseParams = (params: any) => {
    if (!params) return {};
    if (typeof params === 'string') {
      try { return JSON.parse(params); } catch (e) { return {}; }
    }
    return params;
  };

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
    messageParams: parseParams(p.last_message_params),
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
    if (!logData) return;
    const newLog: LogEntry = {
      message: logData.message || 'Activity log entry',
      messageParams: parseParams(logData.messageParams),
      productName: logData.productName || 'Product',
      createdAt: createdAt
    };
    setLogs(prev => {
      const isDuplicate = prev.some(l => l.createdAt === createdAt && l.productName === newLog.productName);
      if (isDuplicate) return prev;
      return [newLog, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setConfig(null);
      setProducts([]);
      setLogs([]);
      return;
    }

    const fetchLatestData = async () => {
      try {
        const { data: configData } = await supabase.from('user_configurations').select('*').eq('user_id', user.id).maybeSingle();
        if (configData) setConfig(configData);

        const { data: productsData } = await supabase.from('user_products').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (productsData) setProducts(productsData.map(mapDbToProductStatus));

        const { data: logsData } = await supabase.from('product_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
        if (logsData) {
          setLogs(logsData.map(l => ({
            message: l.log_data?.message || 'Activity log entry',
            messageParams: parseParams(l.log_data?.messageParams),
            productName: l.log_data?.productName || l.log_data?.name || 'Product',
            createdAt: l.created_at
          })));
        }
      } catch (error) {
        console.error('Error fetching latest data:', error);
      }
    };

    // Load initial data
    setLoading(true);
    fetchLatestData().finally(() => setLoading(false));

    // Realtime subscription - Tanpa filter server-side agar trigger instan 100% handal
    const channel = supabase
      .channel(`db-sync-instant-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'product_logs' }, (payload) => {
        if (payload.new && payload.new.user_id === user.id) {
          addLog(payload.new.log_data, payload.new.created_at);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_products' }, (payload) => {
        const targetData = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (targetData && targetData.user_id === user.id) {
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
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_configurations' }, (payload) => {
        if (payload.new && payload.new.user_id === user.id) {
          setConfig(payload.new as UserConfig);
        }
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
      return !error;
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
      if (product.id) productData.id = product.id;
      else if (existingProduct) productData.id = existingProduct.id;
      const { error } = await supabase.from('user_products').upsert(productData);
      return !error;
    } catch (e) { return false; }
  };

  const deleteProduct = async (productId: number) => {
    if (!user) return false;
    try {
      const { error } = await supabase.from('user_products').delete().eq('user_id', user.id).eq('product_id', productId);
      return !error;
    } catch (e) { return false; }
  };

  const batchUpdateProductStatus = async (updates: { productId: number; isActive: boolean }[]) => {
    if (!user) return false;
    try {
      for (const update of updates) {
        await supabase.from('user_products').update({ is_active: update.isActive, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('product_id', update.productId);
      }
      return true;
    } catch (e) { return false; }
  };

  const processSingleProduct = async (productId: number) => {
    if (!user) return false;
    setProducts(prev => prev.map(p => String(p.product_id) === String(productId) ? { ...p, status: 'loading', message: 'logic.checking' } : p));
    try {
      const { data, error } = await supabase.functions.invoke('process-single-product', { 
        body: { user_id: user.id, product_id: productId, is_manual: true } 
      });
      if (error) throw error;
      
      // Langsung update state produk lokal dari respon API agar loading spinner langsung berhenti
      if (data) {
        setProducts(prev => prev.map(p => {
          if (String(p.product_id) === String(productId)) {
            return {
              ...p,
              status: data.status || 'success',
              message: data.message || 'logic.waiting',
              messageParams: data.messageParams || {},
              myPrice: data.myPrice !== null ? data.myPrice : p.myPrice,
              myStock: data.myStock !== null ? data.myStock : p.myStock,
              mySoldCount: data.mySoldCount !== null ? data.mySoldCount : p.mySoldCount,
              competitorPrice: data.competitorPrice,
              competitorStoreName: data.competitorStoreName,
              competitorStock: data.competitorStock,
              competitorSoldCount: data.competitorSoldCount,
              newPrice: data.newPrice || p.newPrice,
            };
          }
          return p;
        }));
      }
      return true;
    } catch (error) {
      setProducts(prev => prev.map(p => String(p.product_id) === String(productId) ? { ...p, status: 'error', message: 'logic.processFailed' } : p));
      return false;
    }
  };

  return (
    <UserDataContext.Provider value={{ config, products, logs, loading, saveConfig, saveProduct, deleteProduct, batchUpdateProductStatus, processSingleProduct }}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = () => {
  const context = useContext(UserDataContext);
  if (context === undefined) throw new Error('useUserData must be used within a UserDataProvider');
  return context;
};