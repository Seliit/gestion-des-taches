import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { applyFilters, emptyFilters, TaskFilters, type TaskFilterState } from '@/components/tasks/filters'
import {
  AttentionList, CompanyComparison, ComparisonTable, KpiGrid, ProjectProgress, RecentActivity, StatusDonut, UpcomingDeadlines, Workload,
} from '@/components/dashboard/stats'
import { useAuth } from '@/context/auth'
import { useActivity, useCompanies, useProjects, useTasks, useTeams } from '@/hooks/data'
import { fullName } from '@/lib/labels'

export default function Dashboard() {
  const { isSuperAdmin, profile } = useAuth()
  const companies = useCompanies()
  const tasks = useTasks()
  const projects = useProjects()
  const teams = useTeams()
  const activity = useActivity({ limit: 30 })
  const [filters, setFilters] = useState<TaskFilterState>(emptyFilters)
  const filtered = useMemo(() => applyFilters(tasks.data ?? [], filters, teams.data), [tasks.data, filters, teams.data])
  const shownCompanies = (companies.data ?? []).filter((c) => !filters.companyId || c.id === filters.companyId)
  const shownProjects = (projects.data ?? []).filter((p) => !filters.companyId || p.company_id === filters.companyId)

  if (companies.isLoading || tasks.isLoading)
    return <div className="grid gap-3"><Skeleton className="h-8 w-60" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  if (!companies.data?.length)
    return (
      <EmptyState
        icon={<Building2 />}
        title="Aucune société pour le moment"
        description={isSuperAdmin ? 'Commencez par configurer vos sociétés.' : 'Vous n’êtes rattaché à aucune société. Demandez une invitation à votre administrateur.'}
        action={isSuperAdmin && <Button asChild><Link to="/configuration"><Plus /> Configurer mes sociétés</Link></Button>}
      />
    )

  const hello = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <PageHeader
        title={`${hello} ${profile?.first_name || fullName(profile)}`}
        description={isSuperAdmin ? 'Vue d’ensemble de vos sociétés' : 'Vue d’ensemble de votre activité'}
      />
      <TaskFilters value={filters} onChange={setFilters} hide={['q', 'status', 'priority']} />
      <KpiGrid tasks={filtered} />
      {shownCompanies.length > 1 && (
        <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
          <CompanyComparison tasks={filtered} companies={shownCompanies} />
          <ComparisonTable tasks={filtered} companies={shownCompanies} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <StatusDonut tasks={filtered} />
        <AttentionList tasks={filtered} />
        <UpcomingDeadlines tasks={filtered} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Workload tasks={filtered} />
        <ProjectProgress projects={shownProjects.filter((p) => !filters.projectId || p.id === filters.projectId)} tasks={filtered} />
      </div>
      <RecentActivity logs={(activity.data ?? []).filter((l) => !filters.companyId || l.company_id === filters.companyId)} />
    </div>
  )
}
