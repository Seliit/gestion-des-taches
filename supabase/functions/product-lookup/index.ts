// Fonction serveur : recherche d'un produit Amazon (amazon.fr) par ASIN ou EAN, EN LECTURE SEULE.
// Utilise l'API Keepa (https://keepa.com/#!api) : la clé KEEPA_API_KEY reste côté serveur.
// Aucune écriture n'est jamais faite sur Amazon : on lit seulement titre, photo, prix, ventes et BSR.
// Sans clé configurée, la fonction répond { error: 'not_configured' } et l'app passe en saisie manuelle.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** Keepa : prix en centimes, -1 = absent. */
const cents = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.round(v) / 100 : null)

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

  const key = Deno.env.get('KEEPA_API_KEY')
  if (!key) return json({ error: 'not_configured' })

  let body: { asin?: string; ean?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requête invalide' }, 400)
  }
  const asin = String(body.asin ?? '').trim().toUpperCase()
  const ean = String(body.ean ?? '').replace(/\D/g, '')
  if (!/^[A-Z0-9]{10}$/.test(asin) && !/^\d{8,14}$/.test(ean)) return json({ error: 'ASIN ou EAN invalide' }, 400)

  const params = new URLSearchParams({ key, domain: '4', stats: '90' }) // domain 4 = amazon.fr
  if (asin) params.set('asin', asin)
  else params.set('code', ean)

  const res = await fetch(`https://api.keepa.com/product?${params}`)
  if (!res.ok) return json({ error: `Keepa a répondu ${res.status}` }, 502)
  const data = await res.json()
  const p = data?.products?.[0]
  if (!p) return json({ error: 'Produit introuvable' }, 404)

  const current: number[] = p.stats?.current ?? []
  const image = String(p.imagesCSV ?? '').split(',')[0]
  // Prix de vente : Buy Box (18), sinon neuf (1), sinon Amazon (0).
  const sell = cents(current[18]) ?? cents(current[1]) ?? cents(current[0])
  const fbaFee = cents(p.fbaFees?.pickAndPackFee)
  const referral = typeof p.referralFeePercentage === 'number' && sell ? (sell * p.referralFeePercentage) / 100 : null
  const fees = fbaFee != null || referral != null ? Math.round(((fbaFee ?? 0) + (referral ?? 0)) * 100) / 100 : null

  return json({
    title: p.title ?? null,
    image_url: image ? `https://m.media-amazon.com/images/I/${image}` : null,
    asin: p.asin ?? (asin || null),
    ean: p.eanList?.[0] ?? (ean || null),
    amazon_url: p.asin ? `https://www.amazon.fr/dp/${p.asin}` : null,
    sell_price: sell,
    amazon_fees: fees,
    monthly_sales: typeof p.monthlySold === 'number' && p.monthlySold > 0 ? p.monthlySold : null,
    bsr: typeof current[3] === 'number' && current[3] > 0 ? current[3] : null,
  })
})
