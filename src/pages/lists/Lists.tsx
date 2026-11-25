import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronRight, ListChecks, Loader2, Repeat, Send, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useProfiles } from '@/hooks/data'
import { fullName } from '@/lib/labels'
import { itemsToText, parseQuickList } from '@/lib/quickList'
import { errorMessage, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useQuickList, useQuickLists } from './hooks'

const LAST_PERSON = 'listes:personne'

/**
 * « Listes » : on colle sa liste telle qu'on l'écrirait sur WhatsApp,
 * elle devient une liste à cocher pour la personne choisie.
 */
export default function Lists() {
  const { session } = useAuth()
  const uid = session?.user.id
  const lists = useQuickLists()
  const profiles = useProfiles()
  const others = useMemo(() => (profiles.data ?? []).filter((p) => p.is_active && p.id !== uid), [profiles.data, uid])

  const mine = (lists.data ?? []).filter((l) => l.assignee_id === uid)
  const sent = (lists.data ?? []).filter((l) => l.assignee_id !== uid)

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader
        title="Listes"
        description="Collez votre liste, envoyez-la, suivez ce qui est coché."
        icon={<span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ListChecks className="size-5" /></span>}
      />

      {lists.isLoading ? (
        <Skeleton className="h-24" />
      ) : (
        mine.length > 0 && <ListGroup title="Pour moi" lists={mine} who={(l) => `De ${fullName(profiles.map.get(l.created_by ?? ''))}`} />
      )}

      <NewList people={others} myId={uid} />

      {sent.length > 0 && (
        <ListGroup title="Listes envoyées" lists={sent} who={(l) => `Pour ${l.assignee_id ? fullName(profiles.map.get(l.assignee_id)) : 'personne'}`} />
      )}
    </div>
  )
}

function ListGroup({
  title, lists, who,
}: {
  title: string
  lists: ReturnType<typeof useQuickLists>['data'] & object
  who: (l: NonNullable<ReturnType<typeof useQuickLists>['data']>[number]) => string
}) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {lists.map((l) => {
        const total = l.quick_list_items.length
        const done = l.quick_list_items.filter((i) => i.done).length
        const pct = total ? Math.round((done / total) * 100) : 0
        return (
          <Link key={l.id} to={`/listes/${l.id}`}>
            <Card className="flex items-center gap-3 p-3 transition hover:border-primary/40">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.title}</p>
                <p className="text-xs text-muted-foreground">
                  {who(l)} · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: fr })}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className={cn('shrink-0 text-sm font-semibold tabular-nums', pct === 100 && 'text-emerald-600')}>{done}/{total}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        )
      })}
    </section>
  )
}

function NewList({ people, myId }: { people: { id: string; first_name: string; last_name: string; email: string }[]; myId?: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [person, setPerson] = useState<string>('')
  const carryId = params.get('reporter') ?? undefined
  const carry = useQuickList(carryId)
  const [text, setText] = useState('')
  // Reprise d'une liste : on pré-remplit avec les lignes pas encore faites.
  const [prefilled, setPrefilled] = useState<string | null>(null)
  useEffect(() => {
    if (!carryId || !carry.data?.list || prefilled === carryId) return
    setPrefilled(carryId)
    setText(itemsToText(carry.data.items.filter((i) => !i.done)) + '\n\n')
    if (carry.data.list.assignee_id) setPerson(carry.data.list.assignee_id)
  }, [carryId, carry.data, prefilled])
  const carryLeft = carry.data?.items.filter((i) => !i.done) ?? []
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  let saved = ''
  try {
    saved = localStorage.getItem(LAST_PERSON) ?? ''
  } catch {
    /* stockage indisponible */
  }
  const fallback = people.find((p) => /raph/i.test(`${p.first_name} ${p.email}`)) ?? people[0]
  const assignee = person || (people.some((p) => p.id === saved) ? saved : fallback?.id ?? myId ?? '')

  const parsed = parseQuickList(text)
  const sections = new Set(parsed.items.map((i) => i.section ?? ''))

  async function create() {
    if (!parsed.items.length) return toast.error('Collez au moins une ligne.')
    setSaving(true)
    try {
      try {
        localStorage.setItem(LAST_PERSON, assignee)
      } catch {
        /* ignoré */
      }
      const t = title.trim() || parsed.title || `Liste du ${new Date().toLocaleDateString('fr-FR')}`
      const { data, error } = await supabase
        .from('quick_lists')
        .insert({ title: t.slice(0, 200), assignee_id: assignee || null })
        .select('id')
        .single()
      if (error) throw error
      const { error: e2 } = await supabase
        .from('quick_list_items')
        .insert(parsed.items.map((it, i) => ({ list_id: data.id, section: it.section?.slice(0, 80) ?? null, text: it.text, position: i + 1 })))
      if (e2) throw e2
      if (carryId && carry.data?.list) {
        // Les notes suivent les lignes reprises (même bloc, même texte), puis l'ancienne liste est archivée.
        const { data: fresh } = await supabase.from('quick_list_items').select('id, section, text').eq('list_id', data.id)
        for (const old of carryLeft.filter((i) => i.note)) {
          const match = (fresh ?? []).find((n) => n.text === old.text && (n.section ?? null) === (old.section ?? null))
          if (match) await supabase.from('quick_list_items').update({ note: old.note }).eq('id', match.id)
        }
        await supabase.from('quick_lists').update({ archived_at: new Date().toISOString() }).eq('id', carryId)
      }
      qc.invalidateQueries({ queryKey: ['quick_lists'] })
      navigate(`/listes/${data.id}?nouvelle=1`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="grid gap-3 p-4">
      <h2 className="font-semibold">Nouvelle liste</h2>
      {carryId && carry.data?.list && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <Repeat className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="flex-1">
            Reprise de « {carry.data.list.title} » : les {carryLeft.length} ligne{carryLeft.length > 1 ? 's' : ''} pas encore faite{carryLeft.length > 1 ? 's' : ''} sont
            déjà dans la liste. Ajoutez les nouvelles, puis créez la liste : l'ancienne sera archivée.
          </p>
          <button
            type="button"
            aria-label="Annuler la reprise"
            onClick={() => {
              setText('')
              setPrefilled(null)
              setParams((p) => {
                p.delete('reporter')
                return p
              })
            }}
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Collez votre liste, par exemple :\n\nUzeet :\n* Relancer Cassandre\n* Compta\n\nSELIIT :\n- Point tréso\n- Buy box'}
        className="font-[inherit] text-[15px]"
      />
      {parsed.items.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {parsed.items.length} ligne{parsed.items.length > 1 ? 's' : ''} à cocher
          {sections.size > 1 || !sections.has('') ? ` · ${[...sections].filter(Boolean).join(', ')}` : ''}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={parsed.title ?? 'Titre (facultatif)'} />
        <NativeSelect value={assignee} onChange={(e) => setPerson(e.target.value)} aria-label="Pour qui ?">
          {people.map((p) => <option key={p.id} value={p.id}>Pour {fullName(p)}</option>)}
          {myId && <option value={myId}>Pour moi</option>}
        </NativeSelect>
      </div>
      <Button onClick={create} disabled={saving || !parsed.items.length} size="lg">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Créer la liste
      </Button>
    </Card>
  )
}
