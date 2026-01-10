import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const roundPrice = (price: number) => Math.floor(price / 10) * 10;

async function fetchWithTimeout(resource: string, options = {}, timeout = 12000) {
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

  let userId = '';
  let productId = 0;

  try {
    const body = await req.json();
    userId = body.user_id;
    productId = body.product_id;

    const { data: config } = await supabaseAdmin.from('user_configurations').select('*').eq('user_id', userId).single();
    const { data: product } = await supabaseAdmin.from('user_products').select('*').eq('user_id', userId).eq('product_id', productId).single();

    if (!config || !product) throw new Error('Config or Product not found');

    const result = await processProductLogic(supabaseAdmin, config, product);
    
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
      price_war_counter: result.priceWarCounter,
      price_war_last_reset_at: result.priceWarLastResetAt,
      updated_at: new Date().toISOString()
    }).eq('user_id', userId).eq('product_id', productId);

    await supabaseAdmin.from('product_logs').insert({
      user_id: userId,
      product_id: productId,
      log_data: {
        message: result.message,
        messageParams: result.messageParams,
        productName: product.name,
        status: result.status
      }
    });

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error("[process-single-product] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function processProductLogic(supabaseAdmin: any, config: any, product: any) {
  const { store_name, whitelist, undercut_amount: globalUndercutAmount, api_key, secret_key, price_war_trigger_count = 5, price_war_trigger_hours = 1 } = config;
  const { 
    min_price: minPrice, 
    max_price: maxPrice, 
    undercut_amount: prodUndercutAmount,
    rival_store_name: rivalStoreName,
    price_war_counter: currentCounter = 0,
    price_war_last_reset_at: lastResetAt
  } = product;
  
  let myPrice = null, myStock = null, mySoldCount = null;
  let competitorPrice = null, competitorStoreName = null, competitorStock = null, competitorSoldCount = null;
  let newPrice = null, message = 'logic.waiting', messageParams = {}, status = 'idle';
  
  let priceWarCounter = currentCounter;
  let priceWarLastResetAt = lastResetAt;

  const undercutValue = Math.max(10, Number(prodUndercutAmount) || Number(globalUndercutAmount) || 10);
  const whitelistedStores = whitelist ? whitelist.split(',').map((name: string) => name.trim().toLowerCase()) : [];

  const scrapeUrl = `https://api-gateway.itemku.com/v1/product?game_id=${product.game_id}&item_type_id=${product.item_type_id}&item_info_id=${product.item_info_id}&per_page=10&page=1&sort=cheap&use_auto_delivery=true&is_enough_stock=1`;
  const response = await fetchWithTimeout(scrapeUrl, {}, 12000);
  const data = await response.json();
  const competitorList = data?.data?.data || [];

  if (competitorList.length === 0) {
    message = 'logic.noCompetitor';
    status = 'error';
  } else {
    const myProduct = competitorList.find((p: any) => p.seller?.shop_name?.toLowerCase() === store_name.toLowerCase());
    const myIndex = myProduct ? competitorList.indexOf(myProduct) : -1;

    if (myProduct) {
      myPrice = myProduct.price;
      myStock = myProduct.stock;
      // Perbaikan pengambilan sold count dengan mencari di semua field yang mungkin digunakan Itemku
      mySoldCount = myProduct.total_sold !== undefined ? myProduct.total_sold : 
                   (myProduct.sold_count !== undefined ? myProduct.sold_count : 
                   (myProduct.item_sold_count !== undefined ? myProduct.item_sold_count : 
                   (myProduct.total_item_sold !== undefined ? myProduct.total_item_sold : 0)));
    }

    if (myIndex === -1) {
      message = 'logic.outOfStock';
      status = 'error';
    } else {
      // Deteksi Underpricecut / Perang Harga dengan ambang batas dinamis
      if (rivalStoreName) {
        const rivalProduct = competitorList.find((p: any) => p.seller?.shop_name?.toLowerCase() === rivalStoreName.toLowerCase());
        const rivalIndex = rivalProduct ? competitorList.indexOf(rivalProduct) : -1;
        
        const now = new Date();
        const timeLimitMs = price_war_trigger_hours * 60 * 60 * 1000;
        const lastReset = priceWarLastResetAt ? new Date(priceWarLastResetAt) : new Date(now.getTime() - timeLimitMs);

        // Reset counter jika jendela waktu sudah lewat
        if (now.getTime() - lastReset.getTime() >= timeLimitMs) {
          priceWarCounter = 0;
          priceWarLastResetAt = now.toISOString();
        }

        // Jika rival lebih murah dari saya, tambah counter
        if (rivalIndex !== -1 && rivalIndex < myIndex) {
          priceWarCounter += 1;
        }

        // Jika counter mencapai ambang batas, aktifkan mode perang
        if (priceWarCounter >= price_war_trigger_count) {
          newPrice = minPrice;
          message = 'logic.priceWarDetected';
          messageParams = { rivalStoreName, minPrice: minPrice.toLocaleString('id-ID') };
          status = 'updated'; 
        }
      }

      if (status !== 'updated') {
        const target = competitorList.find((p: any, i: number) => i < myIndex && !whitelistedStores.includes(p.seller?.shop_name?.toLowerCase()));
        
        if (myIndex === 0) {
          const p2 = competitorList[1];
          if (!p2) {
            if (myPrice < maxPrice) { newPrice = maxPrice; message = 'logic.onlySellerSetMax'; }
            else message = 'logic.onlySellerAtMax';
          } else {
            competitorPrice = p2.price;
            competitorStoreName = p2.seller?.shop_name;
            competitorStock = p2.stock;
            competitorSoldCount = p2.total_sold ?? p2.sold_count ?? 0;

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
          competitorSoldCount = target.total_sold ?? target.sold_count ?? 0;
        } else {
          message = 'logic.holdPrice';
          const p1 = competitorList[0];
          competitorPrice = p1.price;
          competitorStoreName = p1.seller?.shop_name;
          competitorStock = p1.stock;
          competitorSoldCount = p1.total_sold ?? p1.sold_count ?? 0;
        }
        status = 'success';
      }
    }

    if (newPrice !== null && newPrice !== myPrice) {
      if (newPrice < minPrice) {
        message = 'logic.violatesMinPrice';
        messageParams = { proposedPrice: newPrice, minPrice: minPrice };
        status = 'error';
        newPrice = null;
      } else {
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
          message = (message === 'logic.priceWarDetected') ? message : 'logic.updateSuccess';
          messageParams = { ...messageParams, newPrice: newPrice.toLocaleString('id-ID') };
        } else {
          status = 'error';
          message = 'logic.updateFail';
          messageParams = { errorMessage: upData.message || 'Update failed' };
        }
      }
    }
  }

  return { status, message, messageParams, myPrice, myStock, mySoldCount, newPrice, competitorPrice, competitorStoreName, competitorStock, competitorSoldCount, priceWarCounter, priceWarLastResetAt };
}