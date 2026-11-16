import { PackageX } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Stock vendu à perte (prix de déstockage), liste donnée par Pierre le 16/11/2026.
 * Les totaux sont calculés à partir des lignes : pour modifier, changer seulement cette liste.
 */
const STOCK: { name: string; qty: number | null; unit: number | null; total: number; approx?: boolean }[] = [
  { name: 'Jeux de société Scooby-Doo', qty: 10, unit: 6, total: 60 },
  { name: 'Barbie', qty: 11, unit: 16.5, total: 181.5 },
  { name: 'Crayola', qty: 14, unit: 2.99, total: 41.86 },
  { name: 'Doudou', qty: 1, unit: 9, total: 9 },
  { name: 'Tournevis Makita', qty: 15, unit: 7.5, total: 112.5 },
  { name: 'Jeux vidéo', qty: 8, unit: 7.5, total: 60 },
  { name: 'Playmobil', qty: 1, unit: 5, total: 5 },
  { name: 'Plaques Lagrange', qty: 4, unit: 25, total: 100 },
  { name: 'Figurines Pop', qty: 10, unit: 5.99, total: 59.9 },
  { name: 'Produits ménagers', qty: null, unit: null, total: 40, approx: true },
]

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export function StockAPerte() {
  const articles = STOCK.reduce((s, l) => s + (l.qty ?? 0), 0)
  const total = Math.round(STOCK.reduce((s, l) => s + l.total, 0) * 100) / 100
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <PackageX className="size-4" />
          </span>
          <div>
            <CardTitle>Stock à perte</CardTitle>
            <CardDescription>Stock vendu à perte, prix de déstockage</CardDescription>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold leading-tight">{eur.format(total)}</p>
          <p className="text-xs text-muted-foreground">{articles} articles (hors produits ménagers)</p>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {STOCK.map((l) => (
            <li key={l.name} className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <span className="min-w-0 truncate">{l.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {l.qty != null && l.unit != null ? `${l.qty} × ${eur.format(l.unit)} = ` : l.approx ? 'environ ' : ''}
                <span className="font-medium text-foreground">{eur.format(l.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
