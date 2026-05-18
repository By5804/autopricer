import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

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

    console.log(`[cron-scheduler] Processing ${productsToProcess.length} products in a single invocation.`);

    // Proses secara berurutan atau batch kecil untuk menghindari timeout
    // Di sini kita memanggil process-single-product secara internal (loop)
    // Namun untuk menghemat kuota, kita akan memprosesnya di sini langsung jika memungkinkan
    // Untuk saat ini, kita tetap panggil invoke tapi dalam jumlah terbatas atau gabungkan logikanya
    
    const results = [];
    for (const item of productsToProcess) {
      // Kita panggil fungsi pemroses. Karena ini dipanggil dari dalam Edge Function lain, 
      // ini tetap dihitung sebagai invocation, TAPI kita bisa memindahkan logika ke sini nanti.
      // Solusi terbaik: Pindahkan logika process-single-product ke dalam loop di sini.
      
      const res = await supabaseAdmin.functions.invoke('process-single-product', {
        body: { user_id: item.user_id, product_id: item.product_id },
      });
      results.push({ id: item.product_id, success: !res.error });
    }

    return new Response(JSON.stringify({ processed: results.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});