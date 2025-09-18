import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Panggil fungsi RPC untuk mendapatkan pengguna yang sudah jatuh tempo
    const { data: usersToProcess, error } = await supabaseAdmin.rpc('get_due_users');

    if (error) throw error;

    if (!usersToProcess || usersToProcess.length === 0) {
      console.log("Penjadwal berjalan, tidak ada pengguna yang perlu diproses.");
      return new Response(JSON.stringify({ message: "Tidak ada pengguna yang perlu diproses." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    for (const user of usersToProcess) {
      console.log(`Memperbarui timestamp dan memicu proses untuk pengguna: ${user.user_id}`);
      
      // 1. Perbarui timestamp segera untuk mencegah pemicuan ulang
      const { error: updateError } = await supabaseAdmin
        .from('user_configurations')
        .update({ cron_last_run_at: new Date().toISOString() })
        .eq('user_id', user.user_id);

      if (updateError) {
        console.error(`Gagal memperbarui timestamp untuk pengguna ${user.user_id}:`, updateError);
        continue; // Lanjut ke pengguna berikutnya
      }

      // 2. Panggil fungsi pemrosesan
      try {
        const { error: invokeError } = await supabaseAdmin.functions.invoke('process-products', {
          body: { user_id: user.user_id },
        });
        
        if (invokeError) {
          console.error(`Error memanggil process-products untuk pengguna ${user.user_id}:`, invokeError);
        } else {
          console.log(`Berhasil memanggil process-products untuk pengguna ${user.user_id}.`);
        }
      } catch (invokeCatchError) {
        console.error(`Pengecualian saat memanggil process-products untuk pengguna ${user.user_id}:`, invokeCatchError);
      }
    }

    return new Response(JSON.stringify({ message: `Memicu pemrosesan untuk ${usersToProcess.length} pengguna.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error pada penjadwal:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});