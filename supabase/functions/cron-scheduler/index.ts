import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let force = false;
    try {
      const body = await req.json();
      force = body.force === true;
    } catch (e) { /* ignore */ }

    let productsToProcess = [];

    if (force) {
      const { data } = await supabaseAdmin
        .from('user_products')
        .select('user_id, product_id')
        .eq('is_active', true);
      productsToProcess = data || [];
    } else {
      const { data, error: rpcError } = await supabaseAdmin.rpc('get_due_products');
      if (rpcError) throw rpcError;
      productsToProcess = data ? data.map((p: any) => ({ user_id: p.u_id, product_id: p.p_id })) : [];
    }

    if (productsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "No products due." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[cron-scheduler] Processing ${productsToProcess.length} products in parallel.`);

    const processedUserIds = new Set<string>();
    
    // Memproses semua produk secara paralel menggunakan fetch langsung untuk menghindari sensitivitas waktu JWT
    const promises = productsToProcess.map(async (item: any) => {
      processedUserIds.add(item.user_id);
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/process-single-product`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
          },
          body: JSON.stringify({ user_id: item.user_id, product_id: item.product_id }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return { id: item.product_id, success: true };
      } catch (err) {
        console.error(`[cron-scheduler] Error processing product ${item.product_id}:`, err);
        return { id: item.product_id, success: false };
      }
    });

    const results = await Promise.all(promises);

    // Perbarui waktu jalan terakhir secara global untuk tiap user yang diproses
    const now = new Date().toISOString();
    for (const userId of processedUserIds) {
      const { data: userConfig } = await supabaseAdmin
        .from('user_configurations')
        .select('cron_interval_minutes, cron_last_run_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (userConfig) {
        const lastRun = userConfig.cron_last_run_at ? new Date(userConfig.cron_last_run_at) : null;
        const globalIntervalMs = (userConfig.cron_interval_minutes || 10) * 60 * 1000;
        
        // HANYA update cron_last_run_at global jika:
        // 1. Belum pernah jalan (lastRun null)
        // 2. Atau waktu sekarang sudah melewati interval global (dengan toleransi 30 detik)
        // 3. Atau dipicu secara paksa (force run)
        if (force || !lastRun || (Date.now() - lastRun.getTime() >= globalIntervalMs - 30000)) {
          await supabaseAdmin
            .from('user_configurations')
            .update({ cron_last_run_at: now })
            .eq('user_id', userId);
          console.log(`[cron-scheduler] Global cron cycle completed. Updated global cron_last_run_at.`);
        } else {
          console.log(`[cron-scheduler] Custom interval products processed. Global cron_last_run_at preserved.`);
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error("[cron-scheduler] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});