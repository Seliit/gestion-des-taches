import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  ArrowLeft, ArrowRight, BarChart3, ImageOff, MoreHorizontal, PackageCheck, Pencil, Plus, Search, ShieldCheck,
  ShoppingCart, Store, Trash2, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input, NativeSelect } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { useCompanies } from '@/hooks/data'
import {
  useEnsureDefaultColumns, useProductCards, useProductColumns, useProductMutation, useUpdateProductCard,
} from '@/hooks/products'
import { byProfitability, effectiveProfit, effectiveRoi, intFr, money, VERDICTS } from '@/lib/products'
import { supabase } from '@/lib/supabase'
import type { Company, ProductCard, ProductColumn } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DeleteGuard } from './DeleteGuard'
import { ProductCardDialog } from './ProductCardDialog'

const STORAGE_KEY = 'produits:societe'

/** Société affichée : ?societe=…, sinon la dernière utilisée, sinon celle dont le nom contient « vinted », sinon la première. */
export function useBoardCompany() {
  const [params, setParams] = useSearchParams()
  const companies = useCompanies()
  const list = companies.data ?? []
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    /* stockage indisponible */
  }
  const wanted = params.get('societe') ?? saved
  const company: Company | undefined =
    list.find((c) => c.id === wanted) ?? list.find((c) => /vinted/i.test(c.name)) ?? list[0]
  const select = (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* ignoré */
    }
    setParams((p) => {
      p.set('societe', id)
      return p
    })
  }
  return { company, companies: list, loading: companies.isLoading, select }
}

export default function ProductBoard() {
  const { company, companies, loading, select } = useBoardCompany()
  const companyId = company?.id
  const columns = useProductColumns(companyId)
  const cards = useProductCards(companyId)
  useEnsureDefaultColumns(companyId, columns.data)
  const update = useUpdateProductCard(companyId)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ card: ProductCard | null; columnId: string } | null>(null)
  const [dragging, setDragging] = useState<ProductCard | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  )

  const cols = useMemo(() => columns.data ?? [], [columns.data])
  const byColumn = useMemo(() => {
    const q = search.trim().toLowerCase()
    const m = new Map<string, ProductCard[]>()
    for (const c of cards.data ?? []) {
      if (q && ![c.title, c.ean, c.asin, c.notes].some((v) => v?.toLowerCase().includes(q))) continue
      const arr = m.get(c.column_id) ?? []
      arr.push(c)
      m.set(c.column_id, arr)
    }
    for (const arr of m.values()) arr.sort(byProfitability)
    return m
  }, [cards.data, search])

  function onDragStart(e: DragStartEvent) {
    setDragging((cards.data ?? []).find((c) => c.id === e.active.id) ?? null)
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const card = (cards.data ?? []).find((c) => c.id === e.active.id)
    const target = e.over?.id as string | undefined
    if (card && target && target !== card.column_id) update.mutate({ id: card.id, patch: { column_id: target } })
  }

  const total = cards.data?.length ?? 0

  return (
    <div className="theme-produits dark -mx-4 -my-5 flex h-[calc(100dvh-3.5rem)] flex-col bg-background text-foreground sm:-mx-6">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <TrendingUp className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">Idées produits</h1>
            <p className="text-xs text-muted-foreground">{total} produit{total > 1 ? 's' : ''} · Amazon en lecture seule</p>
          </div>
        </div>
        {companies.length > 1 && (
          <NativeSelect className="h-9 w-auto max-w-44" value={companyId ?? ''} onChange={(e) => select(e.target.value)} aria-label="Société">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher…" className="h-9 w-36 pl-8 sm:w-48" />
        </div>
        <Button variant="outline" asChild>
          <Link to={`/produits/courses${companyId ? `?societe=${companyId}` : ''}`}>
            <ShoppingCart className="size-4" /> <span className="hidden sm:inline">Liste de courses</span>
          </Link>
        </Button>
        <Button onClick={() => cols[0] && setEditing({ card: null, columnId: cols[0].id })} disabled={!cols.length}>
          <Plus className="size-4" /> <span className="hidden sm:inline">Produit</span>
        </Button>
      </div>

      {loading || columns.isLoading || !companyId ? (
        <div className="flex gap-3 overflow-hidden p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 shrink-0" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden p-4 sm:snap-none sm:px-6">
            {cols.map((col, i) => (
              <Column
                key={col.id}
                column={col}
                cards={byColumn.get(col.id) ?? []}
                prev={cols[i - 1]}
                next={cols[i + 1]}
                onOpen={(card) => setEditing({ card, columnId: col.id })}
                onAdd={() => setEditing({ card: null, columnId: col.id })}
              />
            ))}
            <AddColumn companyId={companyId} position={(cols.at(-1)?.position ?? 0) + 1000} />
          </div>
          <DragOverlay>{dragging && <CardFace card={dragging} overlay />}</DragOverlay>
        </DndContext>
      )}

      {companyId && editing && (
        <ProductCardDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          card={editing.card}
          columns={cols}
          companyId={companyId}
          defaultColumnId={editing.columnId}
        />
      )}
    </div>
  )
}

function Column({
  column, cards, prev, next, onOpen, onAdd,
}: {
  column: ProductColumn
  cards: ProductCard[]
  prev?: ProductColumn
  next?: ProductColumn
  onOpen: (c: ProductCard) => void
  onAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(column.name)
  const [deleting, setDeleting] = useState(false)
  const patch = useProductMutation((p: Partial<ProductColumn>) => supabase.from('product_columns').update(p).eq('id', column.id))
  const remove = useProductMutation(() => supabase.from('product_columns').delete().eq('id', column.id), 'Colonne supprimée')
  // Échange de position avec la colonne voisine.
  const swap = useProductMutation(async (other: ProductColumn) => {
    const a = await supabase.from('product_columns').update({ position: other.position }).eq('id', column.id)
    if (a.error) return a
    return supabase.from('product_columns').update({ position: column.position }).eq('id', other.id)
  })
  const sum = cards.reduce((s, c) => s + (effectiveProfit(c) ?? 0), 0)

  function commitName() {
    setRenaming(false)
    const n = name.trim()
    if (n && n !== column.name) patch.mutate({ name: n })
    else setName(column.name)
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex h-full w-[85vw] max-w-[320px] shrink-0 snap-center flex-col rounded-xl border bg-card/60 sm:w-[300px]',
        isOver && 'border-primary/70 bg-primary/5',
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        {renaming ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') {
                setName(column.name)
                setRenaming(false)
              }
            }}
            className="h-8"
          />
        ) : (
          <button onDoubleClick={() => setRenaming(true)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {column.is_store && <Store className="size-3.5 shrink-0 text-primary" />}
            {column.is_protected && <ShieldCheck className="size-3.5 shrink-0 text-amber-400" />}
            <span className="truncate text-sm font-semibold">{column.name}</span>
            <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{cards.length}</span>
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Options de la colonne"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="theme-produits dark text-foreground">
            <DropdownMenuItem onSelect={() => setRenaming(true)}><Pencil className="size-4" /> Renommer</DropdownMenuItem>
            <DropdownMenuItem disabled={!prev} onSelect={() => prev && swap.mutate(prev)}><ArrowLeft className="size-4" /> Déplacer à gauche</DropdownMenuItem>
            <DropdownMenuItem disabled={!next} onSelect={() => next && swap.mutate(next)}><ArrowRight className="size-4" /> Déplacer à droite</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => patch.mutate({ is_store: !column.is_store })}>
              <Store className="size-4" /> {column.is_store ? 'Ne plus utiliser comme magasin' : 'Colonne magasin (courses)'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => patch.mutate({ is_protected: !column.is_protected })}>
              <ShieldCheck className="size-4" /> {column.is_protected ? 'Retirer la protection' : 'Protéger (double confirmation)'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-400" onSelect={() => setDeleting(true)}><Trash2 className="size-4" /> Supprimer la colonne</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {sum !== 0 && (
        <p className="flex items-center gap-1 px-3 pb-2 text-[11px] text-muted-foreground">
          <BarChart3 className="size-3" /> Bénéfice cumulé : <span className="text-primary">{money(sum)}</span>
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.map((c) => <DraggableCard key={c.id} card={c} onOpen={() => onOpen(c)} />)}
        {!cards.length && (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Glissez une carte ici</p>
        )}
      </div>
      <button onClick={onAdd} className="m-2 mt-0 flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
        <Plus className="size-4" /> Ajouter un produit
      </button>

      <DeleteGuard
        open={deleting}
        onOpenChange={setDeleting}
        title={`Supprimer la colonne « ${column.name} » ?`}
        description={cards.length ? `Ses ${cards.length} carte(s) seront aussi supprimées. Déplacez-les avant si vous voulez les garder.` : 'La colonne est vide.'}
        strict={column.is_protected && cards.length > 0}
        strictReason={`Colonne protégée : ses ${cards.length} carte(s) seront supprimées. Une seconde confirmation est demandée.`}
        onConfirm={() => remove.mutate(undefined)}
      />
    </section>
  )
}

function DraggableCard({ card, onOpen }: { card: ProductCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={cn('touch-manipulation', isDragging && 'opacity-30')}>
      <CardFace card={card} />
    </div>
  )
}

export function CardFace({ card, overlay }: { card: ProductCard; overlay?: boolean }) {
  const profit = effectiveProfit(card)
  const roi = effectiveRoi(card)
  const verdict = VERDICTS.find((v) => v.value === card.verdict)
  return (
    <article
      className={cn(
        'cursor-pointer rounded-lg border bg-card p-2.5 shadow-sm transition hover:border-primary/40',
        overlay && 'w-[280px] rotate-2 border-primary/60 shadow-xl',
      )}
    >
      <div className="flex gap-2.5">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/90">
          {card.image_url ? (
            <img src={card.image_url} alt="" loading="lazy" className="size-full object-contain" />
          ) : (
            <ImageOff className="size-4 text-zinc-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug">{card.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={cn('font-semibold', profit == null ? 'text-muted-foreground' : profit >= 0 ? 'text-primary' : 'text-red-400')}>
              {money(profit)}
            </span>
            {roi != null && <span className="text-muted-foreground">· ROI {intFr(Math.round(roi))} %</span>}
          </div>
        </div>
      </div>
      {(card.monthly_sales != null || card.bsr != null || verdict || card.received_at) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {[card.monthly_sales != null && `${intFr(card.monthly_sales)} ventes/mois`, card.bsr != null && `BSR ${intFr(card.bsr)}`]
            .filter(Boolean)
            .join(' · ')}
          <span className="ml-auto flex items-center gap-1">
            {card.received_at && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-sky-300">
                <PackageCheck className="size-3" /> Reçu
              </span>
            )}
            {verdict && <span className={cn('rounded-full px-1.5 py-0.5 ring-1', verdict.className)}>{verdict.label}</span>}
          </span>
        </div>
      )}
    </article>
  )
}

function AddColumn({ companyId, position }: { companyId: string; position: number }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const add = useProductMutation((n: string) => supabase.from('product_columns').insert({ company_id: companyId, name: n, position }))
  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    add.mutate(n, {
      onSuccess: () => {
        setName('')
        setOpen(false)
      },
    })
  }
  return (
    <div className="w-[85vw] max-w-[320px] shrink-0 snap-center sm:w-[300px]">
      {open ? (
        <form onSubmit={submit} className="grid gap-2 rounded-xl border bg-card/60 p-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la colonne" />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Ajouter</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground">
          <Plus className="size-4" /> Ajouter une colonne
        </button>
      )}
    </div>
  )
}
