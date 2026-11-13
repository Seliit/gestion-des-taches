import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isToday } from 'date-fns'
import { Check, ListTodo, PartyPopper } from 'lucide-react'
import { CompanyDot, DueBadge, PriorityBadge } from '@/components/tasks/badges'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useCompanies, useTasks, useUpdateTask } from '@/hooks/data'
import { isOverdue, priorityRank } from '@/lib/labels'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * « Ma liste » : vue simple, pensée pour le téléphone, des tâches qui me sont attribuées.
 * Un appui sur le rond coche la tâche (terminée) ; un second appui la décoche.
 */
export default function MyList() {
  const { session, profile } = useAuth()
  const uid = session?.user.id
  const tasks = useTasks()
  const companies = useCompanies()
  const update = useUpdateTask()
  const [tab, setTab] = useState<'todo' | 'done'>('todo')
  // État local pour un retour immédiat au toucher, avant la réponse du serveur.
  const [local, setLocal] = useState<Record<string, boolean>>({})

  const mine = useMemo(
    () => (tasks.data ?? []).filter((t) => t.assignee_id === uid || t.task_assignees?.some((a) => a.user_id === uid)),
    [tasks.data, uid],
  )
  const isDone = (t: Task) => local[t.id] ?? t.status === 'done'

  const todo = mine
    .filter((t) => t.status !== 'done')
    .sort(
      (a, b) =>
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        priorityRank[a.priority] - priorityRank[b.priority] ||
        (a.due_date ?? '9').localeCompare(b.due_date ?? '9'),
    )
  const done = mine
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const doneToday = done.filter((t) => t.completed_at && isToday(new Date(t.completed_at))).length
  const total = todo.length + doneToday
  const list = tab === 'todo' ? todo : done.slice(0, 100)

  function toggle(t: Task) {
    const next = !isDone(t)
    setLocal((l) => ({ ...l, [t.id]: next }))
    if (navigator.vibrate) navigator.vibrate(10)
    update.mutate(
      { id: t.id, patch: { status: next ? 'done' : 'todo' } },
      { onSettled: () => setTimeout(() => setLocal((l) => { const n = { ...l }; delete n[t.id]; return n }), 600) },
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile?.first_name ? `Ma liste, ${profile.first_name}` : 'Ma liste'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {todo.length ? `${todo.length} tâche${todo.length > 1 ? 's' : ''} à faire` : 'Tout est fait'}
          {doneToday > 0 && ` · ${doneToday} cochée${doneToday > 1 ? 's' : ''} aujourd’hui`}
        </p>
        {total > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneToday / total) * 100}%` }} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
        {(['todo', 'done'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('rounded-md py-2 font-medium text-muted-foreground', tab === k && 'bg-background text-foreground shadow-sm')}
          >
            {k === 'todo' ? `À faire (${todo.length})` : `Faites (${done.length})`}
          </button>
        ))}
      </div>

      {tasks.isLoading ? (
        <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !list.length ? (
        tab === 'todo' ? (
          <EmptyState icon={<PartyPopper />} title="Rien à faire" description="Aucune tâche ne vous est attribuée pour le moment." />
        ) : (
          <EmptyState icon={<ListTodo />} title="Aucune tâche terminée" description="Les tâches cochées apparaîtront ici." />
        )
      ) : (
        <ul className="grid gap-2">
          {list.map((t) => {
            const checked = isDone(t)
            const company = companies.data?.find((c) => c.id === t.company_id)
            return (
              <li
                key={t.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border bg-card p-3 shadow-xs transition-opacity',
                  checked && tab === 'todo' && 'opacity-50',
                  isOverdue(t) && !checked && 'border-red-300 dark:border-red-900',
                )}
              >
                <button
                  onClick={() => toggle(t)}
                  aria-label={checked ? 'Décocher' : 'Cocher'}
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 active:bg-muted',
                  )}
                >
                  {checked && <Check className="size-5" strokeWidth={3} />}
                </button>
                <Link to={`/taches/${t.id}`} className="min-w-0 flex-1">
                  <p className={cn('text-[15px] font-medium leading-snug', checked && 'line-through')}>{t.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CompanyDot company={company} withName />
                    <PriorityBadge priority={t.priority} compact />
                    <DueBadge task={t} />
                  </div>
                  {t.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
