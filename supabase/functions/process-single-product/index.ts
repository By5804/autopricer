import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { create } from "https://deno.land/x/djwt@v3.0.1/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const roundPrice = (price: number) => {
  if (isNaN(price) || price === null) return 0;
  return Math.floor(price / 10) * 10;
}

const getSoldCount = (p: any) => {
  if (!p) return 0;
  return p.total_sold ?? p.item_sold_count ?? p.sold_count ?? p.sold ?? p.total_item_sold ?? 0;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let userId = ''
  let productId = 0
  let productName = 'Unknown Product'
  let isManual = false

  try {
    const body = await req.json()
    userId = body.user_id
    productId = body.product_id
    isManual = body.is_manual === true

    if (!userId || !productId) throw new Error("Missing user_id or product_id")

    const { data: config } = await supabaseAdmin.from('user_configurations').select('*').eq('user_id', userId).maybeSingle()
    const { data: product } = await supabaseAdmin.from('user_products').select('*').eq('user_id', userId).eq('product_id', productId).maybeSingle()

    if (!config || !product) throw new Error("Configuration or Product data not found")

    productName = product.name
    
    const { store_name, whitelist, api_key, secret_key, undercut_amount: globalUndercut } = config
    const { min_price: minPrice, max_price: maxPrice, undercut_amount: prodUndercut, price_war_undercut_amount: warUndercut, rival_store_name: rivalStore } = product

    const normalUndercut = Math.max(10, Number(prodUndercut) || Number(globalUndercut) || 10)
    const priceWarUndercut = Math.max(10, Number(warUndercut) || normalUndercut)
    const whitelistedStores = whitelist ? whitelist.split(',').map((n: string) => n.trim().toLowerCase()) : []

    // 1. Ambil data pasar (Top 50) - Menggunakan use_auto_delivery=1 agar hanya mendeteksi pengiriman instan
    const scrapeUrl = `https://api-gateway.itemku.com/v1/product?game_id=${product.game_id}&item_type_id=${product.item_type_id}&item_info_id=${product.item_info_id}&per_page=50&page=1&sort=cheap&is_enough_stock=1&use_auto_delivery=1`
    console.log("[process-single-product] Scraping market data from URL:", scrapeUrl)
    
    const scrapeRes = await fetch(scrapeUrl)
    if (!scrapeRes.ok) throw new Error(`Scrape API failed: ${scrapeRes.status}`)
    
    const scrapeData = await scrapeRes.json()
    const rawCompetitorList = scrapeData?.data?.data || []
    
    // Filter kembali di level kode untuk memastikan hanya produk pengiriman instan yang diproses
    const competitorList = rawCompetitorList.filter((p: any) => {
      return p.is_auto_delivery === true || 
             p.is_auto_delivery === 1 || 
             p.is_instant_delivery === true || 
             p.is_instant_delivery === 1 ||
             p.is_instant === true ||
             p.is_instant === 1 ||
             p.delivery_type === 'instant' ||
             p.delivery_type === 1;
    });
    
    console.log(`[process-single-product] Found ${competitorList.length} instant delivery products in market for ${productName}`)

    let result: any = { 
      status: 'idle', 
      message: 'logic.waiting', 
      messageParams: {},
      myPrice: null, myStock: null, mySoldCount: 0,
      competitorPrice: null, competitorStoreName: null, competitorStock: null, competitorSoldCount: 0,
      newPrice: null
    }

    // 2. Cari produk saya di list
    const normalizedMyStore = store_name.trim().toLowerCase();
    let myProduct = competitorList.find((p: any) => p.seller?.shop_name?.trim().toLowerCase() === normalizedMyStore)
    
    // 3. Fallback: Ambil data stok saya langsung via ID jika tidak ada di Top 50
    try {
      const directRes = await fetch(`https://api-gateway.itemku.com/v1/product?id=${productId}`)
      if (directRes.ok) {
        const directData = await directRes.json()
        const directInfo = directData?.data?.data?.[0]
        if (directInfo) {
          result.myPrice = directInfo.price
          result.myStock = directInfo.stock
          result.mySoldCount = getSoldCount(directInfo)
          console.log(`[process-single-product] Direct fetch fallback success for ${productName}: Price=${result.myPrice}, Stock=${result.myStock}`)
        }
      }
    } catch (e) {
      console.error("[process-single-product] Direct fetch fallback failed:", e.message)
    }

    // Jika ada di list, gunakan data dari list (lebih akurat untuk posisi)
    if (myProduct) {
      result.myPrice = myProduct.price
      result.myStock = myProduct.stock
      result.mySoldCount = getSoldCount(myProduct)
      console.log(`[process-single-product] Found my product in market list for ${productName}: Price=${result.myPrice}`)
    }

    // Filter toko kita sendiri agar tidak bersaing dengan diri sendiri
    const competitorsOnly = competitorList.filter((p: any) => p.seller?.shop_name?.trim().toLowerCase() !== normalizedMyStore)
    console.log(`[process-single-product] Found ${competitorsOnly.length} competitors (excluding own store) for ${productName}`)

    // Pengecekan jika stok produk kita sendiri kosong (0, null, atau undefined)
    if (result.myStock === 0 || result.myStock === null || result.myStock === undefined) {
      result.status = 'SOLD'
      result.message = 'logic.outOfStock'
      console.log(`[process-single-product] Product ${productName} is out of stock (stock is ${result.myStock}). Skipping price update.`)
    } else if (competitorsOnly.length === 0) {
      // Benar-benar tidak ada penjual lain di pasar
      if (result.myPrice !== null && result.myPrice < maxPrice) {
        result.newPrice = maxPrice
        result.status = 'updated'
        result.message = 'logic.onlySellerSetMax'
        console.log(`[process-single-product] No competitors found. Setting price to maxPrice: ${maxPrice}`)
      } else {
        result.status = 'success'
        result.message = 'logic.onlySellerAtMax'
        console.log(`[process-single-product] No competitors found. Already at maxPrice or price is null.`)
      }
    } else {
      const p1 = competitorsOnly[0]
      
      // Tentukan apakah kita termurah di pasar
      const isCheapest = result.myPrice !== null && result.myPrice < p1.price

      if (isCheapest) {
        // Kita termurah #1, maksimalkan profit terhadap kompetitor terdekat (p1)
        result.competitorPrice = p1.price
        result.competitorStoreName = p1.seller?.shop_name || 'Unknown'
        result.competitorStock = p1.stock
        result.competitorSoldCount = getSoldCount(p1)

        if (p1.price - result.myPrice > normalUndercut + 20) {
          result.newPrice = Math.min(roundPrice(p1.price - normalUndercut), maxPrice)
          result.status = 'updated'
          result.message = 'logic.maximizeProfit'
          result.messageParams = { 
            newPrice: result.newPrice.toLocaleString('id-ID'),
            competitorStoreName: result.competitorStoreName
          }
          console.log(`[process-single-product] We are cheapest. Maximizing profit against ${result.competitorStoreName}. New Price: ${result.newPrice}`)
        } else {
          result.status = 'success'
          result.message = 'logic.cheapestOptimal'
          console.log(`[process-single-product] We are cheapest and price is optimal.`)
        }
      } else {
        // Kita bukan termurah, cari target kompetitor di atas kita untuk di-undercut
        const target = competitorsOnly.find((p: any) => !whitelistedStores.includes(p.seller?.shop_name?.trim().toLowerCase()))
        
        const displayTarget = target || p1
        result.competitorPrice = displayTarget.price
        result.competitorStoreName = displayTarget.seller?.shop_name || 'Unknown'
        result.competitorStock = displayTarget.stock
        result.competitorSoldCount = getSoldCount(displayTarget)

        if (target) {
          const targetName = target.seller?.shop_name?.trim().toLowerCase() || ''
          const isRival = rivalStore && targetName === rivalStore.trim().toLowerCase()
          const currentUndercut = isRival ? priceWarUndercut : normalUndercut
          
          result.newPrice = roundPrice(target.price - currentUndercut)
          result.status = 'updated'
          
          if (isRival) {
            result.message = 'logic.priceWarDetected'
            result.messageParams = { 
              rivalStoreName: target.seller?.shop_name || 'Rival', 
              newPrice: result.newPrice.toLocaleString('id-ID'),
              minPrice: minPrice.toLocaleString('id-ID')
            }
            console.log(`[process-single-product] Price war detected against rival: ${target.seller?.shop_name}. Undercutting to: ${result.newPrice}`)
          } else {
            result.message = 'logic.undercutting'
            result.messageParams = { 
              competitorStoreName: target.seller?.shop_name || 'Competitor', 
              rank: competitorList.indexOf(target) + 1 
            }
            console.log(`[process-single-product] Undercutting competitor: ${target.seller?.shop_name}. New Price: ${result.newPrice}`)
          }
        } else {
          result.status = 'success'
          result.message = 'logic.holdPrice'
          console.log(`[process-single-product] No valid target found (all whitelisted). Holding price.`)
        }
      }
    }

    // Logika Floor (Min Price) & Eksekusi Update
    if (result.status === 'updated' && result.newPrice !== null) {
      if (result.newPrice < minPrice) {
        result.newPrice = minPrice;
        result.status = 'error'; 
        result.message = 'logic.priceWarCooldown';
        result.messageParams = { 
          minPrice: minPrice.toLocaleString('id-ID'),
          rivalStoreName: result.competitorStoreName || 'Market'
        };
        console.log(`[process-single-product] Proposed price ${result.newPrice} is below minPrice ${minPrice}. Capping at minPrice.`)
      }
      
      const nonce = Math.floor(Date.now() / 1000).toString()
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret_key), { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"])
      const token = await create({ alg: "HS256", "X-Api-Key": api_key, Nonce: nonce }, { product_id: product.product_id, new_price: result.newPrice }, key)

      const upRes = await fetch("https://tokoku-gateway.itemku.com/api/product/price/update", {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Api-Key': api_key, 'Nonce': nonce },
        body: JSON.stringify({ product_id: product.product_id, new_price: result.newPrice })
      })
      const upData = await upRes.json().catch(() => ({}))
      
      if (!upData.success) {
        result.status = 'error'
        result.message = 'logic.updateFail'
        result.messageParams = { errorMessage: upData.message || 'API Error' }
        console.error(`[process-single-product] Price update API failed:`, upData)
      } else {
        console.log(`[process-single-product] Price update API success for ${productName} to ${result.newPrice}`)
      }
    }

    // Simpan ke Database
    const dbProposedPrice = (result.status === 'updated' || result.status === 'error') && result.newPrice !== null 
      ? result.newPrice 
      : (result.myPrice !== null ? result.myPrice : product.proposed_price);

    const updateFields: any = {
      last_status: result.status,
      last_message: result.message,
      last_message_params: result.messageParams || {},
      proposed_price: dbProposedPrice,
      last_my_price: result.myPrice !== null ? result.myPrice : product.last_my_price,
      last_my_stock: result.myStock !== null ? result.myStock : product.last_my_stock,
      last_my_sold_count: result.mySoldCount !== null ? result.mySoldCount : product.last_my_sold_count,
      last_competitor_price: result.competitorPrice,
      last_competitor_store_name: result.competitorStoreName,
      last_competitor_stock: result.competitorStock,
      last_competitor_sold_count: result.competitorSoldCount,
      updated_at: new Date().toISOString()
    };

    // Hanya perbarui cron_last_run_at jika ini adalah proses otomatis (bukan manual)
    if (!isManual) {
      updateFields.cron_last_run_at = new Date().toISOString();
    }

    await supabaseAdmin.from('user_products').update(updateFields).eq('id', product.id)

    await supabaseAdmin.from('product_logs').insert({
      user_id: userId,
      product_id: productId,
      log_data: { 
        status: result.status, 
        message: result.message, 
        messageParams: result.messageParams, 
        productName 
      }
    })

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error("[process-single-product] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message, status: 'error' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })
  }
})