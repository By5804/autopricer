import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const roundPrice = (price: number) => {
  if (isNaN(price) || price === null) return 0;
  return Math.floor(price / 10) * 10;
};

async function fetchWithTimeout(resource: string, options = {}, timeout = 15000) {
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

const getSoldCount = (p: any) => {
  if (!p) return 0;
  return p.total_sold ?? p.item_sold_count ?? p.sold_count ?? p.sold ?? p.total_item_sold ?? 0;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let userId = '';
  let productId = 0;
  let productName = 'Unknown Product';

  try {
    const body = await req.json().catch(() => ({}));
    userId = body.user_id;
    productId = body.product_id;

    if (!userId || !productId) {
      throw new Error("Missing user_id or product_id");
    }

    const { data: config, error: configErr } = await supabaseAdmin.from('user_configurations').select('*').eq('user_id', userId).maybeSingle();
    const { data: product, error: prodErr } = await supabaseAdmin.from('user_products').select('*').eq('user_id', userId).eq('product_id', productId).maybeSingle();

    if (configErr || prodErr) throw new Error(`Database fetch error: ${configErr?.message || prodErr?.message}`);
    if (!config) throw new Error("User configuration not found");
    if (!product) throw new Error(`Product ${productId} not found`);

    productName = product.name;
    console.log(`[process-single-product] Processing: ${productName} (${productId})`);

    const result = await processProductLogic(config, product);
    
    // Update Product Record
    await supabaseAdmin.from('user_products').update({
      last_status: result.status,
      last_message: result.message,
      last_message_params: result.messageParams || {},
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

    // Write Success/Business Error Log
    await supabaseAdmin.from('product_logs').insert({
      user_id: userId,
      product_id: productId,
      log_data: {
        message: result.message,
        messageParams: result.messageParams || {},
        productName: productName,
        status: result.status
      }
    });

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error(`[process-single-product] Error for ${productName}:`, error.message);
    
    if (userId && productId) {
      // Emergency DB Update
      await supabaseAdmin.from('user_products').update({
        last_status: 'error',
        last_message: 'logic.processFailed',
        last_message_params: { errorMessage: error.message },
        updated_at: new Date().toISOString()
      }).eq('user_id', userId).eq('product_id', productId).catch(() => {});

      // Emergency Log Entry
      await supabaseAdmin.from('product_logs').insert({
        user_id: userId,
        product_id: productId,
        log_data: {
          message: 'logic.processFailed',
          messageParams: { errorMessage: error.message },
          productName: productName,
          status: 'error'
        }
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ error: error.message, status: 'error' }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

async function processProductLogic(config: any, product: any) {
  const { store_name, whitelist, api_key, secret_key, undercut_amount: globalUndercutAmount, price_war_trigger_count = 5, price_war_trigger_hours = 1 } = config;
  const { 
    min_price: minPrice, 
    max_price: maxPrice, 
    undercut_amount: prodUndercutAmount,
    price_war_undercut_amount: priceWarUndercutAmount,
    rival_store_name: rivalStoreName,
    price_war_counter: currentCounter = 0,
    price_war_last_reset_at: lastResetAt
  } = product;
  
  let myPrice = null, myStock = null, mySoldCount = null;
  let competitorPrice = null, competitorStoreName = null, competitorStock = null, competitorSoldCount = null;
  let newPrice = null, message = 'logic.waiting', messageParams: any = {}, status = 'idle';
  
  let priceWarCounter = Number(currentCounter) || 0;
  let priceWarLastResetAt = lastResetAt;

  const undercutValue = Math.max(10, Number(prodUndercutAmount) || Number(globalUndercutAmount) || 10);
  const warUndercutValue = Math.max(10, Number(priceWarUndercutAmount) || 50);
  const whitelistedStores = whitelist ? whitelist.split(',').map((name: string) => name.trim().toLowerCase()) : [];

  const scrapeUrl = `https://api-gateway.itemku.com/v1/product?game_id=${product.game_id}&item_type_id=${product.item_type_id}&item_info_id=${product.item_info_id}&per_page=10&page=1&sort=cheap&use_auto_delivery=true&is_enough_stock=1`;
  
  const response = await fetchWithTimeout(scrapeUrl);
  if (!response.ok) throw new Error(`API Itemku Error: ${response.status}`);
  
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
      mySoldCount = getSoldCount(myProduct);
    }

    if (myIndex === -1) {
      message = 'logic.outOfStock';
      status = 'error';
    } else {
      let isWarMode = false;
      const now = new Date();
      const timeLimitMs = (Number(price_war_trigger_hours) || 1) * 60 * 60 * 1000;
      
      let lastResetDate = new Date(priceWarLastResetAt);
      if (isNaN(lastResetDate.getTime())) {
        lastResetDate = new Date(now.getTime() - timeLimitMs);
      }
      
      let wasInWar = priceWarCounter >= (Number(price_war_trigger_count) || 5) && (now.getTime() - lastResetDate.getTime() < timeLimitMs);

      if (rivalStoreName) {
        const rivalProduct = competitorList.find((p: any) => p.seller?.shop_name?.toLowerCase() === rivalStoreName.toLowerCase());
        const rivalIndex = rivalProduct ? competitorList.indexOf(rivalProduct) : -1;

        if (now.getTime() - lastResetDate.getTime() >= timeLimitMs && (rivalIndex === -1 || rivalIndex >= myIndex)) {
          priceWarCounter = 0;
          priceWarLastResetAt = now.toISOString();
          wasInWar = false;
        }

        if (rivalIndex !== -1 && rivalIndex < myIndex) {
          priceWarCounter += 1;
        }

        if (priceWarCounter >= (Number(price_war_trigger_count) || 5) && rivalProduct && rivalIndex < myIndex) {
          isWarMode = true;
          const proposedWarPrice = roundPrice(rivalProduct.price - warUndercutValue);
          newPrice = Math.max(minPrice, proposedWarPrice);
          
          message = 'logic.priceWarDetected';
          messageParams = { 
            rivalStoreName: rivalProduct.seller?.shop_name || rivalStoreName, 
            minPrice: minPrice.toLocaleString('id-ID'),
            newPrice: newPrice.toLocaleString('id-ID')
          };
          status = 'updated'; 
          
          competitorPrice = rivalProduct.price;
          competitorStoreName = rivalProduct.seller?.shop_name;
          competitorStock = rivalProduct.stock;
          competitorSoldCount = getSoldCount(rivalProduct);
        }
      }

      if (!isWarMode) {
        const target = competitorList.find((p: any, i: number) => i < myIndex && !whitelistedStores.includes(p.seller?.shop_name?.toLowerCase()));
        
        if (myIndex === 0) {
          const p2 = competitorList[1];
          if (!p2) {
            if (myPrice < maxPrice) { 
              newPrice = maxPrice; 
              message = 'logic.onlySellerSetMax'; 
            } else { message = 'logic.onlySellerAtMax'; }
          } else {
            competitorPrice = p2.price;
            competitorStoreName = p2.seller?.shop_name;
            competitorStock = p2.stock;
            competitorSoldCount = getSoldCount(p2);

            if (p2.price - myPrice > undercutValue + 20) {
              newPrice = Math.min(roundPrice(p2.price - undercutValue), maxPrice);
              message = wasInWar ? 'logic.priceWarRecovery' : 'logic.maximizeProfit';
              messageParams = { newPrice: (newPrice || myPrice).toLocaleString('id-ID') };
            } else {
              message = wasInWar ? 'logic.priceWarRecovery' : 'logic.cheapestOptimal';
              if (wasInWar) messageParams = { newPrice: (myPrice || 0).toLocaleString('id-ID') };
            }
          }
        } else if (target) {
          newPrice = roundPrice(target.price - undercutValue);
          message = 'logic.undercutting';
          messageParams = { rank: competitorList.indexOf(target) + 1, competitorStoreName: target.seller?.shop_name };
          competitorPrice = target.price;
          competitorStoreName = target.seller?.shop_name;
          competitorStock = target.stock;
          competitorSoldCount = getSoldCount(target);
        } else {
          message = 'logic.holdPrice';
          const p1 = competitorList[0];
          competitorPrice = p1.price;
          competitorStoreName = p1.seller?.shop_name;
          competitorStock = p1.stock;
          competitorSoldCount = getSoldCount(p1);
        }
        status = (newPrice && newPrice !== myPrice) ? 'updated' : 'success';
      }
    }

    if (newPrice !== null && newPrice !== myPrice) {
      if (newPrice < minPrice) {
        message = 'logic.violatesMinPrice';
        messageParams = { proposedPrice: newPrice.toLocaleString('id-ID'), minPrice: minPrice.toLocaleString('id-ID') };
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
        
        const upData = await upRes.json().catch(() => ({}));
        if (upRes.ok && upData.success) {
          status = 'updated';
          if (isWarMode) message = 'logic.priceWarDetected';
          else if (message === 'logic.priceWarRecovery') messageParams = { ...messageParams, newPrice: newPrice.toLocaleString('id-ID') };
          else {
            message = 'logic.updateSuccess';
            messageParams = { ...messageParams, newPrice: newPrice.toLocaleString('id-ID') };
          }
        } else {
          status = 'error';
          message = 'logic.updateFail';
          messageParams = { errorMessage: upData?.message || 'Update failed' };
        }
      }
    }
  }

  return { status, message, messageParams, myPrice, myStock, mySoldCount, newPrice, competitorPrice, competitorStoreName, competitorStock, competitorSoldCount, priceWarCounter, priceWarLastResetAt };
}