import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ImageOff, RotateCcw, ShoppingCart, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useProductCards, useProductColumns, useProductMutation, useUpdateProductCard } from '@/hooks/products'
import { byProfitability, money } from '@/lib/products'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useBoardCompany } from './ProductBoard'

/**
 * Liste de courses : on choisit une ou plusieurs colonnes magasin, et on obtient
 * la liste des produits à acheter, lisible sur téléphone, avec une case par produit.
 * Les cases sont enregistrées : elles restent cochées d'un appareil à l'autre.
 */
export default function ShoppingList() {
  const { company } = useBoardCompany()
  const companyId = company?.id
  const columns = useProductColumns(companyId)
  const cards = useProductCards(companyId)
  const update = useUpdateProductCard(companyId)
  const [params, setParams] = useSearchParams()

  const stores = (columns.data ?? []).filter((c) => c.is_store)
  const picked = (params.get('magasins') ?? '').split(',').filter(Boolean)
  const selected = picked.length ? stores.filter((s) => picked.includes(s.id)) : stores

  function togglePick(id: string) {
    const cur = new Set(selected.map((s) => s.id))
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    setParams((p) => {
      if (cur.size === 0 || cur.size === stores.length) p.delete('magasins')
      else p.set('magasins', [...cur].join(','))
      return p
    })
  }

  const groups = useMemo(
    () => selected.map((s) => ({ store: s, items: (cards.data ?? []).filter((c) => c.column_id === s.id).sort(byProfitability) })),
    [selected, cards.data],
  )
  const all = groups.flatMap((g) => g.items)
  const taken = all.filter((c) => c.in_cart).length
  const reset = useProductMutation(
    (ids: string[]) => supabase.from('product_cards').update({ in_cart: false }).in('id', ids),
    'Liste remise à zéro',
  )

  return (
    <div className="theme-produits dark -mx-4 -my-5 min-h-[calc(100dvh-3.5rem)] bg-background px-4 py-5 text-foreground sm:-mx-6 sm:px-6">
      <div className="mx-auto grid w-full max-w-xl gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/produits${companyId ? `?societe=${companyId}` : ''}`} aria-label="Retour au tableau"><ArrowLeft className="size-5" /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold"><ShoppingCart className="size-5 text-primary" /> Liste de courses</h1>
            <p className="text-sm text-muted-foreground">{all.length ? `${taken} / ${all.length} pris` : company?.name}</p>
          </div>
          {taken > 0 && (
            <Button variant="outline" size="sm" onClick={() => reset.mutate(all.filter((c) => c.in_cart).map((c) => c.id))}>
              <RotateCcw className="size-4" /> Décocher
            </Button>
          )}
        </div>

        {all.length > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(taken / all.length) * 100}%` }} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {stores.map((s) => {
            const on = selected.some((x) => x.id === s.id)
            return (
              <button
                key={s.id}
                onClick={() => togglePick(s.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                  on ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {on ? <Check className="size-3.5" /> : <Store className="size-3.5" />} {s.name}
              </button>
            )
          })}
        </div>

        {columns.isLoading || cards.isLoading ? (
          <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : !stores.length ? (
          <EmptyState icon={<Store />} title="Aucune colonne magasin" description="Dans le tableau, menu « … » d’une colonne → « Colonne magasin »." />
        ) : !all.length ? (
          <EmptyState icon={<ShoppingCart />} title="Rien à acheter" description="Aucun produit dans les magasins choisis." />
        ) : (
          groups.filter((g) => g.items.length).map((g) => (
            <section key={g.store.id} className="grid gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Store className="size-4" /> {g.store.name}
                <span className="font-normal">({g.items.filter((c) => c.in_cart).length}/{g.items.length})</span>
              </h2>
              <ul className="grid gap-2">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => update.mutate({ id: c.id, patch: { in_cart: !c.in_cart } })}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition active:scale-[0.99]',
                        c.in_cart && 'opacity-50',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full border-2',
                          c.in_cart ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                        )}
                      >
                        {c.in_cart && <Check className="size-5" strokeWidth={3} />}
                      </span>
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/90">
                        {c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="size-full object-contain" /> : <ImageOff className="size-4 text-zinc-400" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('line-clamp-2 text-[15px] font-medium leading-snug', c.in_cart && 'line-through')}>{c.title}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {c.buy_price != null && <span>Achat max {money(c.buy_price)}</span>}
                          {c.ean && <span>EAN {c.ean}</span>}
                        </span>
                        {c.notes && <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{c.notes}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
