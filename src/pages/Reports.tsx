import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { applyFilters, emptyFilters, TaskFilters, type TaskFilterState } from '@/components/tasks/filters'
import { CompanyComparison, ComparisonTable, KpiGrid, ProjectProgress, Workload } from '@/components/dashboard/stats'
import { useCompanies, useProfiles, useProjects, useTasks, useTeams } from '@/hooks/data'
import { fmtDate, fullName, priorityLabel, statusLabel } from '@/lib/labels'

export default function Reports() {
  const tasks = useTasks({ includeArchived: true })
  const companies = useCompanies()
  const projects = useProjects()
  const teams = useTeams()
  const { map } = useProfiles()
  const [filters, setFilters] = useState<TaskFilterState>(emptyFilters)
  const filtered = useMemo(() => applyFilters(tasks.data ?? [], filters, teams.data), [tasks.data, filters, teams.data])

  function exportCsv() {
    const rows = [
      ['Société', 'Projet', 'Titre', 'Statut', 'Priorité', 'Responsable', 'Créée le', 'Échéance', 'Terminée le'],
      ...filtered.map((t) => [
        companies.data?.find((c) => c.id === t.company_id)?.name ?? '',
        projects.data?.find((p) => p.id === t.project_id)?.name ?? '',
        t.title,
        statusLabel[t.status],
        priorityLabel[t.priority],
        t.assignee_id ? fullName(map.get(t.assignee_id)) : '',
        fmtDate(t.created_at, 'dd/MM/yyyy'),
        t.due_date ? fmtDate(t.due_date, 'dd/MM/yyyy HH:mm') : '',
        t.completed_at ? fmtDate(t.completed_at, 'dd/MM/yyyy') : '',
      ]),
    ]
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `rapport-taches-${fmtDate(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const shown = (companies.data ?? []).filter((c) => !filters.companyId || c.id === filters.companyId)
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <PageHeader title="Rapports" description="Statistiques sur les tâches visibles (y compris archivées)" actions={<Button size="sm" variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>} />
      <TaskFilters value={filters} onChange={setFilters} hide={['q']} />
      <KpiGrid tasks={filtered} />
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <CompanyComparison tasks={filtered} companies={shown} />
        <ComparisonTable tasks={filtered} companies={shown} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Workload tasks={filtered} limit={20} />
        <ProjectProgress projects={(projects.data ?? []).filter((p) => !filters.companyId || p.company_id === filters.companyId)} tasks={filtered} limit={20} />
      </div>
    </div>
  )
}
