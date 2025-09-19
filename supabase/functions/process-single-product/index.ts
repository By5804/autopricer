import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to round price to nearest 10
const roundPrice = (price) => Math.floor(price / 10) * 10;

// Helper function to fetch with a timeout
async function fetchWithTimeout(resource, options = {}, timeout = 12000) { // 12 seconds timeout
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Fetch aborted due to timeout after ${timeout / 1000} seconds.`);
    }
    throw error;
  }
}

async function processProductLogic(supabaseAdmin, config, product) {
  const { user_id, api_key, secret_key, store_name, whitelist, undercut_amount: globalUndercutAmount } = config;
  console.log(`[process-single-product] START Processing product: ${product.name} (ID: ${product.product_id}) for user: ${user_id}`);
  const startTime = Date.now();

  let resultPayload;
  const undercutValue = Math.max(10, Number(product.priceUndercutAmount) || Number(globalUndercutAmount) || 10);
  const whitelistedStores = whitelist 
      ? whitelist.split(',').map(name => name.trim().toLowerCase()) 
      : [];

  try {
    // Validate API keys
    if (!api_key || !secret_key) {
      throw new Error('API Key or Secret Key is missing in user configuration.');
    }

    const scrapeUrl = "https://api-gateway.itemku.com/v1/product";
    const scrapeParams = {
        is_include_game: '1', is_include_item_type: '1', is_include_item_info_group: '1',
        is_include_order_record: '1', is_include_upselling_product: '1', use_simple_pagination: '1', per_page: '10',
        page: '1', sort: 'cheap', is_default_product_list: '1', is_auto_delivery_first: '1',
        is_with_promotion: '1', is_enough_stock: '1', "country_codes[]": 'ID',
        game_id: product.game_id, item_type_id: product.item_type_id,
        item_info_id: product.item_info_id,
        is_exclusive:'false',
        is_include_instant_delivery:'true',
        use_auto_delivery:'true',
        ...(product.item_info_group_id && { item_info_group_id: product.item_info_group_id }),
    };
    
    const url = new URL(scrapeUrl);
    const stringifiedParams = Object.fromEntries(
      Object.entries(scrapeParams).map(([key, value]) => [key, String(value)])
    );
    url.search = new URLSearchParams(stringifiedParams).toString();
    console.log(`[process-single-product] ${product.name} - Before scrape fetch. Time: ${Date.now() - startTime}ms`);

    const competitorResponse = await fetchWithTimeout(url.toString(), {}, 12000); // 12 seconds timeout
    console.log(`[process-single-product] ${product.name} - After scrape fetch. Status: ${competpetitorResponse.status}. Time: ${Date.now() - startTime}ms`);
    if (!competitorResponse.ok) {
      let errorData = { message: `Scrape gagal dengan status ${competitorResponse.status}` };
      try {
        errorData = await competitorResponse.json();
      } catch (jsonError) {
        console.warn(`[process-single-product] ${product.name} - Gagal mengurai respons error scrape sebagai JSON: ${jsonError.message}`);
      }
      throw new Error(errorData.message);
    }
    let competitorData;
    try {
      competitorData = await competitorResponse.json();
    } catch (jsonError) {
      throw new Error(`Gagal mengurai respons scrape sebagai JSON: ${jsonError.message}`);
    }
    // Ensure competitorList is an array
    const competitorList = competitorData?.data?.data || [];
    console.log(`[process-single-product] ${product.name} - After parsing scrape data. Competitors: ${competitorList?.length || 0}. Time: ${Date.now() - startTime}ms`);

    // Initialize my product data with nulls
    let myPrice = null;
    let myStock = null;
    let mySoldCount = null;
    let competitorPrice = null;
    let competitorStoreName = null;
    let competitorStock = null;
    let competitorSoldCount = null;

    let newPrice = null;
    let potentialNewPrice = null;
    let message = '';
    let messageParams = {};
    let status: ProductStatus['status'] = 'idle'; // Default status

    if (!Array.isArray(competitorList) || competitorList.length === 0) {
      message = 'logic.noCompetitor';
      status = 'error';
      console.log(`[process-single-product] ${product.name} - No competitor found.`);
    } else {
      const myProductDataInList = competitorList.find(p => p.seller?.shop_name?.toLowerCase() === store_name.toLowerCase());
      const myProductIndex = myProductDataInList ? competitorList.indexOf(myProductDataInList) : -1;
      console.log(`[process-single-product] ${product.name} - My product index: ${myProductIndex}. Time: ${Date.now() - startTime}ms`);

      if (myProductDataInList) {
        myPrice = myProductDataInList.price;
        myStock = myProductDataInList.stock;
        mySoldCount = myProductDataInList.order_record?.successful_order_count ?? myProductDataInList.sold_count ?? 0;
      }

      if (myProductIndex === -1) {
        // My product is not in the top 10.
        message = 'logic.outOfStock';
        status = 'error';
        console.log(`[process-single-product] ${product.name} - My product not in top 10.`);
        // No price update logic here, as it's out of top 10.
      } else if (myProductIndex === 0) {
          // Existing logic for being the cheapest
          const p2 = competitorList[1];
          if (p2) {
              competitorPrice = p2.price;
              competitorStoreName = p2.seller?.shop_name;
              competitorStock = p2.stock;
              competitorSoldCount = p2.order_record?.successful_order_count ?? p2.sold_count ?? 0;
          }
          if (!p2) {
              if (myPrice !== null && myPrice < product.maxPrice) { // Use myPrice here
                  potentialNewPrice = product.maxPrice;
                  message = 'logic.onlySellerSetMax';
              } else {
                  message = 'logic.onlySellerAtMax';
              }
          } else {
              const priceDiff = p2.price - (myPrice ?? 0); // Use myPrice here, handle null
              if (priceDiff > (undercutValue + 90)) {
                  let tempPrice = roundPrice(p2.price - undercutValue);
                  tempPrice = Math.min(tempPrice, product.maxPrice);
                  if (myPrice !== null && tempPrice !== myPrice) { // Use myPrice here
                      potentialNewPrice = tempPrice;
                      message = 'logic.maximizeProfit';
                  } else {
                      message = 'logic.cheapestOptimal';
                  }
              } else {
                  message = 'logic.cheapestOptimal';
              }
          }
          status = 'success'; // Default to success if logic runs
      } else {
          // Existing logic for not being the cheapest
          const target = competitorList.find((p, i) => i < myProductIndex && !whitelistedStores.includes(p.seller?.shop_name?.toLowerCase()));
          if (target) {
              potentialNewPrice = roundPrice(target.price - undercutValue);
              message = 'logic.undercutting';
              messageParams = { rank: competitorList.indexOf(target) + 1, competitorStoreName: target.seller?.shop_name };
              competitorPrice = target.price;
              competitorStoreName = target.seller?.shop_name;
              competitorStock = target.stock;
              competitorSoldCount = target.order_record?.successful_order_count ?? target.sold_count ?? 0;
          } else {
              const p1 = competitorList[0];
              competitorPrice = p1.price;
              competitorStoreName = p1.seller?.shop_name;
              competitorStock = p1.stock;
              competitorSoldCount = p1.order_record?.successful_order_count ?? p1.sold_count ?? 0;
              message = 'logic.holdPrice';
          }
          status = 'success'; // Default to success if logic runs
      }

      // Price validation and update logic
      if (potentialNewPrice !== null && potentialNewPrice !== myPrice) {
          if (potentialNewPrice < product.minPrice) {
              message = 'logic.violatesMinPrice';
              messageParams = { proposedPrice: potentialNewPrice, minPrice: product.minPrice };
              potentialNewPrice = null;
              status = 'error'; // Set status to error if price violates min
          } else if (potentialNewPrice > product.maxPrice) {
              message = 'logic.violatesMaxPrice';
              messageParams = { proposedPrice: potentialNewPrice, maxPrice: product.maxPrice };
              potentialNewPrice = null;
              status = 'error'; // Set status to error if price violates max
          } else {
              newPrice = potentialNewPrice;
          }
      }
    } // End of else (if competitorList is not empty)

    console.log(`[process-single-product] ${product.name} - Calculated new price: ${newPrice}, message: ${message}. Time: ${Date.now() - startTime}ms`);

    resultPayload = { 
      ...product, 
      myPrice, 
      myStock,
      mySoldCount,
      competitorPrice, 
      competitorStoreName, 
      competitorStock, 
      competitorSoldCount,
      newPrice, 
      message, 
      messageParams, 
      status: status // Use the determined status
    };

    if (newPrice !== null) {
      console.log(`[process-single-product] ${product.name} - Before price update. Time: ${Date.now() - startTime}ms`);
      const key = await crypto.subtle.importKey(
        "raw", 
        new TextEncoder().encode(secret_key), 
        { name: "HMAC", hash: { name: "SHA-256" } }, 
        false, 
        ["sign"]
      );
      const nonce = Math.floor(Date.now() / 1000).toString();
      const updatePayload = { product_id: product.product_id, new_price: newPrice };
      const updateUrl = "https://tokoku-gateway.itemku.com/api/product/price/update";
      const token = await create({ alg: "HS256", "X-Api-Key": api_key, Nonce: nonce }, updatePayload, key);

      const updateResponse = await fetchWithTimeout(updateUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Api-Key': api_key, 'Nonce': nonce },
          body: JSON.stringify(updatePayload)
      }, 12000); // 12 seconds timeout
      let updateData;
      try {
        updateData = await updateResponse.json();
      } catch (jsonError) {
        throw new Error(`Gagal mengurai respons update sebagai JSON: ${jsonError.message}`);
      }
      console.log(`[process-single-product] ${product.name} - After price update. OK=${updateResponse.ok}, Data=${JSON.stringify(updateData)}. Time: ${Date.now() - startTime}ms`);

      if (updateResponse.ok && updateData.success) {
          resultPayload = { ...resultPayload, status: 'updated', message: 'logic.updateSuccess', messageParams: { newPrice: newPrice.toLocaleString('id-ID') } };
      } else {
          resultPayload = { ...resultPayload, status: 'error', message: 'logic.updateFail', messageParams: { errorMessage: updateData?.message || `Update gagal dengan status ${updateResponse.status}` } };
      }
    }
  } catch (error) {
    console.error(`[process-single-product] Error processing product ${product.name} (ID: ${product.product_id}):`, error);
    resultPayload = { ...product, status: 'error', message: 'logic.scrapeFail', messageParams: { errorMessage: error.message } };
  } finally {
    console.log(`[process-single-product] END Processing product: ${product.name} (ID: ${product.product_id}). Total Time: ${Date.now() - startTime}ms`);
    return resultPayload;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { user_id, product_id } = await req.json();
    console.log(`[process-single-product] Received request for user_id: ${user_id}, product_id: ${product_id}`);

    if (!user_id || !product_id) {
      return new Response(JSON.stringify({ error: 'user_id dan product_id diperlukan' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: config, error: configError } = await supabaseAdmin.from('user_configurations').select('*').eq('user_id', user_id).single();

    if (configError || !config) {
      console.error(`[process-single-product] Configuration not found for user ${user_id}:`, configError);
      return new Response(JSON.stringify({ error: `Konfigurasi tidak ditemukan untuk pengguna ${user_id}` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log(`[process-single-product] Configuration found for user ${user_id}.`);

    const { data: productData, error: productDataError } = await supabaseAdmin
      .from('user_products')
      .select('*')
      .eq('user_id', user_id)
      .eq('product_id', product_id)
      .single();

    if (productDataError || !productData) {
      console.error(`[process-single-product] Product ${product_id} not found for user ${user_id}:`, productDataError);
      return new Response(JSON.stringify({ error: `Produk ${product_id} tidak ditemukan untuk pengguna ${user_id}` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log(`[process-single-product] Product data found for product ${product_id}.`);

    const result = await processProductLogic(supabaseAdmin, config, {
      name: productData.name,
      category: productData.category,
      product_id: productData.product_id,
      minPrice: productData.min_price,
      maxPrice: productData.max_price,
      priceUndercutAmount: productData.undercut_amount,
      game_id: productData.game_id,
      item_type_id: productData.item_type_id,
      item_info_group_id: productData.item_info_group_id,
      item_info_id: productData.item_info_id,
      isActive: productData.is_active,
    });

    // Insert log for the single product process
    const { error: logError } = await supabaseAdmin.from('product_logs').insert({ user_id, product_id: result.product_id, log_data: result });
    if (logError) console.error(`[process-single-product] Error inserting log for product ${result.product_id}:`, logError);
    else console.log(`[process-single-product] Successfully inserted log for product ${result.product_id}.`);

    console.log(`[process-single-product] Process completed for product ${product_id} of user ${user_id}`);
    return new Response(JSON.stringify({ message: `Proses selesai untuk produk ${product_id}`, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[process-single-product] Error in main serve block:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});