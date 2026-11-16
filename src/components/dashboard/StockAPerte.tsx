import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, PackageX, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { useAuth } from '@/context/auth'
import { parseNum } from '@/lib/products'
import { errorMessage, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Une ligne du stock vendu à perte. qty vide = lot (ex. produits ménagers). */
export interface LossStockItem {
  id: string
  name: string
  qty: number | null
  unit_price: number | null
  amount: number | null
  sold: number
  position: number
}

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const round2 = (n: number) => Math.round(n * 100) / 100

/** Montant total de la ligne : saisi à la main, sinon quantité × prix. */
const lineTotal = (l: LossStockItem) =>
  l.amount != null ? Number(l.amount) : (l.qty ?? 0) * Number(l.unit_price ?? 0)
const units = (l: LossStockItem) => l.qty ?? 1
const isDone = (l: LossStockItem) => l.sold >= units(l)
/** Valeur encore à vendre (au prorata des quantités vendues). */
const lineRemaining = (l: LossStockItem) => round2((lineTotal(l) * (units(l) - l.sold)) / units(l))

export function StockAPerte() {
  const { isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const key = ['loss_stock_items']
  const items = useQuery({
    queryKey: key,
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('loss_stock_items').select('*').order('position').order('created_at')
      if (error) throw error
      return data as LossStockItem[]
    },
  })
  const [editing, setEditing] = useState<LossStockItem | 'new' | null>(null)

  const setSold = useMutation({
    mutationFn: async ({ id, sold }: { id: string; sold: number }) => {
      const { error } = await supabase.from('loss_stock_items').update({ sold }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, sold }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<LossStockItem[]>(key)
      qc.setQueryData<LossStockItem[]>(key, (old) => old?.map((l) => (l.id === id ? { ...l, sold } : l)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(errorMessage(e))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  // Réservé aux super-admins ; la table n'existe pas encore tant que le SQL n'a pas été lancé.
  if (!isSuperAdmin || items.isError || !items.data) return null

  const list = items.data
  const remaining = round2(list.reduce((s, l) => s + lineRemaining(l), 0))
  const soldValue = round2(list.reduce((s, l) => s + lineTotal(l), 0) - remaining)
  const articlesLeft = list.reduce((s, l) => s + (l.qty != null ? l.qty - l.sold : 0), 0)
  const sorted = [...list].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.position - b.position)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <PackageX className="size-4" />
          </span>
          <div>
            <CardTitle>Stock à perte</CardTitle>
            <CardDescription>Prix de déstockage · touchez + quand vous vendez</CardDescription>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold leading-tight">{eur.format(remaining)}</p>
          <p className="text-xs text-muted-foreground">
            {articlesLeft} article{articlesLeft > 1 ? 's' : ''} à vendre (hors lots)
          </p>
          {soldValue > 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400">Déjà vendu : {eur.format(soldValue)}</p>}
        </div>
      </CardHeader>
      <CardContent>
        {list.length ? (
          <ul className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {sorted.map((l) => {
              const done = isDone(l)
              const n = units(l)
              return (
                <li key={l.id} className={cn('flex min-w-0 items-center gap-2 border-b py-1.5 text-sm', done && 'opacity-50')}>
                  <button
                    type="button"
                    onClick={() => setEditing(l)}
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-left hover:underline"
                    title="Modifier la ligne"
                  >
                    <span className={cn('min-w-0 truncate', done && 'line-through')}>{l.name}</span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {l.qty != null && l.unit_price != null && l.amount == null
                        ? `${l.qty} × ${eur.format(Number(l.unit_price))}`
                        : l.qty == null ? 'lot' : `${l.qty} pcs`}
                    </span>
                  </button>
                  <span className="shrink-0 tabular-nums font-medium">{eur.format(lineRemaining(l))}</span>
                  {l.qty != null && l.qty > 1 ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost" size="icon-sm" aria-label="Une vente de moins"
                        disabled={l.sold <= 0} onClick={() => setSold.mutate({ id: l.id, sold: l.sold - 1 })}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-11 text-center text-xs tabular-nums text-muted-foreground" title="Vendus">
                        {l.sold}/{n}
                      </span>
                      <Button
                        variant="ghost" size="icon-sm" aria-label="Une vente de plus"
                        disabled={done} onClick={() => setSold.mutate({ id: l.id, sold: l.sold + 1 })}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant={done ? 'default' : 'outline'} size="sm" className="h-7 w-[6.25rem] shrink-0 px-1 text-xs"
                      onClick={() => setSold.mutate({ id: l.id, sold: done ? 0 : n })}
                    >
                      {done ? <><Check className="size-3.5" /> Vendu</> : 'Marquer vendu'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">Aucune ligne pour le moment.</p>
        )}
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Ajouter une ligne
        </Button>
      </CardContent>
      {editing && (
        <LineDialog
          item={editing === 'new' ? null : editing}
          nextPosition={(list.at(-1)?.position ?? 0) + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function LineDialog({ item, nextPosition, onClose }: { item: LossStockItem | null; nextPosition: number; onClose: () => void }) {
  const qc = useQueryClient()
  const str = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))
  const [name, setName] = useState(item?.name ?? '')
  const [qty, setQty] = useState(str(item?.qty))
  const [price, setPrice] = useState(str(item?.unit_price))
  const [amount, setAmount] = useState(str(item?.amount))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const q = parseNum(qty)
      const qtyVal = q == null ? null : Math.max(1, Math.round(q))
      const payload = {
        name: name.trim(),
        qty: qtyVal,
        unit_price: parseNum(price),
        amount: parseNum(amount),
        // Si la quantité baisse, on garde « vendus » cohérent.
        sold: Math.min(item?.sold ?? 0, qtyVal ?? 1),
      }
      const { error } = item
        ? await supabase.from('loss_stock_items').update(payload).eq('id', item.id)
        : await supabase.from('loss_stock_items').insert({ ...payload, position: nextPosition })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loss_stock_items'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('loss_stock_items').delete().eq('id', item!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loss_stock_items'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const q = parseNum(qty), p = parseNum(price)
  const computed = q != null && p != null ? round2(q * p) : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Le nom est obligatoire.')
    if (parseNum(amount) == null && computed == null) return toast.error('Indiquez la quantité et le prix, ou un montant total.')
    save.mutate()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Modifier la ligne' : 'Nouvelle ligne'}</DialogTitle>
          <DialogDescription>Stock vendu à perte, au prix de déstockage.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Produit *">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ex. : Barbie" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité" hint="Vide = lot">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Prix unitaire (€)">
              <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <Field
            label="Montant total (€)"
            hint={computed != null ? `Vide = calculé : ${eur.format(computed)}` : 'Pour un lot, ex. « environ 40 € »'}
          >
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={computed != null ? str(computed) : ''} />
          </Field>
          <DialogFooter className="items-center gap-2 sm:justify-between">
            {item ? (
              confirmDelete ? (
                <Button type="button" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Confirmer la suppression
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Supprimer
                </Button>
              )
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={save.isPending}>{item ? 'Enregistrer' : 'Ajouter'}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

