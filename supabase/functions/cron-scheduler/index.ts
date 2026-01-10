import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const NO_ACTION_MESSAGES = new Set([
  "logic.cheapestOptimal", "logic.onlySellerAtMax", "logic.holdPrice",
  "logic.allCompetitorsTooCheap", "logic.violatesMinPrice", "logic.violatesMaxPrice", "logic.holdAtMax", "logic.priceWarCooldown"
]);

const translations: Record<string, string> = {
  "logic.waiting": "Waiting for process to start.", "logic.checking": "Checking price...",
  "logic.processFailed": "Process failed. Check logs for details.", "logic.noCompetitor": "Error: Could not find any competitors for this product.",
  "logic.outOfStock": "Error: Your product is not in the top 10 (out of stock or uncompetitive).", "logic.onlySellerSetMax": "You are the only seller. Setting price to max.",
  "logic.onlySellerAtMax": "You are the only seller and already at max price.", "logic.maximizeProfit": "Maximizing profit against #2.",
  "logic.cheapestOptimal": "You are the cheapest; price is optimal.", "logic.attackFromMax": "Attacking {{competitorStoreName}} (rank #{{rank}}) from max price.",
  "logic.holdAtMax": "Holding at max price; no valid targets above.", "logic.undercutting": "Undercutting {{competitorStoreName}} (rank #{{rank}}).",
  "logic.undercuttingNewTarget": "P1 is too cheap. Undercutting new target {{competitorStoreName}} (rank #{{rank}}).", "logic.allCompetitorsTooCheap": "All competitors are cheaper than your minimum price. Holding price.",
  "logic.holdPrice": "Holding price; no valid non-whitelisted targets found above.", "logic.matchingWhitelist": "Matching whitelisted leader {{competitorStoreName}}.",
  "logic.opportunisticMax": "P1 is too cheap, P3 is expensive. Setting to max price.", "logic.defendingVsP3": "Defending against {{competitorStoreName}} (rank #3).",
  "logic.noP3SetMax": "P1 is too cheap and no P3 exists. Setting to max price.", "logic.profitMaximizationVsBelow": "Maximizing profit against competitor below you ({{competitorStoreName}}).",
  "logic.updateSuccess": "Price updated successfully to Rp {{newPrice}}.", "logic.updateFail": "Update failed: {{errorMessage}}",
  "logic.scrapeFail": "Scrape failed: {{errorMessage}}", "logic.violatesMinPrice": "Proposed price Rp {{proposedPrice}} is below min price Rp {{minPrice}}. Holding price.",
  "logic.violatesMaxPrice": "Proposed price Rp {{proposedPrice}} is above max price Rp {{maxPrice}}. Holding price.",
  "logic.priceWarDetected": "Price war detected against {{rivalStoreName}}. Dropping price to minimum Rp {{minPrice}}.",
  "logic.priceWarRecovery": "Price war recovery active. Matching P2 price Rp {{newPrice}}.",
  "logic.priceWarCooldown": "Price war cooldown active against {{rivalStoreName}}. Holding minimum price Rp {{minPrice}}.",
};

const formatMessage = (key: string, params?: Record<string, string | number | undefined>): string => {
  let message = translations[key] || key;
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      if (paramValue !== undefined) message = message.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
    });
  }
  return message;
};

async function sendDiscordNotification(webhookUrl: string, messages: string[]) {
  if (!webhookUrl || messages.length === 0) return;
  const description = messages.join('\n');
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta'
  };
  const formattedDateTime = new Intl.DateTimeFormat('id-ID', options).format(now);
  const payload = {
    username: "Itemku Pricer Bot", avatar_url: "https://www.itemku.com/assets/images/favicon.png",
    embeds: [{
      title: `Laporan Otomatisasi Harga - ${formattedDateTime}`, description, color: 3447003, timestamp: now.toISOString(),
    }],
  };
  try {
    const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      console.error(`[Discord Webhook] Gagal mengirim notifikasi: ${response.status} ${response.statusText}`);
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

    const { data: productsToProcess, error } = await supabaseAdmin.rpc('get_due_products');

    if (error) throw error;

    if (!productsToProcess || productsToProcess.length === 0) {
      return new Response(JSON.stringify({ message: "Tidak ada produk yang perlu diproses." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const now = new Date().toISOString();
    const productIdsToUpdate = productsToProcess.map(p => p.product_id);
    const userIdsToUpdate = [...new Set(productsToProcess.map(p => p.user_id))];

    // Perbarui timestamp produk terlebih dahulu
    const { error: productUpdateError } = await supabaseAdmin
      .from('user_products')
      .update({ cron_last_run_at: now })
      .in('product_id', productIdsToUpdate);
    if (productUpdateError) console.error(`Gagal memperbarui timestamp untuk produk:`, productUpdateError);

    // Perbarui timestamp konfigurasi pengguna
    const { error: userUpdateError } = await supabaseAdmin
      .from('user_configurations')
      .update({ cron_last_run_at: now })
      .in('user_id', userIdsToUpdate);
    if (userUpdateError) console.error(`Gagal memperbarui timestamp untuk pengguna:`, userUpdateError);

    const processingPromises = productsToProcess.map(product =>
      supabaseAdmin.functions.invoke('process-single-product', {
        body: { user_id: product.user_id, product_id: product.product_id },
      })
    );

    const results = await Promise.allSettled(processingPromises);
    const notificationsByUser = new Map<string, { webhookUrl: string, messages: string[] }>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const { user_id } = productsToProcess[i];

      if (result.status === 'fulfilled' && result.value.data && result.value.data.result) {
        const productResult = result.value.data.result;
        
        // Exclude messages that indicate no action or optimal price
        const isNoActionMessage = NO_ACTION_MESSAGES.has(productResult.message);

        if (!isNoActionMessage) {
          if (!notificationsByUser.has(user_id)) {
            const { data: config } = await supabaseAdmin.from('user_configurations').select('discord_webhook_url').eq('user_id', user_id).single();
            if (config?.discord_webhook_url) {
              notificationsByUser.set(user_id, { webhookUrl: config.discord_webhook_url, messages: [] });
            }
          }

          const userData = notificationsByUser.get(user_id);
          if (userData) {
            const message = formatMessage(productResult.message, productResult.messageParams);
            const localTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' });
            userData.messages.push(`${localTime}: ${productResult.name}: ${message}`);
          }
        }
      } else if (result.status === 'rejected') {
        console.error(`Error memanggil process-single-product:`, result.reason);
      }
    }

    for (const [_, userData] of notificationsByUser) {
      await sendDiscordNotification(userData.webhookUrl, userData.messages);
    }

    return new Response(JSON.stringify({ message: `Memproses ${productsToProcess.length} produk.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error("Error pada penjadwal:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});