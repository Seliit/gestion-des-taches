import { Search, X } from 'lucide-react'
import { addDays, endOfDay, startOfDay } from 'date-fns'
import { Input, NativeSelect } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCompanies, useProfiles, useProjects, useTeams } from '@/hooks/data'
import { fullName, isOverdue, PRIORITIES, priorityLabel, STATUSES, statusLabel } from '@/lib/labels'
import type { Task, Team } from '@/lib/types'

export interface TaskFilterState {
  q: string
  companyId: string
  projectId: string
  assigneeId: string
  teamId: string
  priority: string
  status: string
  period: string
}
export const emptyFilters: TaskFilterState = { q: '', companyId: '', projectId: '', assigneeId: '', teamId: '', priority: '', status: '', period: '' }

export function applyFilters(tasks: Task[], f: TaskFilterState, teams: Team[] = []) {
  const now = new Date()
  const q = f.q.trim().toLowerCase()
  const teamUsers = f.teamId ? new Set(teams.find((t) => t.id === f.teamId)?.team_members?.map((m) => m.user_id) ?? []) : null
  return tasks.filter((t) => {
    if (f.companyId && t.company_id !== f.companyId) return false
    if (f.projectId && (f.projectId === 'none' ? t.project_id : t.project_id !== f.projectId)) return false
    if (f.assigneeId && t.assignee_id !== f.assigneeId && !t.task_assignees?.some((a) => a.user_id === f.assigneeId)) return false
    if (teamUsers && !(t.assignee_id && teamUsers.has(t.assignee_id))) return false
    if (f.priority && t.priority !== f.priority) return false
    if (f.status === 'open' ? t.status === 'done' : f.status && t.status !== f.status) return false
    if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false
    if (f.period) {
      const d = t.due_date ? new Date(t.due_date) : null
      switch (f.period) {
        case 'overdue':
          if (!isOverdue(t)) return false
          break
        case 'today':
          if (!d || d < startOfDay(now) || d > endOfDay(now)) return false
          break
        case 'week':
          if (!d || d < startOfDay(now) || d > endOfDay(addDays(now, 7))) return false
          break
        case 'month':
          if (!d || d < startOfDay(now) || d > endOfDay(addDays(now, 30))) return false
          break
        case 'nodate':
          if (d) return false
          break
      }
    }
    return true
  })
}

type Key = keyof TaskFilterState

export function TaskFilters({
  value,
  onChange,
  hide = [],
  fixedCompanyId,
}: {
  value: TaskFilterState
  onChange: (f: TaskFilterState) => void
  hide?: Key[]
  fixedCompanyId?: string
}) {
  const companies = useCompanies()
  const cid = fixedCompanyId || value.companyId
  const projects = useProjects(cid || null)
  const teams = useTeams(cid || null)
  const profiles = useProfiles()
  const set = (k: Key, v: string) => onChange({ ...value, [k]: v, ...(k === 'companyId' ? { projectId: '', teamId: '' } : {}) })
  const active = (Object.keys(value) as Key[]).some((k) => value[k] && !hide.includes(k))
  const show = (k: Key) => !hide.includes(k)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {show('q') && (
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={value.q} onChange={(e) => set('q', e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
      )}
      {show('companyId') && !fixedCompanyId && (companies.data?.length ?? 0) > 1 && (
        <NativeSelect className="w-auto" value={value.companyId} onChange={(e) => set('companyId', e.target.value)}>
          <option value="">Toutes les sociétés</option>
          {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      )}
      {show('projectId') && (
        <NativeSelect className="w-auto max-w-48" value={value.projectId} onChange={(e) => set('projectId', e.target.value)}>
          <option value="">Tous les projets</option>
          <option value="none">Sans projet</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      )}
      {show('teamId') && (teams.data?.length ?? 0) > 0 && (
        <NativeSelect className="w-auto max-w-44" value={value.teamId} onChange={(e) => set('teamId', e.target.value)}>
          <option value="">Toutes les équipes</option>
          {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </NativeSelect>
      )}
      {show('assigneeId') && (
        <NativeSelect className="w-auto max-w-48" value={value.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
          <option value="">Tous les collaborateurs</option>
          {profiles.data?.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
        </NativeSelect>
      )}
      {show('status') && (
        <NativeSelect className="w-auto" value={value.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="open">Non terminées</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </NativeSelect>
      )}
      {show('priority') && (
        <NativeSelect className="w-auto" value={value.priority} onChange={(e) => set('priority', e.target.value)}>
          <option value="">Toutes priorités</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
        </NativeSelect>
      )}
      {show('period') && (
        <NativeSelect className="w-auto" value={value.period} onChange={(e) => set('period', e.target.value)}>
          <option value="">Toutes échéances</option>
          <option value="overdue">En retard</option>
          <option value="today">Aujourd’hui</option>
          <option value="week">7 prochains jours</option>
          <option value="month">30 prochains jours</option>
          <option value="nodate">Sans échéance</option>
        </NativeSelect>
      )}
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...emptyFilters, companyId: fixedCompanyId ?? '' })}>
          <X /> Réinitialiser
        </Button>
      )}
    </div>
  )
}
