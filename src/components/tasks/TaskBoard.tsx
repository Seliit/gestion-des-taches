import { useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, Columns3, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useCompanies, useTeams } from '@/hooks/data'
import { applyFilters, emptyFilters, TaskFilters, type TaskFilterState } from './filters'
import { useTaskDialog, type TaskDefaults } from './TaskFormDialog'
import { CalendarView, KanbanView, ListView } from './views'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'

type View = 'kanban' | 'list' | 'calendar'

function readView(key: string, fallback: View): View {
  try {
    return (localStorage.getItem(`view:${key}`) as View) || fallback
  } catch {
    return fallback
  }
}

export function TaskBoard({
  tasks,
  loading,
  storageKey,
  defaultView = 'kanban',
  fixedCompanyId,
  createDefaults,
  hideFilters = [],
  initialFilters,
  views = ['kanban', 'list', 'calendar'],
  extra,
}: {
  tasks: Task[]
  loading?: boolean
  storageKey: string
  defaultView?: View
  fixedCompanyId?: string
  createDefaults?: TaskDefaults
  hideFilters?: (keyof TaskFilterState)[]
  initialFilters?: Partial<TaskFilterState>
  views?: View[]
  extra?: ReactNode
}) {
  const [view, setViewState] = useState<View>(() => readView(storageKey, defaultView))
  const [filters, setFilters] = useState<TaskFilterState>({ ...emptyFilters, ...initialFilters })
  const { canCreateTask, memberships, isSuperAdmin } = useAuth()
  const companies = useCompanies()
  const teams = useTeams()
  const dialog = useTaskDialog()
  const filtered = useMemo(() => applyFilters(tasks, filters, teams.data), [tasks, filters, teams.data])
  const canCreate = fixedCompanyId
    ? canCreateTask(fixedCompanyId)
    : isSuperAdmin || memberships.some((m) => canCreateTask(m.company_id)) || (companies.data ?? []).some((c) => canCreateTask(c.id))

  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(`view:${storageKey}`, v)
    } catch {
      /* ignore */
    }
  }
  const create = (d?: TaskDefaults) => dialog.openCreate({ companyId: fixedCompanyId || filters.companyId || undefined, ...createDefaults, ...d })

  const icons: Record<View, ReactNode> = { kanban: <Columns3 />, list: <List />, calendar: <CalendarDays /> }
  const labels: Record<View, string> = { kanban: 'Kanban', list: 'Liste', calendar: 'Calendrier' }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn('inline-flex rounded-lg bg-muted p-0.5 text-sm', views.length < 2 && 'invisible')}>
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 [&_svg]:size-4',
                view === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {icons[v]} <span className="hidden sm:inline">{labels[v]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {canCreate && (
            <Button size="sm" onClick={() => create()}>
              <Plus /> Nouvelle tâche
            </Button>
          )}
        </div>
      </div>
      <TaskFilters value={filters} onChange={setFilters} fixedCompanyId={fixedCompanyId} hide={hideFilters} />
      <p className="text-xs text-muted-foreground">
        {filtered.length} tâche{filtered.length > 1 ? 's' : ''}
      </p>
      {loading ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : (views.includes(view) ? view : views[0]) === 'kanban' ? (
        <KanbanView tasks={filtered} onAdd={canCreate ? (status) => create({ status }) : undefined} />
      ) : (views.includes(view) ? view : views[0]) === 'list' ? (
        <ListView tasks={filtered} />
      ) : (
        <CalendarView
          tasks={filtered}
          onCreateAt={canCreate ? (d) => { const x = new Date(d); x.setHours(18, 0, 0, 0); create({ dueDate: x.toISOString() }) } : undefined}
        />
      )}
      {dialog.node}
    </div>
  )
}
