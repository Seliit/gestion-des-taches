import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckSquare, FolderKanban, Search, User } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Avatar } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { fullName } from '@/lib/labels'
import type { Profile, Project, Task } from '@/lib/types'
import { StatusIcon } from '@/components/tasks/badges'

/** Recherche globale : tâches, projets, collaborateurs (résultats limités par les droits RLS). */
export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ tasks: Task[]; projects: Project[]; people: Profile[] }>({ tasks: [], projects: [], people: [] })
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, ' ')
    if (term.length < 2) {
      setResults({ tasks: [], projects: [], people: [] })
      return
    }
    const h = setTimeout(async () => {
      const like = `%${term}%`
      const [t, p, u] = await Promise.all([
        supabase.from('tasks').select('*').or(`title.ilike.${like},description.ilike.${like}`).limit(8),
        supabase.from('projects').select('*').ilike('name', like).limit(5),
        supabase.from('profiles').select('*').or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`).limit(5),
      ])
      setResults({ tasks: (t.data ?? []) as Task[], projects: (p.data ?? []) as Project[], people: (u.data ?? []) as Profile[] })
    }, 200)
    return () => clearTimeout(h)
  }, [q])

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }
  const empty = q.trim().length >= 2 && !results.tasks.length && !results.projects.length && !results.people.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Recherche</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une tâche, un projet, un collaborateur…"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {q.trim().length < 2 && <p className="p-4 text-center text-sm text-muted-foreground">Tapez au moins 2 caractères.</p>}
          {empty && <p className="p-4 text-center text-sm text-muted-foreground">Aucun résultat.</p>}
          {results.tasks.length > 0 && <p className="px-2 py-1 text-xs font-medium text-muted-foreground"><CheckSquare className="mr-1 inline size-3" />Tâches</p>}
          {results.tasks.map((t) => (
            <button key={t.id} onClick={() => go(`/taches/${t.id}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
              <StatusIcon status={t.status} /> <span className="truncate">{t.title}</span>
            </button>
          ))}
          {results.projects.length > 0 && <p className="px-2 py-1 text-xs font-medium text-muted-foreground"><FolderKanban className="mr-1 inline size-3" />Projets</p>}
          {results.projects.map((p) => (
            <button key={p.id} onClick={() => go(`/projets/${p.id}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
              <FolderKanban className="size-4 text-muted-foreground" /> <span className="truncate">{p.name}</span>
            </button>
          ))}
          {results.people.length > 0 && <p className="px-2 py-1 text-xs font-medium text-muted-foreground"><User className="mr-1 inline size-3" />Collaborateurs</p>}
          {results.people.map((p) => (
            <button key={p.id} onClick={() => go(`/collaborateurs/${p.id}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
              <Avatar name={fullName(p)} url={p.avatar_url} size={20} /> <span className="truncate">{fullName(p)}</span>
              <span className="truncate text-xs text-muted-foreground">{p.email}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
