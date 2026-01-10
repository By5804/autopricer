import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let force = false;
    try {
      const body = await req.json();
      force = body.force === true;
    } catch (e) { /* ignore */ }

    let productsToProcess = [];

    if (force) {
      // Ambil semua produk aktif
      const { data } = await supabaseAdmin
        .from('user_products')
        .select('user_id, product_id, cron_interval_minutes')
        .eq('is_active', true);
      productsToProcess = data || [];
    } else {
      // Ambil produk yang sudah waktunya (due) melalui RPC
      // Kita ambil detail tambahan untuk mengecek apakah ini custom interval
      const { data, error: rpcError } = await supabaseAdmin.rpc('get_due_products');
      if (rpcError) throw rpcError;
      
      if (data && data.length > 0) {
        const productIds = data.map((p: any) => p.product_id);
        const { data: details } = await supabaseAdmin
          .from('user_products')
          .select('user_id, product_id, cron_interval_minutes')
          .in('product_id', productIds);
        productsToProcess = details || [];
      }
    }

    if (productsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "No products due for update." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const now = new Date().toISOString();
    const productIds = productsToProcess.map(p => p.product_id);
    
    // Identifikasi user yang memiliki produk yang menggunakan interval GLOBAL (cron_interval_minutes IS NULL)
    // Atau jika ini adalah 'force run', kita anggap ini pembaruan global
    const globalUserIds = force 
      ? [...new Set(productsToProcess.map(p => p.user_id))]
      : [...new Set(productsToProcess.filter(p => !p.cron_interval_minutes).map(p => p.user_id))];

    // 1. Update timestamp terakhir jalan untuk PRODUK (selalu diupdate)
    await supabaseAdmin
      .from('user_products')
      .update({ cron_last_run_at: now })
      .in('product_id', productIds);

    // 2. Update timestamp terakhir jalan untuk KONFIGURASI GLOBAL 
    // HANYA jika ada produk non-custom yang diproses (agar UI Countdown tidak reset terus-menerus)
    if (globalUserIds.length > 0) {
      await supabaseAdmin
        .from('user_configurations')
        .update({ cron_last_run_at: now })
        .in('user_id', globalUserIds);
    }

    // Jalankan pemrosesan secara paralel
    const processingPromises = productsToProcess.map(product =>
      supabaseAdmin.functions.invoke('process-single-product', {
        body: { user_id: product.user_id, product_id: product.product_id },
      })
    );

    // Kita tidak menunggu sampai selesai di sini agar cron tidak timeout
    Promise.allSettled(processingPromises);

    return new Response(JSON.stringify({ 
      message: `Processing ${productsToProcess.length} products.`,
      globalUpdate: globalUserIds.length > 0 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error: any) {
    console.error("[cron-scheduler] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});