import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Flame, ListTodo, OctagonAlert, Layers } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import { CompanyDot, DueBadge, PriorityBadge, StatusIcon } from '@/components/tasks/badges'
import { useCompanies, useProfiles } from '@/hooks/data'
import { fullName, isOverdue, priorityRank, projectStatusLabel, STATUSES, statusColor, statusLabel } from '@/lib/labels'
import type { ActivityLog, Company, Project, Task } from '@/lib/types'
import { actionLabel, fromNow } from '@/lib/labels'
import { cn } from '@/lib/utils'

export function computeStats(tasks: Task[]) {
  const s = { total: tasks.length, todo: 0, in_progress: 0, waiting: 0, blocked: 0, done: 0, overdue: 0, urgent: 0 }
  for (const t of tasks) {
    s[t.status]++
    if (isOverdue(t)) s.overdue++
    if (t.priority === 'urgent' && t.status !== 'done') s.urgent++
  }
  return s
}

const tooltipStyle = {
  contentStyle: { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' },
  cursor: { fill: 'var(--muted)', opacity: 0.5 },
}

export function KpiGrid({ tasks }: { tasks: Task[] }) {
  const s = computeStats(tasks)
  const items = [
    { label: 'Total', value: s.total, icon: Layers, color: 'text-foreground' },
    { label: 'À faire', value: s.todo, icon: ListTodo, color: 'text-slate-500' },
    { label: 'En cours', value: s.in_progress, icon: CircleDot, color: 'text-blue-500' },
    { label: 'Terminées', value: s.done, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'En retard', value: s.overdue, icon: Clock, color: 'text-red-500' },
    { label: 'Urgentes', value: s.urgent, icon: Flame, color: 'text-orange-500' },
    { label: 'Bloquées', value: s.blocked, icon: OctagonAlert, color: 'text-red-600' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {items.map((i) => (
        <Card key={i.label} className="p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {i.label}
            <i.icon className={cn('size-4', i.color)} />
          </div>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{i.value}</p>
        </Card>
      ))}
    </div>
  )
}

export function CompanyComparison({ tasks, companies }: { tasks: Task[]; companies: Company[] }) {
  const data = companies.map((c) => {
    const ts = tasks.filter((t) => t.company_id === c.id)
    const s = computeStats(ts)
    return { name: c.name, color: c.color, ...s, ...Object.fromEntries(STATUSES.map((st) => [statusLabel[st], s[st]])) }
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Répartition par société</CardTitle>
        <CardDescription>Tâches par statut dans chaque société</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            {STATUSES.map((st, i) => (
              <Bar key={st} dataKey={statusLabel[st]} stackId="a" fill={statusColor[st]} radius={i === STATUSES.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function ComparisonTable({ tasks, companies }: { tasks: Task[]; companies: Company[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Comparatif des sociétés</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-left font-medium">Société</th>
              <th className="py-2 text-right font-medium">Ouvertes</th>
              <th className="py-2 text-right font-medium">En retard</th>
              <th className="py-2 text-right font-medium">Bloquées</th>
              <th className="py-2 text-right font-medium">Urgentes</th>
              <th className="py-2 text-right font-medium">Achèvement</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const s = computeStats(tasks.filter((t) => t.company_id === c.id))
              const rate = s.total ? Math.round((s.done / s.total) * 100) : 0
              return (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2"><Link to={`/societes/${c.id}`} className="hover:underline"><CompanyDot company={c} withName className="text-sm text-foreground" /></Link></td>
                  <td className="py-2 text-right tabular-nums">{s.total - s.done}</td>
                  <td className={cn('py-2 text-right tabular-nums', s.overdue && 'font-medium text-red-600')}>{s.overdue}</td>
                  <td className={cn('py-2 text-right tabular-nums', s.blocked && 'font-medium text-red-600')}>{s.blocked}</td>
                  <td className="py-2 text-right tabular-nums">{s.urgent}</td>
                  <td className="py-2 text-right">
                    <div className="ml-auto flex w-28 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${rate}%`, background: c.color }} /></div>
                      <span className="w-8 text-xs tabular-nums">{rate}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export function StatusDonut({ tasks }: { tasks: Task[] }) {
  const data = STATUSES.map((s) => ({ name: statusLabel[s], value: tasks.filter((t) => t.status === s).length, color: statusColor[s] })).filter((d) => d.value)
  return (
    <Card>
      <CardHeader><CardTitle>Tâches par statut</CardTitle></CardHeader>
      <CardContent className="h-64">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                {data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="pt-20 text-center text-sm text-muted-foreground">Aucune tâche</p>
        )}
      </CardContent>
    </Card>
  )
}

export function Workload({ tasks, limit = 10 }: { tasks: Task[]; limit?: number }) {
  const { map } = useProfiles()
  const data = useMemo(() => {
    const m = new Map<string, { open: number; overdue: number; done: number }>()
    for (const t of tasks) {
      if (!t.assignee_id) continue
      const e = m.get(t.assignee_id) ?? { open: 0, overdue: 0, done: 0 }
      if (t.status === 'done') e.done++
      else if (isOverdue(t)) e.overdue++
      else e.open++
      m.set(t.assignee_id, e)
    }
    return [...m.entries()]
      .map(([id, v]) => ({ id, name: fullName(map.get(id)), 'En cours / à faire': v.open, 'En retard': v.overdue, total: v.open + v.overdue }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)
  }, [tasks, map, limit])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Charge de travail</CardTitle>
        <CardDescription>Tâches non terminées par collaborateur</CardDescription>
      </CardHeader>
      <CardContent style={{ height: Math.max(160, data.length * 34 + 40) }}>
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="En cours / à faire" stackId="w" fill="#6366f1" />
              <Bar dataKey="En retard" stackId="w" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="pt-10 text-center text-sm text-muted-foreground">Aucune tâche attribuée</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ProjectProgress({ projects, tasks, limit = 8 }: { projects: Project[]; tasks: Task[]; limit?: number }) {
  const companies = useCompanies()
  const rows = projects
    .filter((p) => p.status !== 'archived')
    .map((p) => {
      const ts = tasks.filter((t) => t.project_id === p.id)
      const done = ts.filter((t) => t.status === 'done').length
      return { p, total: ts.length, done, rate: ts.length ? Math.round((done / ts.length) * 100) : 0 }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
  return (
    <Card>
      <CardHeader><CardTitle>Progression des projets</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        {!rows.length && <p className="text-sm text-muted-foreground">Aucun projet.</p>}
        {rows.map(({ p, total, done, rate }) => {
          const c = companies.data?.find((x) => x.id === p.company_id)
          return (
            <Link key={p.id} to={`/projets/${p.id}`} className="grid gap-1 rounded-md p-1 hover:bg-muted/50">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><CompanyDot company={c} /><span className="truncate">{p.name}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{projectStatusLabel[p.status]} · {done}/{total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: c?.color ?? 'var(--primary)' }} />
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function UpcomingDeadlines({ tasks, limit = 8, title = 'Échéances à venir' }: { tasks: Task[]; limit?: number; title?: string }) {
  const companies = useCompanies()
  const { map } = useProfiles()
  const rows = tasks
    .filter((t) => t.due_date && t.status !== 'done' && !isOverdue(t))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, limit)
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="grid gap-0.5">
        {!rows.length && <p className="text-sm text-muted-foreground">Aucune échéance.</p>}
        {rows.map((t) => {
          const a = map.get(t.assignee_id ?? '')
          return (
            <Link key={t.id} to={`/taches/${t.id}`} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
              <StatusIcon status={t.status} />
              <CompanyDot company={companies.data?.find((c) => c.id === t.company_id)} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <PriorityBadge priority={t.priority} compact />
              <DueBadge task={t} />
              {a && <Avatar name={fullName(a)} url={a.avatar_url} size={20} />}
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function AttentionList({ tasks }: { tasks: Task[] }) {
  const rows = tasks.filter((t) => t.status === 'blocked' || isOverdue(t)).sort((a, b) => (a.status === 'blocked' ? -1 : 1) - (b.status === 'blocked' ? -1 : 1))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-red-500" /> Points d’attention</CardTitle>
        <CardDescription>Tâches bloquées et en retard</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-0.5">
        {!rows.length && <p className="text-sm text-muted-foreground">Rien à signaler 🎉</p>}
        {rows.slice(0, 8).map((t) => (
          <Link key={t.id} to={`/taches/${t.id}`} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
            <StatusIcon status={t.status} />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {t.status === 'blocked' ? <span className="text-xs text-red-600">Bloquée</span> : <DueBadge task={t} />}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

export function RecentActivity({ logs }: { logs: ActivityLog[] }) {
  const { map } = useProfiles()
  return (
    <Card>
      <CardHeader><CardTitle>Activités récentes</CardTitle></CardHeader>
      <CardContent className="grid gap-2.5">
        {!logs.length && <p className="text-sm text-muted-foreground">Aucune activité.</p>}
        {logs.slice(0, 10).map((l) => {
          const p = l.actor_id ? map.get(l.actor_id) : null
          const title = (l.details as { title?: string }).title
          return (
            <div key={l.id} className="flex items-start gap-2 text-sm">
              <Avatar name={p ? fullName(p) : 'Système'} url={p?.avatar_url} size={22} />
              <div className="min-w-0">
                <span className="font-medium">{p ? fullName(p) : 'Système'}</span>{' '}
                <span className="text-muted-foreground">{actionLabel[l.action] ?? l.action}</span>
                {l.task_id ? (
                  <Link to={`/taches/${l.task_id}`} className="ml-1 hover:underline">{title ? `« ${title} »` : ''}</Link>
                ) : null}
                <div className="text-xs text-muted-foreground">{fromNow(l.created_at)}</div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
