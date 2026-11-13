import { useEffect, useState } from 'react'
import { ExternalLink, ImageOff, Loader2, PackageCheck, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { lookupProduct, useProductMutation } from '@/hooks/products'
import { effectiveProfit, effectiveRoi, money, parseNum, parseQuickInput, VERDICTS } from '@/lib/products'
import { supabase } from '@/lib/supabase'
import type { ProductCard, ProductColumn, ProductVerdict } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DeleteGuard } from './DeleteGuard'

type Form = Record<
  'title' | 'image_url' | 'ean' | 'asin' | 'amazon_url' | 'supplier_url' | 'buy_price' | 'sell_price' | 'amazon_fees' |
  'profit' | 'roi' | 'monthly_sales' | 'bsr' | 'notes' | 'column_id',
  string
> & { verdict: ProductVerdict | null; received: boolean }

const str = (v: unknown) => (v == null ? '' : String(v).replace('.', ','))

function toForm(c: Partial<ProductCard> | null, columnId: string): Form {
  return {
    title: c?.title ?? '', image_url: c?.image_url ?? '', ean: c?.ean ?? '', asin: c?.asin ?? '',
    amazon_url: c?.amazon_url ?? '', supplier_url: c?.supplier_url ?? '',
    buy_price: str(c?.buy_price), sell_price: str(c?.sell_price), amazon_fees: str(c?.amazon_fees),
    profit: str(c?.profit), roi: str(c?.roi), monthly_sales: str(c?.monthly_sales), bsr: str(c?.bsr),
    notes: c?.notes ?? '', column_id: c?.column_id ?? columnId, verdict: c?.verdict ?? null, received: !!c?.received_at,
  }
}

export function ProductCardDialog({
  open, onOpenChange, card, columns, companyId, defaultColumnId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  card: ProductCard | null
  columns: ProductColumn[]
  companyId: string
  defaultColumnId: string
}) {
  const [f, setF] = useState<Form>(() => toForm(card, defaultColumnId))
  const [quick, setQuick] = useState('')
  const [searching, setSearching] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (open) {
      setF(toForm(card, defaultColumnId))
      setQuick('')
    }
  }, [open, card, defaultColumnId])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))

  const save = useProductMutation((payload: Partial<ProductCard>) =>
    card
      ? supabase.from('product_cards').update(payload).eq('id', card.id)
      : supabase.from('product_cards').insert({ ...payload, company_id: companyId }),
  )
  const remove = useProductMutation(() => supabase.from('product_cards').delete().eq('id', card!.id), 'Carte supprimée')

  const numbers = {
    buy_price: parseNum(f.buy_price), sell_price: parseNum(f.sell_price), amazon_fees: parseNum(f.amazon_fees),
    profit: parseNum(f.profit), roi: parseNum(f.roi),
  }
  const autoProfit = effectiveProfit({ ...numbers, profit: null })
  const autoRoi = effectiveRoi({ ...numbers, roi: null })

  async function quickFill() {
    const parsed = parseQuickInput(quick)
    if (!parsed.asin && !parsed.ean && !parsed.amazon_url) {
      toast.error('Collez un lien Amazon, un ASIN (10 caractères) ou un EAN (8 à 14 chiffres).')
      return
    }
    setF((s) => ({
      ...s,
      asin: parsed.asin ?? s.asin, ean: parsed.ean ?? s.ean, amazon_url: parsed.amazon_url ?? s.amazon_url,
    }))
    if (!parsed.asin && !parsed.ean) return
    setSearching(true)
    const r = await lookupProduct({ asin: parsed.asin, ean: parsed.ean })
    setSearching(false)
    if (!r) {
      toast.info('API Amazon non branchée : complétez la fiche à la main.')
      return
    }
    setF((s) => ({
      ...s,
      title: r.title ?? s.title, image_url: r.image_url ?? s.image_url, asin: r.asin ?? s.asin, ean: r.ean ?? s.ean,
      amazon_url: r.amazon_url ?? s.amazon_url, sell_price: r.sell_price != null ? str(r.sell_price) : s.sell_price,
      amazon_fees: r.amazon_fees != null ? str(r.amazon_fees) : s.amazon_fees,
      monthly_sales: r.monthly_sales != null ? str(r.monthly_sales) : s.monthly_sales, bsr: r.bsr != null ? str(r.bsr) : s.bsr,
    }))
    toast.success('Fiche remplie depuis Amazon')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.title.trim()) return toast.error('Le titre est obligatoire.')
    const intOrNull = (v: string) => {
      const n = parseNum(v)
      return n == null ? null : Math.round(n)
    }
    save.mutate(
      {
        title: f.title.trim(), image_url: f.image_url.trim() || null, ean: f.ean.trim() || null,
        asin: f.asin.trim().toUpperCase() || null, amazon_url: f.amazon_url.trim() || null,
        supplier_url: f.supplier_url.trim() || null, ...numbers,
        monthly_sales: intOrNull(f.monthly_sales), bsr: intOrNull(f.bsr), notes: f.notes.trim() || null,
        column_id: f.column_id, verdict: f.verdict,
        received_at: f.received ? (card?.received_at ?? new Date().toISOString()) : null,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const column = columns.find((c) => c.id === (card?.column_id ?? f.column_id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="theme-produits dark max-w-2xl text-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{card ? 'Fiche produit' : 'Nouveau produit'}</DialogTitle>
          <DialogDescription>Lecture seule côté Amazon : rien n’est jamais modifié sur votre compte vendeur.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <label className="text-sm font-medium">Ajout rapide</label>
            <div className="flex gap-2">
              <Input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    quickFill()
                  }
                }}
                placeholder="Collez un lien Amazon, un ASIN ou un EAN"
              />
              <Button type="button" onClick={quickFill} disabled={searching}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Remplir
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-white/5">
              {f.image_url ? (
                <img src={f.image_url} alt="" className="size-full object-contain" />
              ) : (
                <ImageOff className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="grid gap-3">
              <Field label="Titre *">
                <Input value={f.title} onChange={(e) => set('title', e.target.value)} required />
              </Field>
              <Field label="Photo (lien de l’image)">
                <Input value={f.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="https://…" />
              </Field>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="EAN"><Input value={f.ean} onChange={(e) => set('ean', e.target.value)} inputMode="numeric" /></Field>
            <Field label="ASIN"><Input value={f.asin} onChange={(e) => set('asin', e.target.value)} /></Field>
            <Field label="Lien Amazon">
              <LinkInput value={f.amazon_url} onChange={(v) => set('amazon_url', v)} />
            </Field>
            <Field label="Lien fournisseur">
              <LinkInput value={f.supplier_url} onChange={(v) => set('supplier_url', v)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Prix d’achat (€)"><Input value={f.buy_price} onChange={(e) => set('buy_price', e.target.value)} inputMode="decimal" /></Field>
            <Field label="Prix de vente Amazon (€)"><Input value={f.sell_price} onChange={(e) => set('sell_price', e.target.value)} inputMode="decimal" /></Field>
            <Field label="Frais Amazon (€)"><Input value={f.amazon_fees} onChange={(e) => set('amazon_fees', e.target.value)} inputMode="decimal" /></Field>
            <Field label="Bénéfice (€)" hint={f.profit ? undefined : autoProfit != null ? `Calculé : ${money(autoProfit)}` : 'Vide = calculé'}>
              <Input value={f.profit} onChange={(e) => set('profit', e.target.value)} inputMode="decimal" placeholder={autoProfit != null ? String(autoProfit).replace('.', ',') : ''} />
            </Field>
            <Field label="ROI (%)" hint={f.roi ? undefined : autoRoi != null ? `Calculé : ${String(autoRoi).replace('.', ',')} %` : 'Vide = calculé'}>
              <Input value={f.roi} onChange={(e) => set('roi', e.target.value)} inputMode="decimal" placeholder={autoRoi != null ? String(autoRoi).replace('.', ',') : ''} />
            </Field>
            <Field label="Ventes / mois"><Input value={f.monthly_sales} onChange={(e) => set('monthly_sales', e.target.value)} inputMode="numeric" /></Field>
            <Field label="BSR"><Input value={f.bsr} onChange={(e) => set('bsr', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Colonne" className="col-span-2">
              <NativeSelect value={f.column_id} onChange={(e) => set('column_id', e.target.value)}>
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Notes">
            <Textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={f.received ? 'default' : 'outline'}
              onClick={() => set('received', !f.received)}
            >
              <PackageCheck className="size-4" /> {f.received ? 'Reçu ✓' : 'Reçu'}
            </Button>
            <span className="mx-1 text-sm text-muted-foreground">Verdict :</span>
            {VERDICTS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => set('verdict', f.verdict === v.value ? null : v.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-sm ring-1 transition',
                  f.verdict === v.value ? v.className : 'text-muted-foreground ring-border hover:bg-accent',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            {card ? (
              <Button type="button" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Supprimer
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button type="submit" disabled={save.isPending}>{card ? 'Enregistrer' : 'Ajouter'}</Button>
            </div>
          </DialogFooter>
        </form>

        <DeleteGuard
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Supprimer « ${card?.title ?? ''} » ?`}
          description="La carte sera définitivement supprimée."
          strict={!!column?.is_protected}
          strictReason={column ? `Cette carte est dans « ${column.name} » : une seconde confirmation est demandée.` : undefined}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
        />
      </DialogContent>
    </Dialog>
  )
}

function LinkInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
      {/^https?:\/\//.test(value) && (
        <Button type="button" variant="outline" size="icon" asChild>
          <a href={value} target="_blank" rel="noreferrer" aria-label="Ouvrir le lien"><ExternalLink className="size-4" /></a>
        </Button>
      )}
    </div>
  )
}
