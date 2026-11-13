import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { endOfDay, isBefore } from 'date-fns'
import { Bell, CheckCheck, Mail, Sunrise, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { TaskBoard } from '@/components/tasks/TaskBoard'

import { CompanyDot, DueBadge, PriorityBadge, StatusIcon } from '@/components/tasks/badges'
import { useAuth } from '@/context/auth'
import { useCompanies, useInvitations, useNotifications, useProfiles, useTasks, useTeams } from '@/hooks/data'
import { fromNow, fullName, isOverdue, priorityRank, roleLabel } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AllTasks() {
  const { isSuperAdmin } = useAuth()
  const tasks = useTasks()
  return (
    <div>
      <PageHeader
        title={isSuperAdmin ? 'Toutes les tâches' : 'Tâches'}
        description={isSuperAdmin ? 'Supervision de l’ensemble des sociétés' : 'Tâches que vous êtes autorisé à consulter'}
      />
      <TaskBoard tasks={tasks.data ?? []} loading={tasks.isLoading} storageKey="all" defaultView="list" />
    </div>
  )
}

export function MyTasks() {
  const { session } = useAuth()
  const tasks = useTasks()
  const uid = session?.user.id
  const mine = (tasks.data ?? []).filter((t) => t.assignee_id === uid || t.task_assignees?.some((a) => a.user_id === uid))
  return (
    <div>
      <PageHeader title="Mes tâches" description="Les tâches qui vous sont attribuées ou auxquelles vous êtes associé" />
      <TaskBoard tasks={mine} loading={tasks.isLoading} storageKey="mine" hideFilters={['assigneeId', 'teamId']} createDefaults={{ assigneeId: uid }} />
    </div>
  )
}

export function TeamView() {
  const { session, isSuperAdmin, memberships } = useAuth()
  const tasks = useTasks()
  const teams = useTeams()
  const { map } = useProfiles()
  const uid = session?.user.id
  // Managers : collaborateurs des équipes qu'ils encadrent. Admins : toutes les équipes de leurs sociétés.
  const adminCompanies = new Set(memberships.filter((m) => m.role === 'admin').map((m) => m.company_id))
  const myTeams = (teams.data ?? []).filter((t) => isSuperAdmin || t.manager_id === uid || adminCompanies.has(t.company_id))
  const people = useMemo(() => {
    const s = new Set<string>()
    myTeams.forEach((t) => t.team_members?.forEach((m) => s.add(m.user_id)))
    return [...s]
  }, [myTeams])
  const teamTasks = (tasks.data ?? []).filter((t) => t.assignee_id && people.includes(t.assignee_id))

  return (
    <div className="grid gap-4">
      <PageHeader title="Vue équipe" description="Suivi des tâches et échéances des collaborateurs que vous encadrez" />
      {!people.length ? (
        <EmptyState icon={<UserCheck />} title="Aucun collaborateur encadré" description="Vous n’êtes manager d’aucune équipe pour le moment." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {people.map((id) => {
              const p = map.get(id)
              const ts = teamTasks.filter((t) => t.assignee_id === id)
              const open = ts.filter((t) => t.status !== 'done').length
              const late = ts.filter(isOverdue).length
              const blocked = ts.filter((t) => t.status === 'blocked').length
              return (
                <Link key={id} to={`/collaborateurs/${id}`}>
                  <Card className="flex items-center gap-3 p-3 hover:shadow-md">
                    <Avatar name={fullName(p)} url={p?.avatar_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(p)}</p>
                      <p className="text-xs text-muted-foreground">
                        {open} en cours
                        {late > 0 && <span className="text-red-600"> · {late} en retard</span>}
                        {blocked > 0 && <span className="text-red-600"> · {blocked} bloquée{blocked > 1 ? 's' : ''}</span>}
                      </p>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
          <TaskBoard tasks={teamTasks} loading={tasks.isLoading} storageKey="team" defaultView="list" />
        </>
      )}
    </div>
  )
}

function TaskLine({ t }: { t: Task }) {
  const companies = useCompanies()
  return (
    <Link to={`/taches/${t.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/50">
      <StatusIcon status={t.status} />
      <CompanyDot company={companies.data?.find((c) => c.id === t.company_id)} />
      <span className="min-w-0 flex-1 truncate">{t.title}</span>
      <PriorityBadge priority={t.priority} compact />
      <DueBadge task={t} />
    </Link>
  )
}

export function Today() {
  const { session, isSuperAdmin } = useAuth()
  const tasks = useTasks()
  const uid = session?.user.id
  const relevant = (tasks.data ?? []).filter(
    (t) => t.status !== 'done' && (isSuperAdmin || t.assignee_id === uid || t.created_by === uid || t.task_assignees?.some((a) => a.user_id === uid)),
  )
  const sort = (a: Task, b: Task) => priorityRank[a.priority] - priorityRank[b.priority]
  const overdue = relevant.filter(isOverdue).sort(sort)
  const today = relevant.filter((t) => t.due_date && !isOverdue(t) && isBefore(new Date(t.due_date), endOfDay(new Date()))).sort(sort)
  const blocked = relevant.filter((t) => t.status === 'blocked')
  const urgent = relevant.filter((t) => t.priority === 'urgent' && !overdue.includes(t) && !today.includes(t))
  const Block = ({ title, items, tone }: { title: string; items: Task[]; tone?: string }) => (
    <Card>
      <CardHeader><CardTitle className={cn('flex items-center justify-between', tone)}>{title}<span className="text-xs font-normal text-muted-foreground">{items.length}</span></CardTitle></CardHeader>
      <CardContent className="grid gap-0.5">
        {!items.length && <p className="text-sm text-muted-foreground">Rien ici.</p>}
        {items.map((t) => <TaskLine key={t.id} t={t} />)}
      </CardContent>
    </Card>
  )
  return (
    <div className="grid gap-4">
      <PageHeader
        icon={<Sunrise className="size-6 text-amber-500" />}
        title="Aujourd’hui"
        description={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      />
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Block title="En retard" items={overdue} tone="text-red-600" />
        <Block title="À rendre aujourd’hui" items={today} />
        <Block title="Bloquées" items={blocked} tone="text-red-600" />
        <Block title="Urgentes" items={urgent} tone="text-orange-600" />
      </div>
    </div>
  )
}

export function CalendarPage() {
  const tasks = useTasks()
  return (
    <div>
      <PageHeader title="Calendrier" description="Échéances par jour, semaine et mois" />
      <TaskBoard tasks={tasks.data ?? []} loading={tasks.isLoading} storageKey="calendar" defaultView="calendar" views={['calendar']} />
    </div>
  )
}

export function NotificationsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useNotifications()
  const { map } = useProfiles()
  const companies = useCompanies()
  const unread = list.data?.filter((n) => !n.read_at).length ?? 0
  async function markAll() {
    const { error } = await supabase.rpc('mark_all_notifications_read')
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function open(n: { id: string; read_at: string | null; link: string | null }) {
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    if (n.link) navigate(n.link)
  }
  async function toggle(n: { id: string; read_at: string | null }) {
    await supabase.from('notifications').update({ read_at: n.read_at ? null : new Date().toISOString() }).eq('id', n.id)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function remove(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'}
        actions={unread > 0 && <Button size="sm" variant="outline" onClick={markAll}><CheckCheck /> Tout marquer comme lu</Button>}
      />
      {!list.data?.length ? (
        <EmptyState icon={<Bell />} title="Aucune notification" />
      ) : (
        <Card>
          <CardContent className="grid gap-0.5 p-2">
            {list.data.map((n) => {
              const actor = map.get(n.actor_id ?? '')
              const c = companies.data?.find((x) => x.id === n.company_id)
              return (
                <div key={n.id} className={cn('group flex items-start gap-3 rounded-lg p-2.5 hover:bg-muted/50', !n.read_at && 'bg-primary/5')}>
                  <Avatar name={actor ? fullName(actor) : 'Système'} url={actor?.avatar_url} size={30} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => open(n)}>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!n.read_at && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                      {n.title}
                    </p>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{c && <CompanyDot company={c} withName />}{fromNow(n.created_at)}</p>
                  </button>
                  <div className="flex shrink-0 gap-1 opacity-60 group-hover:opacity-100">
                    <Button size="icon-sm" variant="ghost" onClick={() => toggle(n)} title={n.read_at ? 'Marquer non lue' : 'Marquer lue'}><Mail /></Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => remove(n.id)} title="Supprimer"><Trash2 /></Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function InvitationsPage() {
  const { session, refresh } = useAuth()
  const invitations = useInvitations()
  const companies = useCompanies()
  const qc = useQueryClient()
  const email = session?.user.email?.toLowerCase()
  const mine = (invitations.data ?? []).filter((i) => i.email === email && !i.accepted_at && !i.revoked_at)
  async function accept() {
    const { data, error } = await supabase.rpc('accept_my_invitations')
    if (error) return toast.error(errorMessage(error))
    toast.success(data ? `${data} invitation(s) acceptée(s)` : 'Aucune invitation valide à accepter')
    await refresh()
    qc.invalidateQueries()
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Mes invitations" />
      {!mine.length ? (
        <EmptyState icon={<Mail />} title="Aucune invitation en attente" />
      ) : (
        <Card>
          <CardContent className="grid gap-2 pt-4">
            {mine.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span>{companies.data?.find((c) => c.id === i.company_id)?.name ?? 'Société'} — {roleLabel[i.role]}</span>
              </div>
            ))}
            <Button onClick={accept} className="mt-2 justify-self-start">Accepter</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

