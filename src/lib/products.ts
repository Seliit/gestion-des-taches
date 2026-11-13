import type { ProductCard, ProductVerdict } from './types'

/** Colonnes créées au premier passage sur le tableau d'une société. */
export const DEFAULT_PRODUCT_COLUMNS: { name: string; is_store?: boolean; is_protected?: boolean }[] = [
  { name: 'A commander dans la semaine' },
  { name: 'Sourcing / Idées produits' },
  { name: 'Produits Commandé / Online', is_protected: true },
  { name: 'Il faut un 3PL' },
  { name: 'A2A' },
  { name: 'À trier' },
  { name: 'Auchan', is_store: true },
  { name: 'Carrefour', is_store: true },
  { name: 'Leclerc', is_store: true },
  { name: 'Intermarché', is_store: true },
]

export const VERDICTS: { value: ProductVerdict; label: string; className: string }[] = [
  { value: 'bon', label: 'Bon', className: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' },
  { value: 'moyen', label: 'Moyen', className: 'bg-amber-500/15 text-amber-400 ring-amber-500/30' },
  { value: 'a_eviter', label: 'À éviter', className: 'bg-red-500/15 text-red-400 ring-red-500/30' },
]

/** Bénéfice affiché : saisi, sinon calculé (prix de vente − prix d'achat − frais Amazon). */
export function effectiveProfit(c: Pick<ProductCard, 'profit' | 'sell_price' | 'buy_price' | 'amazon_fees'>): number | null {
  if (c.profit != null) return Number(c.profit)
  if (c.sell_price == null || c.buy_price == null) return null
  return round2(Number(c.sell_price) - Number(c.buy_price) - Number(c.amazon_fees ?? 0))
}

/** ROI affiché (%) : saisi, sinon bénéfice / prix d'achat. */
export function effectiveRoi(c: Pick<ProductCard, 'roi' | 'profit' | 'sell_price' | 'buy_price' | 'amazon_fees'>): number | null {
  if (c.roi != null) return Number(c.roi)
  const p = effectiveProfit(c)
  if (p == null || !c.buy_price || Number(c.buy_price) <= 0) return null
  return round2((p / Number(c.buy_price)) * 100)
}

/** Tri dans une colonne : du plus rentable au moins rentable (bénéfice, puis ROI). */
export function byProfitability(a: ProductCard, b: ProductCard) {
  const pa = effectiveProfit(a), pb = effectiveProfit(b)
  if (pa !== pb) return (pb ?? -Infinity) - (pa ?? -Infinity)
  const ra = effectiveRoi(a), rb = effectiveRoi(b)
  if (ra !== rb) return (rb ?? -Infinity) - (ra ?? -Infinity)
  return a.title.localeCompare(b.title)
}

export const round2 = (n: number) => Math.round(n * 100) / 100

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const money = (n: number | null | undefined) => (n == null ? '—' : eur.format(Number(n)))
export const intFr = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(Number(n)))

/** Analyse ce qui est collé dans l'ajout rapide : lien Amazon (→ ASIN), ASIN seul ou EAN. */
export function parseQuickInput(raw: string): { asin?: string; ean?: string; amazon_url?: string } {
  const s = raw.trim()
  if (!s) return {}
  const m = s.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/)([A-Z0-9]{10})(?:[/?#]|$)/i)
  if (m) return { asin: m[1].toUpperCase(), amazon_url: s.startsWith('http') ? s : `https://${s}` }
  if (/^https?:\/\//i.test(s)) return { amazon_url: s }
  const digits = s.replace(/\s/g, '')
  if (/^\d{8,14}$/.test(digits)) return { ean: digits }
  if (/^[A-Z0-9]{10}$/i.test(s)) return { asin: s.toUpperCase(), amazon_url: `https://www.amazon.fr/dp/${s.toUpperCase()}` }
  return {}
}

/** Champs numériques : accepte « 12,50 », « 12.5 € », vide → null. */
export function parseNum(v: string): number | null {
  const t = v.replace(/[\s€%]/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
