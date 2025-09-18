import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to round price to nearest 10
const roundPrice = (price) => Math.floor(price / 10) * 10;

async function processProductLogic(supabaseAdmin, config, product) {
  const { user_id, api_key, secret_key, store_name, whitelist, undercut_amount: globalUndercutAmount } = config;
  console.log(`[process-single-product] Processing product: ${product.name} (ID: ${product.product_id}) for user: ${user_id}`);

  let resultPayload;
  const undercutValue = Math.max(10, Number(product.priceUndercutAmount) || Number(globalUndercutAmount) || 10);
  const whitelistedStores = whitelist 
      ? whitelist.split(',').map(name => name.trim().toLowerCase()) 
      : [];

  let myPrice = undefined; // Initialize to undefined
  let myStock = undefined; // Initialize to undefined
  let mySoldCount = undefined; // Initialize to undefined
  let competitorPrice = undefined; // Initialize to undefined
  let competitorStoreName = undefined; // Initialize to undefined
  let competitorStock = undefined; // Initialize to undefined
  let competitorSoldCount = undefined; // Initialize to undefined
  let newPrice = null;
  let potentialNewPrice = null;
  let message = 'logic.waiting'; // Default message
  let messageParams = {};
  let status: 'idle' | 'loading' | 'success' | 'error' | 'updated' = 'idle';

  try {
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
    console.log(`[process-single-product] Scraping URL: ${url.toString()}`);

    const competitorResponse = await fetch(url.toString());
    console.log(`[process-single-product] Scrape response status for ${product.name}: ${competitorResponse.status}`);
    if (!competitorResponse.ok) {
      const errorData = await competitorResponse.json().catch(() => ({ message: `Scrape gagal dengan status ${competitorResponse.status}` }));
      throw new Error(errorData.message);
    }
    const competitorData = await competitorResponse.json();
    const competitorList = competitorData.data.data;
    console.log(`[process-single-product] Competitor list length for ${product.name}: ${competitorList?.length || 0}`);

    if (!Array.isArray(competitorList) || competitorList.length === 0) {
      message = 'logic.noCompetitor';
      status = 'error';
      console.log(`[process-single-product] No competitor found for ${product.name}.`);
    } else {
      const myProductIndex = competitorList.findIndex(p => p.seller?.shop_name?.toLowerCase() === store_name.toLowerCase());
      console.log(`[process-single-product] My product index for ${product.name}: ${myProductIndex}`);

      // Always try to get P1 competitor data if list is not empty
      const p1 = competitorList[0];
      if (p1) {
          competitorPrice = p1.price;
          competitorStoreName = p1.seller?.shop_name;
          competitorStock = p1.stock;
          competitorSoldCount = p1.order_record?.successful_order_count ?? p1.sold_count ?? 0;
      }

      if (myProductIndex === -1) {
        message = 'logic.outOfStock';
        status = 'error';
        console.log(`[process-single-product] My product not in top 10 for ${product.name}.`);
        // My product data (myPrice, myStock, mySoldCount) cannot be determined from this top 10 scrape.
        // It will remain undefined.
      } else {
        const myProductData = competitorList[myProductIndex];
        myPrice = myProductData.price;
        myStock = myProductData.stock;
        mySoldCount = myProductData.order_record?.successful_order_count ?? myProductData.sold_count ?? 0;
        status = 'success'; // Default status if in top 10

        if (myProductIndex === 0) {
            const p2 = competitorList[1];
            if (!p2) { // Only seller
                if (myProductData.price < product.maxPrice) {
                    potentialNewPrice = product.maxPrice;
                    message = 'logic.onlySellerSetMax';
                } else {
                    message = 'logic.onlySellerAtMax';
                }
            } else { // Cheapest, but there's a P2
                const priceDiff = p2.price - myProductData.price;
                if (priceDiff > (undercutValue + 90)) { // Significant gap, maximize profit
                    let tempPrice = roundPrice(p2.price - undercutValue);
                    tempPrice = Math.min(tempPrice, product.maxPrice);
                    if (tempPrice !== myProductData.price) {
                        potentialNewPrice = tempPrice;
                        message = 'logic.maximizeProfit';
                    } else {
                        message = 'logic.cheapestOptimal';
                    }
                } else { // Optimal price, no need to change
                    message = 'logic.cheapestOptimal';
                }
            }
        } else { // Not the cheapest
            const target = competitorList.find((p, i) => i < myProductIndex && !whitelistedStores.includes(p.seller?.shop_name?.toLowerCase()));
            if (target) { // Found a non-whitelisted target above
                potentialNewPrice = roundPrice(target.price - undercutValue);
                message = 'logic.undercutting';
                messageParams = { rank: competitorList.indexOf(target) + 1, competitorStoreName: target.seller?.shop_name };
                // Update competitor data to target if different from P1
                if (target !== p1) {
                    competitorPrice = target.price;
                    competitorStoreName = target.seller?.shop_name;
                    competitorStock = target.stock;
                    competitorSoldCount = target.order_record?.successful_order_count ?? target.sold_count ?? 0;
                }
            } else { // No non-whitelisted target above (all whitelisted or too cheap)
                message = 'logic.holdPrice'; // Default to hold price
            }
        }
      }
    }

    if (potentialNewPrice !== null && potentialNewPrice !== myPrice) { // Compare with myPrice, not myProductData.price
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
    console.log(`[process-single-product] Calculated new price for ${product.name}: ${newPrice}, message: ${message}`);

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
      status: newPrice !== null ? 'updated' : status // If newPrice is set, status is 'updated', otherwise use calculated status
    };

    if (newPrice !== null) {
      console.log(`[process-single-product] Attempting to update price for ${product.name} to ${newPrice}`);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret_key), { name: "HMAC", hash: "SHA-265" }, false, ["sign"]);
      const nonce = Math.floor(Date.now() / 1000).toString();
      const updatePayload = { product_id: product.product_id, new_price: newPrice };
      const updateUrl = "https://tokoku-gateway.itemku.com/api/product/price/update";
      const token = await create({ alg: "HS256", "X-Api-Key": api_key, Nonce: nonce }, updatePayload, key);

      const updateResponse = await fetch(updateUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Api-Key': api_key, 'Nonce': nonce },
          body: JSON.stringify(updatePayload)
      });
      const updateData = await updateResponse.json();
      console.log(`[process-single-product] Price update response for ${product.name}: OK=${updateResponse.ok}, Data=${JSON.stringify(updateData)}`);

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
    console.log(`[process-single-product] Final result payload for ${product.name}: ${JSON.stringify(resultPayload)}`);
    return resultPayload;
  }
}