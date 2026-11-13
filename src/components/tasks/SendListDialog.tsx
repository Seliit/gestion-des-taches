import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, MessageCircle, Send, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/label'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/misc'
import { useMembers } from '@/hooks/data'
import { fmtDate, fullName, priorityRank } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Profile, Task } from '@/lib/types'

/** Construit le message texte envoyé avec la liste (WhatsApp, SMS, copier-coller). */
export function buildListMessage(firstName: string, tasks: Task[]) {
  const lines = [...tasks]
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
    .map((t, i) => {
      const extra = [
        t.priority === 'urgent' ? 'URGENT' : null,
        t.due_date ? `avant le ${fmtDate(t.due_date, 'EEE d MMM')}` : null,
      ].filter(Boolean)
      return `${i + 1}. ${t.title}${extra.length ? ` (${extra.join(', ')})` : ''}`
    })
  return [
    `Salut${firstName ? ` ${firstName}` : ''} ! Voici les tâches importantes :`,
    '',
    ...lines,
    '',
    `Coche-les au fur et à mesure ici : ${window.location.origin}/ma-liste`,
  ].join('\n')
}

/**
 * Envoie une sélection de tâches à quelqu'un : la personne en devient responsable
 * (elle les retrouve dans « Ma liste » sur son téléphone et reçoit une notification),
 * puis on propose un message prêt à partager.
 */
export function SendListDialog({
  open, onOpenChange, tasks, onSent,
}: { open: boolean; onOpenChange: (o: boolean) => void; tasks: Task[]; onSent?: () => void }) {
  const qc = useQueryClient()
  const members = useMembers()
  const [userId, setUserId] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Personnes membres de toutes les sociétés concernées (sinon l'attribution serait refusée).
  const people = useMemo(() => {
    const companies = [...new Set(tasks.map((t) => t.company_id))]
    const byUser = new Map<string, { profile: Profile; companies: Set<string> }>()
    const rows = (members.data ?? []).filter((m) => m.is_active && m.profile?.is_active)
    for (const m of rows) {
      const e = byUser.get(m.user_id) ?? { profile: m.profile, companies: new Set<string>() }
      e.companies.add(m.company_id)
      byUser.set(m.user_id, e)
    }
    return [...byUser.entries()]
      .filter(([, e]) => companies.every((c) => e.companies.has(c)))
      .map(([id, e]) => ({ id, profile: e.profile }))
      .sort((a, b) => fullName(a.profile).localeCompare(fullName(b.profile)))
  }, [members.data, tasks])

  const person = people.find((p) => p.id === userId)

  function close(o: boolean) {
    onOpenChange(o)
    if (!o) {
      setMessage(null)
      setUrgent(false)
    }
  }

  async function send() {
    if (!person) return
    setBusy(true)
    const patch: Partial<Task> = { assignee_id: person.id }
    if (urgent) patch.priority = 'high'
    const ids = tasks.map((t) => t.id)
    const { error } = await supabase.from('tasks').update(patch).in('id', ids)
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['tasks'] })
    toast.success(`${tasks.length} tâche${tasks.length > 1 ? 's' : ''} envoyée${tasks.length > 1 ? 's' : ''} à ${fullName(person.profile)}`)
    const updated = tasks.map((t) => ({ ...t, ...patch }) as Task)
    setMessage(buildListMessage(person.profile.first_name, updated))
    onSent?.()
  }

  async function copy() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      toast.success('Message copié')
    } catch {
      toast.error('Copie impossible : sélectionnez le texte et copiez-le à la main.')
    }
  }

  async function share() {
    if (!message) return
    try {
      await navigator.share({ text: message })
    } catch {
      /* partage annulé */
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {!message ? (
          <>
            <DialogHeader>
              <DialogTitle>Envoyer {tasks.length} tâche{tasks.length > 1 ? 's' : ''}</DialogTitle>
              <DialogDescription>
                La personne en devient responsable : elle les retrouve dans « Ma liste » sur son téléphone et peut les cocher.
              </DialogDescription>
            </DialogHeader>
            <Field label="À qui ?">
              <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Choisir une personne…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{fullName(p.profile)}</option>
                ))}
              </NativeSelect>
            </Field>
            {!members.isLoading && !people.length && (
              <p className="text-sm text-muted-foreground">
                Personne n’est membre de toutes les sociétés de ces tâches. Sélectionnez des tâches d’une même société.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(!!v)} />
              Passer ces tâches en priorité haute
            </label>
            <ul className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm">
              {tasks.map((t) => <li key={t.id} className="truncate py-0.5">• {t.title}</li>)}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Annuler</Button>
              <Button onClick={send} disabled={!person || busy}>
                <Send className="size-4" /> Envoyer
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>C’est envoyé ✅</DialogTitle>
              <DialogDescription>
                Prévenez {person ? fullName(person.profile) : 'la personne'} avec ce message (modifiable) :
              </DialogDescription>
            </DialogHeader>
            <Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`sms:?&body=${encodeURIComponent(message)}`}>
                  <MessageCircle className="size-4" /> SMS
                </a>
              </Button>
              {canShare && (
                <Button variant="outline" onClick={share}>
                  <Share2 className="size-4" /> Partager
                </Button>
              )}
              <Button onClick={copy}>
                <Copy className="size-4" /> Copier
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
