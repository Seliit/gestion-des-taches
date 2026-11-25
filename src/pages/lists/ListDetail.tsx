import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Archive, Check, Copy, MessageCircle, PartyPopper, Plus, Repeat, StickyNote, Trash2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useProfiles } from '@/hooks/data'
import { fullName } from '@/lib/labels'
import { listToMessage } from '@/lib/quickList'
import { errorMessage, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { type QuickListItem, useQuickList, useToggleItem } from './hooks'

/** Une liste : un bloc par société, un appui sur une ligne la coche. */
export default function ListDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { session, isSuperAdmin } = useAuth()
  const q = useQuickList(id)
  const profiles = useProfiles()
  const toggle = useToggleItem(id ?? '')
  const [editing, setEditing] = useState(false)
  const [newText, setNewText] = useState<Record<string, string>>({})

  const items = useMemo(() => q.data?.items ?? [], [q.data])
  const groups = useMemo(() => {
    const m = new Map<string, QuickListItem[]>()
    for (const it of items) {
      const k = it.section ?? ''
      m.set(k, [...(m.get(k) ?? []), it])
    }
    return [...m.entries()]
  }, [items])

  if (q.isLoading) return <div className="mx-auto grid max-w-2xl gap-3"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
  const list = q.data?.list
  if (!list) return <EmptyState title="Liste introuvable" description="Elle a peut-être été supprimée." action={<Button asChild><Link to="/">Mes listes</Link></Button>} />

  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const assignee = list.assignee_id ? profiles.map.get(list.assignee_id) : undefined
  const author = list.created_by ? profiles.map.get(list.created_by) : undefined
  const canManage = isSuperAdmin || list.created_by === session?.user.id
  const link = `${window.location.origin}/listes/${list.id}`
  const message = listToMessage(list.title, link, items)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['quick_list', id] })
    qc.invalidateQueries({ queryKey: ['quick_lists'] })
  }

  async function addItem(section: string) {
    const text = (newText[section] ?? '').trim()
    if (!text) return
    const pos = Math.max(0, ...items.filter((i) => (i.section ?? '') === section).map((i) => i.position)) + 0.5
    const { error } = await supabase.from('quick_list_items').insert({ list_id: list!.id, section: section || null, text, position: pos })
    if (error) return toast.error(errorMessage(error))
    setNewText((s) => ({ ...s, [section]: '' }))
    refresh()
  }
  async function removeItem(itemId: string) {
    const { error } = await supabase.from('quick_list_items').delete().eq('id', itemId)
    if (error) return toast.error(errorMessage(error))
    refresh()
  }
  async function archive() {
    const { error } = await supabase.from('quick_lists').update({ archived_at: new Date().toISOString() }).eq('id', list!.id)
    if (error) return toast.error(errorMessage(error))
    toast.success('Liste archivée')
    qc.invalidateQueries({ queryKey: ['quick_lists'] })
    navigate('/')
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      toast.success('Copié')
    } catch {
      toast.error('Copie impossible')
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-4 pb-10">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon" asChild><Link to="/" aria-label="Retour"><ArrowLeft className="size-4" /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug">{list.title}</h1>
          <p className="text-sm text-muted-foreground">
            {assignee ? `Pour ${fullName(assignee)}` : 'Sans destinataire'}
            {author && list.created_by !== list.assignee_id ? ` · de ${fullName(author)}` : ''}
          </p>
        </div>
        <span className={cn('mt-1 shrink-0 text-lg font-semibold tabular-nums', pct === 100 && 'text-emerald-600')}>{done}/{items.length}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>

      {params.get('nouvelle') && canManage && (
        <div className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">Liste créée. Envoyez le lien {assignee ? `à ${assignee.first_name || fullName(assignee)}` : ''} :</p>
          <ShareButtons message={message} phone={assignee?.phone} onCopy={copy} />
        </div>
      )}

      {pct === 100 && items.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <PartyPopper className="size-4" /> Tout est fait, bravo !
        </div>
      )}

      {groups.map(([section, its]) => {
        const d = its.filter((i) => i.done).length
        return (
          <section key={section} className="grid gap-1.5">
            {section && (
              <h2 className="flex items-center justify-between px-1 pt-2 text-sm font-bold uppercase tracking-wide">
                {section}
                <span className="text-xs font-medium text-muted-foreground">{d}/{its.length}</span>
              </h2>
            )}
            {[...its].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position).map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                editing={editing}
                onToggle={() => toggle.mutate({ id: it.id, done: !it.done })}
                onRemove={() => removeItem(it.id)}
                onSaved={refresh}
              />
            ))}
            {editing && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addItem(section)
                }}
              >
                <Input
                  value={newText[section] ?? ''}
                  onChange={(e) => setNewText((s) => ({ ...s, [section]: e.target.value }))}
                  placeholder={`Ajouter une ligne${section ? ` (${section})` : ''}`}
                />
                <Button type="submit" variant="outline" size="icon" aria-label="Ajouter"><Plus className="size-4" /></Button>
              </form>
            )}
          </section>
        )
      })}

      <div className="mt-2 grid gap-2 border-t pt-4">
        {!params.get('nouvelle') && canManage && <ShareButtons message={message} phone={assignee?.phone} onCopy={copy} />}
        {canManage && items.some((i) => !i.done) && (
          <Button variant="outline" asChild>
            <Link to={`/?reporter=${list.id}`}>
              <Repeat className="size-4" /> Reporter le reste dans une nouvelle liste
            </Link>
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Terminer' : 'Modifier la liste'}
          </Button>
          {canManage && (
            <Button variant="ghost" className="text-muted-foreground" onClick={archive}>
              <Archive className="size-4" /> Archiver
            </Button>
          )}
          {canManage && editing && (
            <Button
              variant="ghost"
              className="text-red-600"
              onClick={async () => {
                const { error } = await supabase.from('quick_lists').delete().eq('id', list.id)
                if (error) return toast.error(errorMessage(error))
                toast.success('Liste supprimée')
                qc.invalidateQueries({ queryKey: ['quick_lists'] })
                navigate('/')
              }}
            >
              <Trash2 className="size-4" /> Supprimer
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ShareButtons({ message, phone, onCopy }: { message: string; phone?: string | null; onCopy: () => void }) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0(\d{9})$/, '33$1')
  const wa = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild className="bg-[#25D366] text-white hover:bg-[#1fb857]">
        <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> Envoyer sur WhatsApp</a>
      </Button>
      <Button variant="outline" onClick={onCopy}><Copy className="size-4" /> Copier le message</Button>
    </div>
  )
}

/**
 * Une ligne : le rond coche, le texte ouvre la ligne pour la corriger et y mettre une note.
 */
function ItemRow({
  item, editing, onToggle, onRemove, onSaved,
}: {
  item: QuickListItem
  editing: boolean
  onToggle: () => void
  onRemove: () => void
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(item.text)
  const [note, setNote] = useState(item.note ?? '')
  const [saving, setSaving] = useState(false)

  function start() {
    setText(item.text)
    setNote(item.note ?? '')
    setOpen(true)
  }
  async function save() {
    if (!text.trim()) return toast.error('La ligne ne peut pas être vide.')
    setSaving(true)
    const { error } = await supabase
      .from('quick_list_items')
      .update({ text: text.trim().slice(0, 500), note: note.trim() || null })
      .eq('id', item.id)
    setSaving(false)
    if (error) return toast.error(errorMessage(error))
    setOpen(false)
    onSaved()
  }

  return (
    <div className={cn('rounded-xl border bg-card p-3 transition', item.done && !open && 'opacity-55')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={item.done ? 'Décocher' : 'Cocher'}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 active:bg-muted',
          )}
        >
          {item.done && <Check className="size-5" strokeWidth={3} />}
        </button>
        <button type="button" onClick={() => (open ? setOpen(false) : start())} className="min-w-0 flex-1 pt-1 text-left">
          <span className={cn('block text-[15px] leading-snug', item.done && 'line-through')}>{item.text}</span>
          {item.note && !open && (
            <span className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-3 whitespace-pre-line">{item.note}</span>
            </span>
          )}
          {!item.note && !open && !item.done && (
            <span className="mt-0.5 block text-xs text-muted-foreground/70">+ note</span>
          )}
        </button>
        {editing && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Retirer la ligne">
            <X className="size-4" />
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-2 pl-11">
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Texte de la ligne" />
          <Textarea
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (ex. : appelé lundi, attend sa réponse…)"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  )
}
