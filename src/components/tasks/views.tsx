import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListChecks, Plus, Send, X } from 'lucide-react'
import { Avatar, Checkbox, EmptyState } from '@/components/ui/misc'
import { SendListDialog } from './SendListDialog'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { CompanyDot, DueBadge, PriorityBadge, PrivateIcon, StatusIcon } from './badges'
import { BlockDialog } from './BlockDialog'
import { useAuth } from '@/context/auth'
import { useCompanies, useManagedIds, useProfiles, useProjects, useUpdateTask } from '@/hooks/data'
import { fmtDate, fullName, isOverdue, PRIORITIES, priorityLabel, priorityRank, STATUSES, statusColor, statusLabel } from '@/lib/labels'
import type { Task, TaskPriority, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Qui peut changer le statut (affichage) : gestionnaire, responsable ou collaborateur associé. */
function useTaskPerms() {
  const { session, canManageTask } = useAuth()
  const managed = useManagedIds()
  const uid = session?.user.id
  return {
    canManage: (t: Task) => canManageTask(t, managed),
    canWork: (t: Task) =>
      canManageTask(t, managed) || t.assignee_id === uid || !!t.task_assignees?.some((a) => a.user_id === uid),
  }
}

/** Changement de statut avec demande d'explication pour un blocage. */
export function useStatusChanger() {
  const update = useUpdateTask()
  const [pending, setPending] = useState<Task | null>(null)
  const change = (t: Task, status: TaskStatus) => {
    if (status === t.status) return
    if (status === 'blocked') return setPending(t)
    update.mutate({ id: t.id, patch: { status } })
  }
  const dialog = (
    <BlockDialog
      open={!!pending}
      onOpenChange={(o) => !o && setPending(null)}
      onConfirm={(reason) => {
        if (pending) update.mutate({ id: pending.id, patch: { status: 'blocked', blocked_reason: reason } })
        setPending(null)
      }}
    />
  )
  return { change, dialog }
}

function SubtaskProgress({ task }: { task: Task }) {
  const n = task.subtasks?.length ?? 0
  if (!n) return null
  const done = task.subtasks!.filter((s) => s.is_done).length
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ListChecks className="size-3" /> {done}/{n}
    </span>
  )
}

function Assignees({ task, size = 20 }: { task: Task; size?: number }) {
  const { map } = useProfiles()
  const ids = [task.assignee_id, ...(task.task_assignees?.map((a) => a.user_id) ?? [])].filter(
    (x, i, arr): x is string => !!x && arr.indexOf(x) === i,
  )
  if (!ids.length) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex -space-x-1.5">
      {ids.slice(0, 3).map((id) => {
        const p = map.get(id)
        return <Avatar key={id} name={fullName(p)} url={p?.avatar_url} size={size} />
      })}
      {ids.length > 3 && <span className="pl-2 text-xs text-muted-foreground">+{ids.length - 3}</span>}
    </div>
  )
}

// ======================= KANBAN =======================

function KanbanCard({ task, draggable }: { task: Task; draggable: boolean }) {
  const companies = useCompanies()
  const company = companies.data?.find((c) => c.id === task.company_id)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable })
  const navigate = useNavigate()
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => navigate(`/taches/${task.id}`)}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'group cursor-pointer rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-md',
        isDragging && 'z-50 rotate-1 opacity-90 shadow-lg',
        draggable && 'touch-none',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <CompanyDot company={company} withName />
        <PrivateIcon show={task.is_private} />
      </div>
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      {task.status === 'blocked' && task.blocked_reason && (
        <p className="mt-1 line-clamp-2 text-xs text-red-600 dark:text-red-400">{task.blocked_reason}</p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={task.priority} compact />
          <DueBadge task={task} />
          <SubtaskProgress task={task} />
        </div>
        <Assignees task={task} />
      </div>
    </div>
  )
}

function KanbanColumn({ status, tasks, canWork, onAdd }: { status: TaskStatus; tasks: Task[]; canWork: (t: Task) => boolean; onAdd?: (s: TaskStatus) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 sm:w-auto sm:min-w-0 sm:flex-1">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <StatusIcon status={status} />
          {statusLabel[status]}
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
        </div>
        {onAdd && (
          <Button variant="ghost" size="icon-sm" onClick={() => onAdd(status)} aria-label="Ajouter une tâche">
            <Plus />
          </Button>
        )}
      </div>
      <div ref={setNodeRef} className={cn('flex min-h-24 flex-1 flex-col gap-2 rounded-b-xl p-2 pt-0 transition-colors', isOver && 'bg-primary/5')}>
        {tasks.map((t) => <KanbanCard key={t.id} task={t} draggable={canWork(t)} />)}
      </div>
    </div>
  )
}

export function KanbanView({ tasks, onAdd }: { tasks: Task[]; onAdd?: (s: TaskStatus) => void }) {
  const { canWork } = useTaskPerms()
  const { change, dialog } = useStatusChanger()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }))
  const byStatus = useMemo(() => {
    const m = new Map<TaskStatus, Task[]>(STATUSES.map((s) => [s, []]))
    for (const t of tasks) m.get(t.status)?.push(t)
    for (const arr of m.values()) arr.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
    return m
  }, [tasks])
  const onDragEnd = (e: DragEndEvent) => {
    const t = tasks.find((x) => x.id === e.active.id)
    const to = e.over?.id as TaskStatus | undefined
    if (t && to) change(t, to)
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {STATUSES.map((s) => <KanbanColumn key={s} status={s} tasks={byStatus.get(s) ?? []} canWork={canWork} onAdd={onAdd} />)}
      </div>
      {dialog}
    </DndContext>
  )
}

// ======================= LISTE =======================

type SortKey = 'title' | 'priority' | 'due_date' | 'status' | 'assignee' | 'created_at'

export function ListView({ tasks }: { tasks: Task[] }) {
  const { canWork, canManage } = useTaskPerms()
  const { change, dialog } = useStatusChanger()
  const update = useUpdateTask()
  const { map } = useProfiles()
  const companies = useCompanies()
  const projects = useProjects()
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'due_date', asc: true })
  // Sélection pour « Envoyer à… » (uniquement les tâches que l'on gère).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const selectable = tasks.filter(canManage)
  const selectedTasks = tasks.filter((t) => selected.has(t.id))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allChecked = selectable.length > 0 && selectable.every((t) => selected.has(t.id))

  const sorted = useMemo(() => {
    const arr = [...tasks]
    const dir = sort.asc ? 1 : -1
    arr.sort((a, b) => {
      switch (sort.key) {
        case 'title': return a.title.localeCompare(b.title) * dir
        case 'priority': return (priorityRank[a.priority] - priorityRank[b.priority]) * dir
        case 'status': return (STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)) * dir
        case 'assignee': return fullName(map.get(a.assignee_id ?? '')).localeCompare(fullName(map.get(b.assignee_id ?? ''))) * dir
        case 'created_at': return a.created_at.localeCompare(b.created_at) * dir
        default: return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') * dir
      }
    })
    return arr
  }, [tasks, sort, map])

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2 text-left font-medium', className)}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : true }))}>
        {children}
        {sort.key === k && (sort.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )

  if (!tasks.length) return <EmptyState icon={<ListChecks />} title="Aucune tâche" description="Aucune tâche ne correspond à ces critères." />

  return (
    <div className="grid gap-3">
    {selectedTasks.length > 0 && (
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-primary/5 px-3 py-2 text-sm shadow-sm backdrop-blur">
        <span className="font-medium">{selectedTasks.length} sélectionnée{selectedTasks.length > 1 ? 's' : ''}</span>
        <Button size="sm" onClick={() => setSending(true)}>
          <Send className="size-4" /> Envoyer à…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
          <X className="size-4" /> Annuler
        </Button>
      </div>
    )}
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2">
              {selectable.length > 0 && (
                <Checkbox
                  aria-label="Tout sélectionner"
                  checked={allChecked}
                  onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((t) => t.id)) : new Set())}
                />
              )}
            </th>
            <Th k="title">Tâche</Th>
            <Th k="status" className="w-36">Statut</Th>
            <Th k="priority" className="w-32">Priorité</Th>
            <Th k="assignee" className="w-44">Responsable</Th>
            <Th k="due_date" className="w-32">Échéance</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const company = companies.data?.find((c) => c.id === t.company_id)
            const project = projects.data?.find((p) => p.id === t.project_id)
            const assignee = map.get(t.assignee_id ?? '')
            return (
              <tr key={t.id} className={cn('border-b last:border-0 hover:bg-muted/40', selected.has(t.id) && 'bg-primary/5')}>
                <td className="w-10 px-3 py-2">
                  {canManage(t) && (
                    <Checkbox aria-label="Sélectionner" checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link to={`/taches/${t.id}`} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 font-medium hover:underline">
                      {t.title} <PrivateIcon show={t.is_private} />
                    </span>
                    <span className="flex items-center gap-2">
                      <CompanyDot company={company} withName />
                      {project && <span className="truncate text-xs text-muted-foreground">· {project.name}</span>}
                      <SubtaskProgress task={t} />
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <NativeSelect
                    className="h-8 text-xs"
                    value={t.status}
                    disabled={!canWork(t)}
                    onChange={(e) => change(t, e.target.value as TaskStatus)}
                    style={{ color: statusColor[t.status] }}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                  </NativeSelect>
                </td>
                <td className="px-3 py-2">
                  {canManage(t) ? (
                    <NativeSelect
                      className="h-8 text-xs"
                      value={t.priority}
                      onChange={(e) => update.mutate({ id: t.id, patch: { priority: e.target.value as TaskPriority } })}
                    >
                      {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
                    </NativeSelect>
                  ) : (
                    <PriorityBadge priority={t.priority} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {assignee ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={fullName(assignee)} url={assignee.avatar_url} size={22} />
                      <span className="truncate">{fullName(assignee)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Non attribuée</span>
                  )}
                </td>
                <td className={cn('px-3 py-2', isOverdue(t) && 'font-medium text-red-600 dark:text-red-400')}>
                  {t.due_date ? fmtDate(t.due_date, 'd MMM yyyy') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {dialog}
    </div>
    <SendListDialog open={sending} onOpenChange={setSending} tasks={selectedTasks} onSent={() => setSelected(new Set())} />
    </div>
  )
}

// ======================= CALENDRIER =======================

type CalMode = 'month' | 'week' | 'day'

export function CalendarView({ tasks, onCreateAt }: { tasks: Task[]; onCreateAt?: (d: Date) => void }) {
  const [mode, setMode] = useState<CalMode>('month')
  const [cursor, setCursor] = useState(new Date())
  const companies = useCompanies()
  const navigate = useNavigate()

  const days = useMemo(() => {
    if (mode === 'day') return [cursor]
    if (mode === 'week') return eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) })
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    })
  }, [mode, cursor])

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due_date) continue
      const k = format(new Date(t.due_date), 'yyyy-MM-dd')
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return m
  }, [tasks])

  const move = (dir: 1 | -1) => {
    if (mode === 'month') setCursor((c) => (dir > 0 ? addMonths(c, 1) : subMonths(c, 1)))
    else if (mode === 'week') setCursor((c) => (dir > 0 ? addWeeks(c, 1) : subWeeks(c, 1)))
    else setCursor((c) => (dir > 0 ? addDays(c, 1) : subDays(c, 1)))
  }
  const title =
    mode === 'month'
      ? format(cursor, 'MMMM yyyy', { locale: fr })
      : mode === 'week'
        ? `Semaine du ${format(days[0], 'd MMM', { locale: fr })} au ${format(days[6], 'd MMM yyyy', { locale: fr })}`
        : format(cursor, 'EEEE d MMMM yyyy', { locale: fr })

  const Chip = ({ t }: { t: Task }) => {
    const c = companies.data?.find((x) => x.id === t.company_id)
    return (
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/taches/${t.id}`) }}
        className={cn(
          'flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] hover:opacity-80',
          t.status === 'done' && 'line-through opacity-60',
        )}
        style={{ background: `${c?.color ?? '#64748b'}22`, color: 'inherit', borderLeft: `3px solid ${c?.color ?? '#64748b'}` }}
        title={t.title}
      >
        <StatusIcon status={t.status} className="size-3" />
        <span className="truncate">{t.title}</span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Précédent"><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Aujourd’hui</Button>
          <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Suivant"><ChevronRight /></Button>
          <span className="ml-2 text-sm font-semibold capitalize">{title}</span>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(['day', 'week', 'month'] as CalMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn('rounded-md px-2.5 py-1', mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            >
              {m === 'day' ? 'Jour' : m === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'day' ? (
        <div className="grid gap-2 p-3">
          {(byDay.get(format(cursor, 'yyyy-MM-dd')) ?? []).map((t) => (
            <Link key={t.id} to={`/taches/${t.id}`} className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted/40">
              <span className="flex min-w-0 items-center gap-2">
                <StatusIcon status={t.status} />
                <span className="truncate font-medium">{t.title}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <PriorityBadge priority={t.priority} compact />
                {format(new Date(t.due_date!), 'HH:mm')}
              </span>
            </Link>
          ))}
          {!(byDay.get(format(cursor, 'yyyy-MM-dd')) ?? []).length && (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucune échéance ce jour.</p>
          )}
          {onCreateAt && (
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onCreateAt(cursor)}>
              <Plus /> Ajouter une tâche ce jour
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <div key={d} className="border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {days.map((d) => {
              const list = byDay.get(format(d, 'yyyy-MM-dd')) ?? []
              return (
                <div
                  key={d.toISOString()}
                  onClick={() => onCreateAt?.(d)}
                  className={cn(
                    'group flex flex-col gap-1 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0',
                    mode === 'month' ? 'min-h-24' : 'min-h-64',
                    mode === 'month' && !isSameMonth(d, cursor) && 'bg-muted/30 text-muted-foreground',
                    onCreateAt && 'cursor-pointer hover:bg-muted/30',
                  )}
                >
                  <span className={cn('inline-flex size-6 items-center justify-center rounded-full text-xs', isToday(d) && 'bg-primary font-semibold text-primary-foreground')}>
                    {format(d, 'd')}
                  </span>
                  {list.slice(0, mode === 'month' ? 3 : 20).map((t) => <Chip key={t.id} t={t} />)}
                  {mode === 'month' && list.length > 3 && (
                    <button
                      className="text-left text-[11px] text-muted-foreground hover:underline"
                      onClick={(e) => { e.stopPropagation(); setCursor(d); setMode('day') }}
                    >
                      + {list.length - 3} autres
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
