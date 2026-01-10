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
      // Jika dipaksa, ambil semua produk aktif dari user yang menyalakan otomasi
      const { data } = await supabaseAdmin
        .from('user_products')
        .select('user_id, product_id')
        .eq('is_active', true);
      productsToProcess = data || [];
    } else {
      // Gunakan fungsi SQL get_due_products yang sudah kita buat
      const { data, error: rpcError } = await supabaseAdmin.rpc('get_due_products');
      if (rpcError) throw rpcError;
      productsToProcess = data || [];
    }

    if (productsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "No products due for update." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const now = new Date().toISOString();
    const productIds = productsToProcess.map(p => p.product_id);
    const userIds = [...new Set(productsToProcess.map(p => p.user_id))];

    // Update timestamp terakhir jalan
    await supabaseAdmin.from('user_products').update({ cron_last_run_at: now }).in('product_id', productIds);
    await supabaseAdmin.from('user_configurations').update({ cron_last_run_at: now }).in('user_id', userIds);

    // Jalankan pemrosesan secara paralel
    const processingPromises = productsToProcess.map(product =>
      supabaseAdmin.functions.invoke('process-single-product', {
        body: { user_id: product.user_id, product_id: product.product_id },
      })
    );

    await Promise.allSettled(processingPromises);

    return new Response(JSON.stringify({ message: `Processing ${productsToProcess.length} products.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error: any) {
    console.error("[cron-scheduler] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});