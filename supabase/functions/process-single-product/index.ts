import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const roundPrice = (price) => Math.floor(price / 10) * 10;

async function fetchWithTimeout(resource, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const { user_id, product_id } = await req.json();

    const { data: config } = await supabaseAdmin.from('user_configurations').select('*').eq('user_id', user_id).single();
    const { data: product } = await supabaseAdmin.from('user_products').select('*').eq('user_id', user_id).eq('product_id', product_id).single();

    if (!config || !product) throw new Error('Config or Product not found');

    const result = await processProductLogic(supabaseAdmin, config, product);
    
    // Save everything including stock/sold info
    await supabaseAdmin.from('user_products').update({
      last_status: result.status,
      last_message: result.message,
      last_message_params: result.messageParams,
      proposed_price: result.newPrice,
      last_my_price: result.myPrice,
      last_my_stock: result.myStock,
      last_my_sold_count: result.mySoldCount,
      last_competitor_price: result.competitorPrice,
      last_competitor_store_name: result.competitorStoreName,
      last_competitor_stock: result.competitorStock,
      last_competitor_sold_count: result.competitorSoldCount,
      updated_at: new Date().toISOString()
    }).eq('user_id', user_id).eq('product_id', product_id);

    // Activity logging
    await supabaseAdmin.from('product_logs').insert({
      user_id: user_id,
      product_id: product_id,
      log_data: {
        message: result.message,
        messageParams: result.messageParams,
        productName: product.name,
        status: result.status
      }
    });

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function processProductLogic(supabaseAdmin, config, product) {
  const { store_name, whitelist, undercut_amount: globalUndercutAmount, api_key, secret_key } = config;
  const { min_price: minPrice, max_price: maxPrice, undercut_amount: prodUndercutAmount } = product;
  
  let myPrice = null, myStock = null, mySoldCount = null;
  let competitorPrice = null, competitorStoreName = null, competitorStock = null, competitorSoldCount = null;
  let newPrice = null, message = 'logic.waiting', messageParams = {}, status = 'idle';

  try {
    const undercutValue = Math.max(10, Number(prodUndercutAmount) || Number(globalUndercutAmount) || 10);
    const whitelistedStores = whitelist ? whitelist.split(',').map(name => name.trim().toLowerCase()) : [];

    const scrapeUrl = `https://api-gateway.itemku.com/v1/product?game_id=${product.game_id}&item_type_id=${product.item_type_id}&item_info_id=${product.item_info_id}&per_page=10&page=1&sort=cheap&use_auto_delivery=true&is_enough_stock=1`;
    const response = await fetchWithTimeout(scrapeUrl, {}, 12000);
    const data = await response.json();
    const competitorList = data?.data?.data || [];

    if (competitorList.length === 0) {
      message = 'logic.noCompetitor';
      status = 'error';
    } else {
      const myProduct = competitorList.find(p => p.seller?.shop_name?.toLowerCase() === store_name.toLowerCase());
      const myIndex = myProduct ? competitorList.indexOf(myProduct) : -1;

      if (myProduct) {
        myPrice = myProduct.price;
        myStock = myProduct.stock;
        mySoldCount = myProduct.total_sold;
      }

      if (myIndex === -1) {
        message = 'logic.outOfStock';
        status = 'error';
      } else {
        // Find best competitor to undercut
        const target = competitorList.find((p, i) => i < myIndex && !whitelistedStores.includes(p.seller?.shop_name?.toLowerCase()));
        
        if (myIndex === 0) {
          const p2 = competitorList[1];
          if (!p2) {
            if (myPrice < maxPrice) { newPrice = maxPrice; message = 'logic.onlySellerSetMax'; }
            else message = 'logic.onlySellerAtMax';
          } else {
            if (p2.price - myPrice > undercutValue + 90) {
              newPrice = Math.min(roundPrice(p2.price - undercutValue), maxPrice);
              message = 'logic.maximizeProfit';
            } else message = 'logic.cheapestOptimal';
          }
        } else if (target) {
          newPrice = roundPrice(target.price - undercutValue);
          message = 'logic.undercutting';
          messageParams = { rank: competitorList.indexOf(target) + 1, competitorStoreName: target.seller?.shop_name };
          competitorPrice = target.price;
          competitorStoreName = target.seller?.shop_name;
          competitorStock = target.stock;
          competitorSoldCount = target.total_sold;
        } else {
          message = 'logic.holdPrice';
        }
        status = 'success';
      }

      if (newPrice !== null && newPrice !== myPrice) {
        if (newPrice < minPrice) {
          message = 'logic.violatesMinPrice';
          messageParams = { proposedPrice: newPrice, minPrice: minPrice };
          status = 'error';
          newPrice = null;
        } else {
          // Auth for update
          const nonce = Math.floor(Date.now() / 1000).toString();
          const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret_key), { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
          const token = await create({ alg: "HS256", "X-Api-Key": api_key, Nonce: nonce }, { product_id: product.product_id, new_price: newPrice }, key);

          const upRes = await fetch("https://tokoku-gateway.itemku.com/api/product/price/update", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Api-Key': api_key, 'Nonce': nonce },
            body: JSON.stringify({ product_id: product.product_id, new_price: newPrice })
          });
          const upData = await upRes.json();
          if (upRes.ok && upData.success) {
            status = 'updated';
            message = 'logic.updateSuccess';
            messageParams = { newPrice: newPrice.toLocaleString('id-ID') };
          } else {
            status = 'error';
            message = 'logic.updateFail';
            messageParams = { errorMessage: upData.message || 'Update failed' };
          }
        }
      }
    }
  } catch (e) {
    status = 'error'; message = 'logic.scrapeFail'; messageParams = { errorMessage: e.message };
  }

  return { status, message, messageParams, myPrice, myStock, mySoldCount, newPrice, competitorPrice, competitorStoreName, competitorStock, competitorSoldCount };
}