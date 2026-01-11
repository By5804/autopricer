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

serve(async (req) => {
  // Selalu tangani OPTIONS untuk CORS
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

    if (!userId || !productId) {
      throw new Error("Missing user_id or product_id")
    }

    // Ambil data produk & konfigurasi
    const { data: config } = await supabaseAdmin.from('user_configurations').select('*').eq('user_id', userId).maybeSingle()
    const { data: product } = await supabaseAdmin.from('user_products').select('*').eq('user_id', userId).eq('product_id', productId).maybeSingle()

    if (!config || !product) {
      throw new Error("Configuration or Product data not found")
    }

    productName = product.name
    console.log(`[process-single-product] Processing: ${productName}`)

    // --- LOGIKA BISNIS MULAI ---
    const { store_name, whitelist, api_key, secret_key, undercut_amount: globalUndercut, price_war_trigger_count = 5, price_war_trigger_hours = 1 } = config
    const { min_price: minPrice, max_price: maxPrice, undercut_amount: prodUndercut, rival_store_name: rivalStoreName } = product

    const undercutValue = Math.max(10, Number(prodUndercut) || Number(globalUndercut) || 10)
    const whitelistedStores = whitelist ? whitelist.split(',').map((n: string) => n.trim().toLowerCase()) : []

    // Scrape Itemku
    const scrapeRes = await fetch(`https://api-gateway.itemku.com/v1/product?game_id=${product.game_id}&item_type_id=${product.item_type_id}&item_info_id=${product.item_info_id}&per_page=10&page=1&sort=cheap&use_auto_delivery=true&is_enough_stock=1`)
    if (!scrapeRes.ok) throw new Error(`Scrape API failed: ${scrapeRes.status}`)
    
    const data = await scrapeRes.json()
    const competitorList = data?.data?.data || []

    let result: any = { status: 'idle', message: 'logic.waiting', messageParams: {} }

    if (competitorList.length === 0) {
      result = { status: 'error', message: 'logic.noCompetitor' }
    } else {
      const myProduct = competitorList.find((p: any) => p.seller?.shop_name?.toLowerCase() === store_name.toLowerCase())
      const myIndex = myProduct ? competitorList.indexOf(myProduct) : -1

      if (myIndex === -1) {
        result = { status: 'error', message: 'logic.outOfStock' }
      } else {
        // Logika Paling Murah (Rank 1)
        if (myIndex === 0) {
          const p2 = competitorList[1]
          if (!p2) {
            result = { status: 'success', message: 'logic.onlySellerAtMax', newPrice: maxPrice }
          } else if (p2.price - myProduct.price > undercutValue + 20) {
            const optimizedPrice = Math.min(roundPrice(p2.price - undercutValue), maxPrice)
            result = { status: 'updated', message: 'logic.maximizeProfit', newPrice: optimizedPrice, messageParams: { newPrice: optimizedPrice.toLocaleString('id-ID') } }
          } else {
            result = { status: 'success', message: 'logic.cheapestOptimal' }
          }
        } else {
          // Cari target (orang pertama di atas kita yang bukan whitelist)
          const target = competitorList.find((p: any, i: number) => i < myIndex && !whitelistedStores.includes(p.seller?.shop_name?.toLowerCase()))
          if (target) {
            const proposedPrice = roundPrice(target.price - undercutValue)
            result = { status: 'updated', message: 'logic.undercutting', newPrice: proposedPrice, messageParams: { competitorStoreName: target.seller?.shop_name, rank: competitorList.indexOf(target) + 1 } }
          } else {
            result = { status: 'success', message: 'logic.holdPrice' }
          }
        }
      }
    }

    // Eksekusi Update Harga ke Itemku jika statusnya 'updated'
    if (result.status === 'updated' && result.newPrice) {
      if (result.newPrice < minPrice) {
        result = { status: 'error', message: 'logic.violatesMinPrice', messageParams: { proposedPrice: result.newPrice.toLocaleString('id-ID'), minPrice: minPrice.toLocaleString('id-ID') } }
      } else {
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
          result = { status: 'error', message: 'logic.updateFail', messageParams: { errorMessage: upData.message || 'API Error' } }
        }
      }
    }

    // Simpan ke DB
    await supabaseAdmin.from('user_products').update({
      last_status: result.status,
      last_message: result.message,
      last_message_params: result.messageParams || {},
      proposed_price: result.newPrice || product.proposed_price,
      updated_at: new Date().toISOString()
    }).eq('id', product.id)

    await supabaseAdmin.from('product_logs').insert({
      user_id: userId,
      product_id: productId,
      log_data: { ...result, productName }
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