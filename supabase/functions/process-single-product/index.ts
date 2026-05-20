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

  try {
    const body = await req.json()
    userId = body.user_id
    productId = body.product_id

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

    // 1. Ambil data pasar (Top 50)
    const scrapeRes = await fetch(`https://api-gateway.itemku.com/v1/product?game_id=${product.game_id}&item_type_id=${product.item_type_id}&item_info_id=${product.item_info_id}&per_page=50&page=1&sort=cheap&use_auto_delivery=true&is_enough_stock=1`)
    if (!scrapeRes.ok) throw new Error(`Scrape API failed: ${scrapeRes.status}`)
    
    const scrapeData = await scrapeRes.json()
    const competitorList = scrapeData?.data?.data || []

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
    }

    // Filter toko kita sendiri agar tidak bersaing dengan diri sendiri
    const competitorsOnly = competitorList.filter((p: any) => p.seller?.shop_name?.trim().toLowerCase() !== normalizedMyStore)

    if (competitorsOnly.length === 0) {
      // Benar-benar tidak ada penjual lain di pasar
      if (result.myPrice !== null && result.myPrice < maxPrice) {
        result.newPrice = maxPrice
        result.status = 'updated'
        result.message = 'logic.onlySellerSetMax'
      } else {
        result.status = 'success'
        result.message = 'logic.onlySellerAtMax'
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
        } else {
          result.status = 'success'
          result.message = 'logic.cheapestOptimal'
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
          } else {
            result.message = 'logic.undercutting'
            result.messageParams = { 
              competitorStoreName: target.seller?.shop_name || 'Competitor', 
              rank: competitorList.indexOf(target) + 1 
            }
          }
        } else {
          result.status = 'success'
          result.message = 'logic.holdPrice'
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
      }
    }

    // Simpan ke Database
    const dbProposedPrice = (result.status === 'updated' || result.status === 'error') && result.newPrice !== null 
      ? result.newPrice 
      : (result.myPrice !== null ? result.myPrice : product.proposed_price);

    await supabaseAdmin.from('user_products').update({
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
      cron_last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', product.id)

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