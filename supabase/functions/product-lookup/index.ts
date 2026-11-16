// Fonction serveur : recherche d'un produit Amazon (amazon.fr) par ASIN ou EAN, EN LECTURE SEULE.
//
// Deux sources possibles (on utilise celles qui sont configurées) :
//  1. API vendeur Amazon (SP-API) : secrets LWA_CLIENT_ID, LWA_CLIENT_SECRET, SPAPI_REFRESH_TOKEN
//     → titre, photo, EAN/ASIN, BSR, prix de la Buy Box, estimation des frais FBA.
//  2. Keepa (facultatif) : secret KEEPA_API_KEY → ajoute notamment les ventes par mois.
//
// Lecture seule : seules des requêtes de consultation sont faites (catalogue, prix, estimation de frais).
// Aucune annonce, aucun prix, aucun stock n'est jamais créé ni modifié sur Amazon.
// Les clés restent côté serveur (secrets Supabase), jamais dans le navigateur.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MARKETPLACE_FR = 'A13V1IB3VIYZZH'
const SPAPI_HOST = 'https://sellingpartnerapi-eu.amazon.com'
const round2 = (n: number) => Math.round(n * 100) / 100

type Result = {
  title?: string | null
  image_url?: string | null
  asin?: string | null
  ean?: string | null
  amazon_url?: string | null
  sell_price?: number | null
  amazon_fees?: number | null
  monthly_sales?: number | null
  bsr?: number | null
}

// ---------------------------------------------------------------- SP-API
let cachedToken: { value: string; expires: number } | null = null

async function lwaToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: Deno.env.get('SPAPI_REFRESH_TOKEN')!,
      client_id: Deno.env.get('LWA_CLIENT_ID')!,
      client_secret: Deno.env.get('LWA_CLIENT_SECRET')!,
    }),
  })
  if (!res.ok) throw new Error(`Connexion Amazon refusée (${res.status}) : vérifiez les identifiants`)
  const data = await res.json()
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

async function spapi(path: string, init: RequestInit = {}) {
  const token = await lwaToken()
  const res = await fetch(`${SPAPI_HOST}${path}`, {
    ...init,
    headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) return null
  return res.json()
}

async function fromSpApi(asin: string, ean: string): Promise<Result | null> {
  const included = 'summaries,images,salesRanks,identifiers'
  let item: any = null
  if (asin) {
    item = await spapi(`/catalog/2022-04-01/items/${asin}?marketplaceIds=${MARKETPLACE_FR}&includedData=${included}`)
  } else {
    const r = await spapi(
      `/catalog/2022-04-01/items?identifiers=${ean}&identifiersType=EAN&marketplaceIds=${MARKETPLACE_FR}&includedData=${included}`,
    )
    item = r?.items?.[0] ?? null
  }
  if (!item) return null
  const foundAsin: string = item.asin ?? asin
  const summary = item.summaries?.[0] ?? {}
  const images = item.images?.[0]?.images ?? []
  const main = images.find((i: any) => i.variant === 'MAIN') ?? images[0]
  const ranks = item.salesRanks?.[0]
  const bsr = ranks?.displayGroupRanks?.[0]?.rank ?? ranks?.classificationRanks?.[0]?.rank ?? null
  const ids = item.identifiers?.[0]?.identifiers ?? []
  const foundEan = ids.find((i: any) => i.identifierType === 'EAN')?.identifier ?? (ean || null)

  // Prix : Buy Box en neuf, sinon le plus bas en neuf.
  let price: number | null = null
  const offers = await spapi(`/products/pricing/v0/items/${foundAsin}/offers?MarketplaceId=${MARKETPLACE_FR}&ItemCondition=New`)
  const s = offers?.payload?.Summary
  const bb = s?.BuyBoxPrices?.[0]?.LandedPrice?.Amount ?? s?.BuyBoxPrices?.[0]?.ListingPrice?.Amount
  const low = s?.LowestPrices?.[0]?.LandedPrice?.Amount ?? s?.LowestPrices?.[0]?.ListingPrice?.Amount
  if (typeof bb === 'number') price = bb
  else if (typeof low === 'number') price = low

  // Estimation des frais Amazon en FBA (simple calcul côté Amazon, rien n'est créé).
  let fees: number | null = null
  if (price) {
    const est = await spapi(`/products/fees/v0/items/${foundAsin}/feesEstimate`, {
      method: 'POST',
      body: JSON.stringify({
        FeesEstimateRequest: {
          MarketplaceId: MARKETPLACE_FR,
          IsAmazonFulfilled: true,
          Identifier: `pilotage-${foundAsin}`,
          PriceToEstimateFees: { ListingPrice: { CurrencyCode: 'EUR', Amount: price } },
        },
      }),
    })
    const total = est?.payload?.FeesEstimateResult?.FeesEstimate?.TotalFeesEstimate?.Amount
    if (typeof total === 'number') fees = round2(total)
  }

  return {
    title: summary.itemName ?? null,
    image_url: main?.link ?? null,
    asin: foundAsin,
    ean: foundEan,
    amazon_url: `https://www.amazon.fr/dp/${foundAsin}`,
    sell_price: price != null ? round2(price) : null,
    amazon_fees: fees,
    bsr: typeof bsr === 'number' ? bsr : null,
  }
}

// ---------------------------------------------------------------- Keepa
const cents = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.round(v) / 100 : null)

async function fromKeepa(asin: string, ean: string): Promise<Result | null> {
  const key = Deno.env.get('KEEPA_API_KEY')
  if (!key) return null
  const params = new URLSearchParams({ key, domain: '4', stats: '90' }) // domain 4 = amazon.fr
  if (asin) params.set('asin', asin)
  else params.set('code', ean)
  const res = await fetch(`https://api.keepa.com/product?${params}`)
  if (!res.ok) return null
  const p = (await res.json())?.products?.[0]
  if (!p) return null
  const current: number[] = p.stats?.current ?? []
  const image = String(p.imagesCSV ?? '').split(',')[0]
  const sell = cents(current[18]) ?? cents(current[1]) ?? cents(current[0])
  const fbaFee = cents(p.fbaFees?.pickAndPackFee)
  const referral = typeof p.referralFeePercentage === 'number' && sell ? (sell * p.referralFeePercentage) / 100 : null
  return {
    title: p.title ?? null,
    image_url: image ? `https://m.media-amazon.com/images/I/${image}` : null,
    asin: p.asin ?? (asin || null),
    ean: p.eanList?.[0] ?? (ean || null),
    amazon_url: p.asin ? `https://www.amazon.fr/dp/${p.asin}` : null,
    sell_price: sell,
    amazon_fees: fbaFee != null || referral != null ? round2((fbaFee ?? 0) + (referral ?? 0)) : null,
    monthly_sales: typeof p.monthlySold === 'number' && p.monthlySold > 0 ? p.monthlySold : null,
    bsr: typeof current[3] === 'number' && current[3] > 0 ? current[3] : null,
  }
}

// ---------------------------------------------------------------- Point d'entrée
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  // Réservé aux utilisateurs connectés de l'app.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Non authentifié' }, 401)
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: me, error: meErr } = await asUser.auth.getUser()
  if (meErr || !me.user) return json({ error: 'Session invalide' }, 401)

  const hasSpApi = !!(Deno.env.get('LWA_CLIENT_ID') && Deno.env.get('LWA_CLIENT_SECRET') && Deno.env.get('SPAPI_REFRESH_TOKEN'))
  const hasKeepa = !!Deno.env.get('KEEPA_API_KEY')
  if (!hasSpApi && !hasKeepa) return json({ error: 'not_configured' })

  let body: { asin?: string; ean?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requête invalide' }, 400)
  }
  const asin = String(body.asin ?? '').trim().toUpperCase()
  const ean = String(body.ean ?? '').replace(/\D/g, '')
  if (!/^[A-Z0-9]{10}$/.test(asin) && !/^\d{8,14}$/.test(ean)) return json({ error: 'ASIN ou EAN invalide' }, 400)

  try {
    const [a, k] = await Promise.all([
      hasSpApi ? fromSpApi(asin, ean) : Promise.resolve(null),
      hasKeepa ? fromKeepa(asin, ean) : Promise.resolve(null),
    ])
    if (!a && !k) return json({ error: 'Produit introuvable sur amazon.fr' }, 404)
    // L'API vendeur est prioritaire ; Keepa complète ce qui manque (ventes par mois…).
    const merged: Result = { ...(k ?? {}) }
    for (const [key, v] of Object.entries(a ?? {})) if (v != null) (merged as any)[key] = v
    return json(merged)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur Amazon' }, 502)
  }
})
