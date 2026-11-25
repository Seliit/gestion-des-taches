import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, ImagePlus, Loader2, PackageCheck, Star, Trash2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PHOTO_BUCKET, usePhotoUrls } from '@/hooks/products'
import { extensionFor, shrinkImage } from '@/lib/images'
import { effectiveProfit, effectiveRoi, money, parseNum, VERDICTS } from '@/lib/products'
import { errorMessage, supabase } from '@/lib/supabase'
import type { ProductCard, ProductColumn, ProductVerdict } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DeleteGuard } from './DeleteGuard'

type Form = Record<
  'title' | 'ean' | 'asin' | 'amazon_url' | 'supplier_url' | 'buy_price' | 'sell_price' | 'amazon_fees' |
  'profit' | 'roi' | 'monthly_sales' | 'bsr' | 'notes' | 'column_id' | 'quantity',
  string
> & { verdict: ProductVerdict | null; received: boolean }

/** Une photo de la carte : déjà enregistrée (chemin) ou ajoutée et pas encore envoyée. */
type Photo = { kind: 'saved'; path: string } | { kind: 'new'; id: string; file: File; preview: string }

const MAX_PHOTOS = 20
const str = (v: unknown) => (v == null ? '' : String(v).replace('.', ','))

function toForm(c: Partial<ProductCard> | null, columnId: string): Form {
  return {
    title: c?.title ?? '', ean: c?.ean ?? '', asin: c?.asin ?? '',
    amazon_url: c?.amazon_url ?? '', supplier_url: c?.supplier_url ?? '',
    buy_price: str(c?.buy_price), sell_price: str(c?.sell_price), amazon_fees: str(c?.amazon_fees),
    profit: str(c?.profit), roi: str(c?.roi), monthly_sales: str(c?.monthly_sales), bsr: str(c?.bsr),
    quantity: str(c?.quantity),
    notes: c?.notes ?? '', column_id: c?.column_id ?? columnId, verdict: c?.verdict ?? null, received: !!c?.received_at,
  }
}

const hasDetails = (f: Form) =>
  [f.ean, f.asin, f.amazon_url, f.supplier_url, f.buy_price, f.sell_price, f.amazon_fees, f.profit, f.roi, f.monthly_sales, f.bsr]
    .some((v) => v.trim()) || !!f.verdict || f.received

const keyOf = (p: Photo) => (p.kind === 'saved' ? p.path : p.id)

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
  const qc = useQueryClient()
  const [f, setF] = useState<Form>(() => toForm(card, defaultColumnId))
  const [photos, setPhotos] = useState<Photo[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const form = toForm(card, defaultColumnId)
    setF(form)
    setPhotos((card?.photos ?? []).map((path) => ({ kind: 'saved', path })))
    setShowDetails(hasDetails(form))
  }, [open, card, defaultColumnId])

  // Libère les aperçus locaux à la fermeture.
  const previews = useRef(new Set<string>())
  useEffect(() => {
    const all = previews.current
    return () => all.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  const savedPaths = useMemo(() => photos.flatMap((p) => (p.kind === 'saved' ? [p.path] : [])), [photos])
  const urls = usePhotoUrls(savedPaths)
  const srcOf = (p: Photo) => (p.kind === 'new' ? p.preview : urls.data?.[p.path])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))

  function addFiles(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []).filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (!files.length) return
    const room = MAX_PHOTOS - photos.length
    if (files.length > room) toast.info(`${MAX_PHOTOS} photos maximum par carte.`)
    const added: Photo[] = files.slice(0, Math.max(0, room)).map((file) => {
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      return { kind: 'new', id: crypto.randomUUID(), file, preview }
    })
    setPhotos((ps) => [...ps, ...added])
  }

  const removePhoto = (p: Photo) => setPhotos((ps) => ps.filter((x) => keyOf(x) !== keyOf(p)))
  const makeCover = (p: Photo) => setPhotos((ps) => [p, ...ps.filter((x) => keyOf(x) !== keyOf(p))])

  const numbers = {
    buy_price: parseNum(f.buy_price), sell_price: parseNum(f.sell_price), amazon_fees: parseNum(f.amazon_fees),
    profit: parseNum(f.profit), roi: parseNum(f.roi),
  }
  const autoProfit = effectiveProfit({ ...numbers, profit: null })
  const autoRoi = effectiveRoi({ ...numbers, roi: null })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['product_cards'] })
    qc.invalidateQueries({ queryKey: ['product_photo_urls'] })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.title.trim()) return toast.error('Le titre est obligatoire.')
    const intOrNull = (v: string) => {
      const n = parseNum(v)
      return n == null ? null : Math.round(n)
    }
    const payload: Partial<ProductCard> = {
      title: f.title.trim(), ean: f.ean.trim() || null,
      asin: f.asin.trim().toUpperCase() || null, amazon_url: f.amazon_url.trim() || null,
      supplier_url: f.supplier_url.trim() || null, ...numbers,
      monthly_sales: intOrNull(f.monthly_sales), bsr: intOrNull(f.bsr), notes: f.notes.trim() || null,
      quantity: (() => { const q = intOrNull(f.quantity); return q == null ? null : Math.max(0, q) })(),
      column_id: f.column_id, verdict: f.verdict,
      received_at: f.received ? (card?.received_at ?? new Date().toISOString()) : null,
    }

    setSaving(true)
    try {
      // 1) La carte doit exister avant d'y ranger des photos.
      const id = card?.id ?? crypto.randomUUID()
      if (!card) {
        const { error } = await supabase.from('product_cards').insert({ ...payload, id, company_id: companyId, photos: [] })
        if (error) throw error
      }
      // 2) Envoi des nouvelles photos (réduites), dans l'ordre affiché.
      const paths: string[] = []
      let failed = 0
      for (const p of photos) {
        if (p.kind === 'saved') {
          paths.push(p.path)
          continue
        }
        const blob = await shrinkImage(p.file)
        const type = blob.type || p.file.type || 'image/jpeg'
        const path = `${companyId}/${id}/${crypto.randomUUID()}.${extensionFor(type)}`
        const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: type })
        if (up.error) {
          failed++
          continue
        }
        paths.push(path)
      }
      // 3) Enregistrement de la carte avec sa liste de photos.
      const { error } = await supabase
        .from('product_cards')
        .update(card ? { ...payload, photos: paths } : { photos: paths })
        .eq('id', id)
      if (error) throw error
      // 4) Les photos retirées sont effacées du stockage.
      const gone = (card?.photos ?? []).filter((p) => !paths.includes(p))
      if (gone.length) await supabase.storage.from(PHOTO_BUCKET).remove(gone)

      if (failed) toast.error(`${failed} photo(s) n’ont pas pu être envoyées.`)
      refresh()
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
      refresh()
    } finally {
      setSaving(false)
    }
  }

  async function deleteCard() {
    if (!card) return
    const { error } = await supabase.from('product_cards').delete().eq('id', card.id)
    if (error) return toast.error(errorMessage(error))
    if (card.photos?.length) await supabase.storage.from(PHOTO_BUCKET).remove(card.photos)
    toast.success('Carte supprimée')
    refresh()
    onOpenChange(false)
  }

  const column = columns.find((c) => c.id === (card?.column_id ?? f.column_id))

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        className="theme-produits dark max-h-[92dvh] max-w-2xl overflow-y-auto text-foreground sm:max-w-2xl"
        // Glisser des photos depuis le Finder / l'explorateur, ou les coller (Cmd + V).
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragOver(false)
          addFiles(e.dataTransfer.files)
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (!files.length) return
          e.preventDefault()
          addFiles(files)
        }}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/85 text-sm font-medium text-primary">
            Déposez les photos ici
          </div>
        )}
        <DialogHeader>
          <DialogTitle>{card ? 'Carte' : 'Nouvelle carte'}</DialogTitle>
          <DialogDescription className="sr-only">Titre, photos et notes de la carte.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <Field label="Titre *">
            <Input value={f.title} onChange={(e) => set('title', e.target.value)} required placeholder="Ex. : Gourde inox 1 L" />
          </Field>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Photos {photos.length > 0 && <span className="text-muted-foreground">({photos.length})</span>}
              </span>
              {photos.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
                  <ImagePlus className="size-4" /> Ajouter des photos
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            {photos.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p, i) => {
                  const src = srcOf(p)
                  return (
                    <div key={keyOf(p)} className="relative aspect-square overflow-hidden rounded-lg border bg-white/5">
                      {src ? (
                        <button type="button" onClick={() => setViewing(src)} className="size-full" aria-label="Agrandir la photo">
                          <img src={src} alt="" className="size-full object-cover" />
                        </button>
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {i === 0 ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Couverture</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makeCover(p)}
                          className="absolute bottom-1 left-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                          aria-label="Mettre en couverture"
                          title="Mettre en couverture"
                        >
                          <Star className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(p)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-red-600"
                        aria-label="Retirer la photo"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
              >
                <ImagePlus className="size-5" />
                Ajouter des photos
                <span className="text-xs">ou glissez-les ici, ou collez-les (Cmd + V)</span>
              </button>
            )}
          </div>

          <Field label="Notes">
            <Textarea rows={5} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ce que vous voulez retenir…" />
          </Field>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field label="Quantité">
              <Input value={f.quantity} onChange={(e) => set('quantity', e.target.value)} inputMode="numeric" placeholder="Ex. : 12" />
            </Field>
            <Field label="Colonne">
              <NativeSelect value={f.column_id} onChange={(e) => set('column_id', e.target.value)}>
                {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
          </div>

          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
              aria-expanded={showDetails}
            >
              Plus de détails (prix, EAN, liens…), facultatif
              <ChevronDown className={cn('size-4 shrink-0 transition', showDetails && 'rotate-180')} />
            </button>
            {showDetails && (
              <div className="grid gap-4 border-t p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="EAN"><Input value={f.ean} onChange={(e) => set('ean', e.target.value)} inputMode="numeric" /></Field>
                  <Field label="ASIN"><Input value={f.asin} onChange={(e) => set('asin', e.target.value)} /></Field>
                  <Field label="Lien Amazon"><LinkInput value={f.amazon_url} onChange={(v) => set('amazon_url', v)} /></Field>
                  <Field label="Lien fournisseur"><LinkInput value={f.supplier_url} onChange={(v) => set('supplier_url', v)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Prix d’achat (€)"><Input value={f.buy_price} onChange={(e) => set('buy_price', e.target.value)} inputMode="decimal" /></Field>
                  <Field label="Prix de vente (€)"><Input value={f.sell_price} onChange={(e) => set('sell_price', e.target.value)} inputMode="decimal" /></Field>
                  <Field label="Frais Amazon (€)"><Input value={f.amazon_fees} onChange={(e) => set('amazon_fees', e.target.value)} inputMode="decimal" /></Field>
                  <Field label="Bénéfice (€)" hint={f.profit ? undefined : autoProfit != null ? `Calculé : ${money(autoProfit)}` : 'Vide = calculé'}>
                    <Input value={f.profit} onChange={(e) => set('profit', e.target.value)} inputMode="decimal" placeholder={autoProfit != null ? String(autoProfit).replace('.', ',') : ''} />
                  </Field>
                  <Field label="ROI (%)" hint={f.roi ? undefined : autoRoi != null ? `Calculé : ${String(autoRoi).replace('.', ',')} %` : 'Vide = calculé'}>
                    <Input value={f.roi} onChange={(e) => set('roi', e.target.value)} inputMode="decimal" placeholder={autoRoi != null ? String(autoRoi).replace('.', ',') : ''} />
                  </Field>
                  <Field label="Ventes / mois"><Input value={f.monthly_sales} onChange={(e) => set('monthly_sales', e.target.value)} inputMode="numeric" /></Field>
                  <Field label="BSR"><Input value={f.bsr} onChange={(e) => set('bsr', e.target.value)} inputMode="numeric" /></Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant={f.received ? 'default' : 'outline'} onClick={() => set('received', !f.received)}>
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
              </div>
            )}
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            {card ? (
              <Button type="button" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="size-4" /> Supprimer
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? 'Enregistrement…' : card ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </DialogFooter>
        </form>

        <DeleteGuard
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Supprimer « ${card?.title ?? ''} » ?`}
          description="La carte et ses photos seront définitivement supprimées."
          strict={!!column?.is_protected}
          strictReason={column ? `Cette carte est dans « ${column.name} » : une seconde confirmation est demandée.` : undefined}
          onConfirm={deleteCard}
        />

        <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="theme-produits dark max-w-3xl p-2 text-foreground sm:max-w-3xl">
            <DialogTitle className="sr-only">Photo</DialogTitle>
            <DialogDescription className="sr-only">Photo en grand</DialogDescription>
            {viewing && <img src={viewing} alt="" className="max-h-[85dvh] w-full rounded-md object-contain" />}
          </DialogContent>
        </Dialog>
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
