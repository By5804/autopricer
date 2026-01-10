import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  "logic.violatesMaxPrice": "Proposed price Rp {{proposedPrice}} is above max price Rp {{maxPrice}}. Holding price.",
  "logic.priceWarDetected": "Price war detected against {{rivalStoreName}}. Dropping price to minimum Rp {{minPrice}}.",
  "logic.priceWarRecovery": "Price war recovery active. Matching P2 price Rp {{newPrice}}.",
  "logic.priceWarCooldown": "Price war cooldown active against {{rivalStoreName}}. Holding minimum price Rp {{minPrice}}.",
};

// formatMessage function (copied from src/utils/translations.ts)
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

interface ProductData {
  user_id: string;
  product_id: number;
  name: string;
  category: string | null;
  minPrice: number;
  maxPrice: number;
  priceUndercutAmount: number | null;
  game_id: number;
  item_type_id: number;
  item_info_group_id: number | null;
  item_info_id: number;
  isActive: boolean;
  rivalStoreName: string | null;
  priceWarCounter: number;
  priceWarLastResetAt: string | null;
}

async function processProductLogic(supabaseAdmin, config, product: ProductData) {
  const { user_id, api_key, secret_key, store_name, whitelist, undercut_amount: globalUndercutAmount } = config;
  const { rivalStoreName, priceWarCounter, priceWarLastResetAt } = product;
  console.log(`[process-single-product] START Processing product: ${product.name} (ID: ${product.product_id}) for user: ${user_id}`);
  const startTime = Date.now();

  // Declare all result-related variables with default values
  let myPrice = null;
  let myStock = null;
  let mySoldCount = null;
  let competitorPrice = null;
  let competitorStoreName = null;
  let competitorStock = null;
  let competitorSoldCount = null;
  let newPrice = null;
  let message = '';
  let messageParams = {};
  let status = 'idle';

  // Price War Tracking variables
  let newPriceWarCounter = priceWarCounter;
  let newPriceWarLastResetAt = priceWarLastResetAt;
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const MAX_UNDERCUTS = 5;
  const now = Date.now();
  const rivalStoreNameLower = rivalStoreName ? rivalStoreName.toLowerCase() : null;
  
  // Check if price war cooldown/tracking window is active
  const isPriceWarActive = priceWarLastResetAt && (now - new Date(priceWarLastResetAt).getTime() < ONE_HOUR_MS);
  const isPriceWarTriggered = priceWarCounter >= MAX_UNDERCUTS;

  try {
    const undercutValue = Math.max(10, Number(product.priceUndercutAmount) || Number(globalUndercutAmount) || 10);
    const whitelistedStores = whitelist 
        ? whitelist.split(',').map(name => name.trim().toLowerCase()) 
        : [];

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

    const competitorResponse = await fetchWithTimeout(url.toString(), {}, 12000);
    console.log(`[process-single-product] ${product.name} - After scrape fetch. Status: ${competitorResponse.status}. Time: ${Date.now() - startTime}ms`);
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
    const competitorList = competitorData?.data?.data || [];
    console.log(`[process-single-product] ${product.name} - After parsing scrape data. Competitors: ${competitorList?.length || 0}. Time: ${Date.now() - startTime}ms`);

    let potentialNewPrice = null;

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
        message = 'logic.outOfStock';
        status = 'error';
        console.log(`[process-single-product] ${product.name} - My product not in top 10.`);
        
        // Reset price war tracking if we are out of the top 10
        newPriceWarCounter = 0;
        newPriceWarLastResetAt = null;

      } else {
        // --- PRICE WAR LOGIC CHECK ---
        const p1 = competitorList[0];
        const p1StoreNameLower = p1?.seller?.shop_name?.toLowerCase();
        const isRivalP1 = rivalStoreNameLower && p1StoreNameLower === rivalStoreNameLower;
        
        // 1. Check for Price War Trigger (5 undercuts in 1 hour)
        if (rivalStoreNameLower && myProductIndex > 0 && isRivalP1) {
            // Rival is P1 and cheaper than us (myProductIndex > 0)
            if (!isPriceWarActive) {
                // Start new tracking window
                newPriceWarCounter = 1;
                newPriceWarLastResetAt = new Date(now).toISOString();
                console.log(`[PriceWar] Started tracking. Counter: 1`);
            } else {
                // Increment counter within the active window
                newPriceWarCounter += 1;
                console.log(`[PriceWar] Incrementing counter. Counter: ${newPriceWarCounter}`);
            }
        } else if (isPriceWarActive && rivalStoreNameLower) {
            // If rival is not P1, but we are still in the tracking window, we don't reset the counter yet.
            // We only reset if the 1 hour window expires or if the war is triggered.
            console.log(`[PriceWar] Rival not P1. Holding counter: ${newPriceWarCounter}`);
        } else {
            // If no rival is set, or tracking window expired without triggering, reset counter
            newPriceWarCounter = 0;
            newPriceWarLastResetAt = null;
        }

        // Re-check trigger status after potential increment
        const isPriceWarTriggeredNow = newPriceWarCounter >= MAX_UNDERCUTS;
        
        // 2. Execute Price War Strategy if Triggered or in Cooldown
        if (isPriceWarTriggeredNow) {
            // Strategy: Drop price to minPrice
            potentialNewPrice = product.minPrice;
            message = 'logic.priceWarDetected';
            messageParams = { rivalStoreName: rivalStoreName, minPrice: product.minPrice };
            status = 'success';
            
            // Ensure the tracking state reflects the triggered status for the cooldown period
            // We keep the counter high and the reset time marks the start of the 1-hour cooldown.
            newPriceWarCounter = MAX_UNDERCUTS; 
            if (!priceWarLastResetAt) {
                newPriceWarLastResetAt = new Date(now).toISOString();
            }
            console.log(`[PriceWar] Triggered! Setting price to minPrice: ${product.minPrice}`);

        } else if (priceWarCounter >= MAX_UNDERCUTS && priceWarLastResetAt) {
            // We were triggered previously, now checking for recovery/cooldown
            const timeSinceTrigger = now - new Date(priceWarLastResetAt).getTime();
            
            if (timeSinceTrigger >= ONE_HOUR_MS) {
                // Recovery time reached (1 hour passed since trigger)
                
                // Find P2 (second cheapest overall)
                const p2 = competitorList[1];
                
                if (p2) {
                    // Recovery Strategy: Chase P2 (match P2's price)
                    potentialNewPrice = p2.price;
                    message = 'logic.priceWarRecovery';
                    messageParams = { newPrice: potentialNewPrice.toLocaleString('id-ID') };
                    
                    // Reset tracking state after recovery
                    newPriceWarCounter = 0;
                    newPriceWarLastResetAt = null;
                    
                    competitorPrice = p2.price;
                    competitorStoreName = p2.seller?.shop_name;
                    competitorStock = p2.stock;
                    competitorSoldCount = p2.order_record?.successful_order_count ?? p2.sold_count ?? 0;
                    
                    console.log(`[PriceWar] Recovery successful. Matching P2 price: ${potentialNewPrice}`);
                } else {
                    // If no P2 exists, revert to standard 'only seller' logic
                    if (myPrice !== null && myPrice < product.maxPrice) {
                        potentialNewPrice = product.maxPrice;
                        message = 'logic.onlySellerSetMax';
                    } else {
                        message = 'logic.onlySellerAtMax';
                    }
                    newPriceWarCounter = 0;
                    newPriceWarLastResetAt = null;
                }
                status = 'success';

            } else {
                // Cooldown period (less than 1 hour since trigger)
                // Strategy: Hold price at minPrice
                if (myPrice !== product.minPrice) {
                    potentialNewPrice = product.minPrice;
                }
                message = 'logic.priceWarCooldown';
                messageParams = { rivalStoreName: rivalStoreName, minPrice: product.minPrice };
                status = 'success';
                console.log(`[PriceWar] Cooldown active. Holding minPrice: ${product.minPrice}`);
            }
        }
        
        // 3. Execute Standard Logic if Price War is not active/triggered
        if (!isPriceWarTriggeredNow && !(priceWarCounter >= MAX_UNDERCUTS && priceWarLastResetAt)) {
            if (myProductIndex === 0) {
                const p2 = competitorList[1];
                if (p2) {
                    competitorPrice = p2.price;
                    competitorStoreName = p2.seller?.shop_name;
                    competitorStock = p2.stock;
                    competitorSoldCount = p2.order_record?.successful_order_count ?? p2.sold_count ?? 0;
                }
                if (!p2) {
                    if (myPrice !== null && myPrice < product.maxPrice) {
                        potentialNewPrice = product.maxPrice;
                        message = 'logic.onlySellerSetMax';
                    } else {
                        message = 'logic.onlySellerAtMax';
                    }
                } else {
                    const priceDiff = p2.price - (myPrice ?? 0);
                    if (priceDiff > (undercutValue + 90)) {
                        let tempPrice = roundPrice(p2.price - undercutValue);
                        tempPrice = Math.min(tempPrice, product.maxPrice);
                        if (myPrice !== null && tempPrice !== myPrice) {
                            potentialNewPrice = tempPrice;
                            message = 'logic.maximizeProfit';
                        } else {
                            message = 'logic.cheapestOptimal';
                        }
                    } else {
                        message = 'logic.cheapestOptimal';
                    }
                }
                status = 'success';
            } else {
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
                status = 'success';
            }
        }


        // --- PRICE VALIDATION AND EXECUTION ---
        if (potentialNewPrice !== null && potentialNewPrice !== myPrice) {
            if (potentialNewPrice < product.minPrice) {
                message = 'logic.violatesMinPrice';
                messageParams = { proposedPrice: potentialNewPrice, minPrice: product.minPrice };
                status = 'error';
                newPrice = null; // Ensure no update happens if min price is violated
            } else if (potentialNewPrice > product.maxPrice) {
                message = 'logic.violatesMaxPrice';
                messageParams = { proposedPrice: potentialNewPrice, maxPrice: product.maxPrice };
                status = 'error';
                newPrice = null; // Ensure no update happens if max price is violated
            } else {
                newPrice = potentialNewPrice;
            }
        }
      }
    }

    console.log(`[process-single-product] ${product.name} - Calculated new price: ${newPrice}, message: ${message}. Price War Counter: ${newPriceWarCounter}. Time: ${Date.now() - startTime}ms`);

    // --- DATABASE UPDATE FOR PRICE WAR TRACKING ---
    const trackingUpdatePayload: { price_war_counter: number; price_war_last_reset_at: string | null } = {
        price_war_counter: newPriceWarCounter,
        price_war_last_reset_at: newPriceWarLastResetAt,
    };

    const { error: trackingUpdateError } = await supabaseAdmin
        .from('user_products')
        .update(trackingUpdatePayload)
        .eq('user_id', user_id)
        .eq('product_id', product.product_id);

    if (trackingUpdateError) {
        console.error(`[process-single-product] Error updating price war tracking for product ${product.product_id}:`, trackingUpdateError);
    } else {
        console.log(`[process-single-product] Successfully updated price war tracking for product ${product.product_id}.`);
    }
    // --- END DATABASE UPDATE ---


    if (newPrice !== null) {
      console.log(`[process-single-product] ${product.name} - Before price update. Time: ${Date.now() - startTime}ms`);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret_key), { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]);
      const nonce = Math.floor(Date.now() / 1000).toString();
      const updatePayload = { product_id: product.product_id, new_price: newPrice };
      const updateUrl = "https://tokoku-gateway.itemku.com/api/product/price/update";
      const token = await create({ alg: "HS256", "X-Api-Key": api_key, Nonce: nonce }, updatePayload, key);

      const updateResponse = await fetchWithTimeout(updateUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Api-Key': api_key, 'Nonce': nonce },
          body: JSON.stringify(updatePayload)
      }, 12000);
      let updateData;
      try {
        updateData = await updateResponse.json();
      } catch (jsonError) {
        throw new Error(`Gagal mengurai respons update sebagai JSON: ${jsonError.message}`);
      }
      console.log(`[process-single-product] ${product.name} - After price update. OK=${updateResponse.ok}, Data=${JSON.stringify(updateData)}. Time: ${Date.now() - startTime}ms`);

      if (updateResponse.ok && updateData.success) {
          status = 'updated';
          message = 'logic.updateSuccess';
          messageParams = { newPrice: newPrice.toLocaleString('id-ID') };
      } else {
          status = 'error';
          message = 'logic.updateFail';
          messageParams = { errorMessage: updateData?.message || `Update gagal dengan status ${updateResponse.status}` };
      }
    }
  } catch (error) {
    console.error(`[process-single-product] Error processing product ${product.name} (ID: ${product.product_id}):`, error);
    status = 'error';
    message = 'logic.scrapeFail';
    messageParams = { errorMessage: error.message };
  } finally {
    const resultPayload = {
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
      status,
    };
    console.log(`[process-single-product] END Processing product: ${product.name} (ID: ${product.product_id}). Total Time: ${Date.now() - startTime}ms`);
    return resultPayload;
  }
});