import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Settings, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { CompanyLogo } from '@/components/tasks/badges'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { CalendarView } from '@/components/tasks/views'
import { AttentionList, KpiGrid, ProjectProgress, RecentActivity, StatusDonut, UpcomingDeadlines, Workload } from '@/components/dashboard/stats'
import { ProjectsGrid } from './Projects'
import { useAuth } from '@/context/auth'
import { useActivity, useCompanies, useMembers, useProjects, useTasks, useTeams } from '@/hooks/data'
import { fullName, roleLabel } from '@/lib/labels'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const { canAdmin, roleIn } = useAuth()
  const companies = useCompanies()
  const company = companies.data?.find((c) => c.id === id)
  const tasks = useTasks({ companyId: id })
  const projects = useProjects(id)
  const members = useMembers(id)
  const teams = useTeams(id)
  const activity = useActivity({ companyId: id, limit: 20 })
  const teamWorkload = useMemo(
    () =>
      (teams.data ?? []).map((t) => {
        const ids = new Set(t.team_members?.map((m) => m.user_id))
        const ts = (tasks.data ?? []).filter((x) => x.assignee_id && ids.has(x.assignee_id) && x.status !== 'done')
        return { team: t, open: ts.length, members: ids.size }
      }),
    [teams.data, tasks.data],
  )

  if (companies.isLoading) return <Skeleton className="h-40" />
  if (!company) return <EmptyState title="Société introuvable" description="Vous n’avez pas accès à cette société." />

  const all = tasks.data ?? []
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <PageHeader
        icon={<CompanyLogo company={company} size={40} />}
        title={company.name}
        description={roleIn(id) ? `Votre rôle : ${roleLabel[roleIn(id)!]}` : undefined}
        actions={
          canAdmin(id) && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/parametres/societes?id=${id}`}><Settings /> Paramètres</Link>
            </Button>
          )
        }
      />
      <div className="h-1 rounded-full" style={{ background: company.color }} />
      <Tabs defaultValue="overview" className="grid gap-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Tableau de bord</TabsTrigger>
            <TabsTrigger value="tasks">Tâches</TabsTrigger>
            <TabsTrigger value="projects">Projets</TabsTrigger>
            <TabsTrigger value="people">Collaborateurs</TabsTrigger>
            <TabsTrigger value="calendar">Calendrier</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="grid gap-4">
          <KpiGrid tasks={all} />
          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <StatusDonut tasks={all} />
            <AttentionList tasks={all} />
            <UpcomingDeadlines tasks={all} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <ProjectProgress projects={projects.data ?? []} tasks={all} />
            <Workload tasks={all} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader><CardTitle>Charge des équipes</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                {!teamWorkload.length && <p className="text-sm text-muted-foreground">Aucune équipe.</p>}
                {teamWorkload.map(({ team, open, members: n }) => (
                  <div key={team.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: team.color }} />{team.name}</span>
                    <span className="text-muted-foreground">{n} membre{n > 1 ? 's' : ''} · <b className="text-foreground">{open}</b> tâches ouvertes</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <RecentActivity logs={activity.data ?? []} />
          </div>
        </TabsContent>
        <TabsContent value="tasks">
          <TaskBoard tasks={all} loading={tasks.isLoading} storageKey={`company-${id}`} fixedCompanyId={id} createDefaults={{ companyId: id }} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsGrid projects={projects.data ?? []} tasks={all} />
        </TabsContent>
        <TabsContent value="people">
          <Card>
            <CardContent className="grid gap-1 pt-4">
              {!members.data?.length && <EmptyState icon={<Users />} title="Aucun collaborateur" />}
              {members.data?.map((m) => {
                const open = all.filter((t) => t.assignee_id === m.user_id && t.status !== 'done').length
                return (
                  <Link key={m.id} to={`/collaborateurs/${m.user_id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                    <Avatar name={fullName(m.profile)} url={m.profile?.avatar_url} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(m.profile)} {!m.is_active && <span className="text-xs text-red-600">(désactivé)</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.job_title || m.profile?.job_title || m.profile?.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{roleLabel[m.role]}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">{open} en cours</span>
                  </Link>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarView tasks={all} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
