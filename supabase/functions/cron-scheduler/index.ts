import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Translations object (copied from src/utils/translations.ts)
const translations: Record<string, string> = {
  "logic.waiting": "Waiting for process to start.",
  "logic.checking": "Checking price...",
  "logic.processFailed": "Process failed. Check logs for details.",
  "logic.noCompetitor": "Error: Could not find any competitors for this product.",
  "logic.outOfStock": "Error: Your product is not in the top 10 (out of stock or uncompetitive).",
  "logic.onlySellerSetMax": "You are the only seller. Setting price to max.",
  "logic.onlySellerAtMax": "You are the only seller and already at max price.",
  "logic.maximizeProfit": "Maximizing profit against #2.",
  "logic.cheapestOptimal": "You are the cheapest; price is optimal.",
  "logic.attackFromMax": "Attacking {{competitorStoreName}} (rank #{{rank}}) from max price.",
  "logic.holdAtMax": "Holding at max price; no valid targets above.",
  "logic.undercutting": "Undercutting {{competitorStoreName}} (rank #{{rank}}).",
  "logic.undercuttingNewTarget": "P1 is too cheap. Undercutting new target {{competitorStoreName}} (rank #{{rank}}).",
  "logic.allCompetitorsTooCheap": "All competitors are cheaper than your minimum price. Holding price.",
  "logic.holdPrice": "Holding price; no valid non-whitelisted targets found above.",
  "logic.matchingWhitelist": "Matching whitelisted leader {{competitorStoreName}}.",
  "logic.opportunisticMax": "P1 is too cheap, P3 is expensive. Setting to max price.",
  "logic.defendingVsP3": "Defending against {{competitorStoreName}} (rank #3).",
  "logic.noP3SetMax": "P1 is too cheap and no P3 exists. Setting to max price.",
  "logic.profitMaximizationVsBelow": "Maximizing profit against competitor below you ({{competitorStoreName}}).",
  "logic.updateSuccess": "Price updated successfully to Rp {{newPrice}}.",
  "logic.updateFail": "Update failed: {{errorMessage}}",
  "logic.scrapeFail": "Scrape failed: {{errorMessage}}",
  "logic.violatesMinPrice": "Proposed price Rp {{proposedPrice}} is below min price Rp {{minPrice}}. Holding price.",
  "logic.violatesMaxPrice": "Proposed price Rp {{proposedPrice}} is above max price Rp {{maxPrice}}. Holding price."
};

// formatMessage function
const formatMessage = (key: string, params?: Record<string, string | number | undefined>): string => {
  let message = translations[key] || key;
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      if (paramValue !== undefined) {
        message = message.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
      }
    });
  }
  return message;
};

// Helper function to send Discord notification for multiple messages
async function sendDiscordNotification(webhookUrl: string, messages: string[]) {
  if (!webhookUrl || messages.length === 0) {
    console.log(`[Discord Webhook] Tidak mengirim notifikasi: webhookUrl kosong atau tidak ada pesan.`);
    return;
  }

  const description = messages.join('\n'); // Join all messages with newlines

  const payload = {
    username: "Itemku Pricer Bot",
    avatar_url: "https://www.itemku.com/assets/images/favicon.png",
    embeds: [
      {
        title: `Laporan Otomatisasi Harga - ${new Date().toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        description: description,
        color: 3447003, // Blue color for general report
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    console.log(`[Discord Webhook] Mengirim notifikasi ke: ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Discord Webhook] Gagal mengirim notifikasi: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`[Discord Webhook] Respon error dari Discord: ${errorText}`);
    } else {
      console.log(`[Discord Webhook] Notifikasi berhasil dikirim.`);
    }
  } catch (error) {
    console.error(`[Discord Webhook] Error saat mengirim notifikasi: ${error.message}`);
  }
}

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

      // 2. Ambil semua produk aktif untuk pengguna ini
      const { data: userProducts, error: productsError } = await supabaseAdmin
        .from('user_products')
        .select('product_id')
        .eq('user_id', user.user_id)
        .eq('is_active', true);

      if (productsError) {
        console.error(`Gagal mengambil produk untuk pengguna ${user.user_id}:`, productsError);
        continue; // Lanjut ke pengguna berikutnya
      }

      if (userProducts && userProducts.length > 0) {
        console.log(`Memicu pemrosesan untuk ${userProducts.length} produk pengguna ${user.user_id}.`);
        
        const productProcessingPromises = userProducts.map(product => 
          supabaseAdmin.functions.invoke('process-single-product', {
            body: { user_id: user.user_id, product_id: product.product_id },
          })
        );

        const results = await Promise.allSettled(productProcessingPromises);
        const discordMessages: string[] = [];

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.data && result.value.data.result) {
            const productResult = result.value.data.result;
            const message = formatMessage(productResult.message, productResult.messageParams);
            discordMessages.push(`${productResult.name}: ${message}`);
          } else if (result.status === 'rejected') {
            console.error(`Error memanggil process-single-product:`, result.reason);
            discordMessages.push(`Error memproses produk: ${result.reason.message || 'Unknown error'}`);
          } else {
            console.error(`Unexpected result structure:`, result);
            discordMessages.push(`Error memproses produk: Respon tidak valid.`);
          }
        }

        // Ambil discord_webhook_url untuk pengguna ini
        const { data: userConfig, error: userConfigError } = await supabaseAdmin
          .from('user_configurations')
          .select('discord_webhook_url')
          .eq('user_id', user.user_id)
          .single();

        if (userConfigError || !userConfig?.discord_webhook_url) {
          console.warn(`[Discord Webhook] Tidak dapat menemukan URL webhook Discord untuk pengguna ${user.user_id}.`);
        } else {
          await sendDiscordNotification(userConfig.discord_webhook_url, discordMessages);
        }

      } else {
        console.log(`Tidak ada produk aktif untuk pengguna ${user.user_id}.`);
      }
    }

    return new Response(JSON.stringify({ message: `Memicu pemrosesan untuk pengguna yang jatuh tempo.` }), {
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