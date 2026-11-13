import { useState } from 'react'
import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { Avatar, EmptyState } from '@/components/ui/misc'
import { CompanyDot } from '@/components/tasks/badges'
import { useActivity, useCompanies, useProfiles } from '@/hooks/data'
import { actionLabel, fmtDateTime, fullName } from '@/lib/labels'

export default function ActivityPage() {
  const companies = useCompanies()
  const [companyId, setCompanyId] = useState('')
  const [limit, setLimit] = useState(200)
  const logs = useActivity({ companyId: companyId || null, limit })
  const { map } = useProfiles()
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Historique" description="Journal horodaté et non modifiable des actions" />
      {(companies.data?.length ?? 0) > 1 && (
        <NativeSelect className="mb-4 w-auto" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Toutes les sociétés</option>
          {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      )}
      {!logs.data?.length ? (
        <EmptyState icon={<History />} title="Aucun événement" />
      ) : (
        <Card>
          <CardContent className="grid gap-0.5 p-2">
            {logs.data.map((l) => {
              const p = l.actor_id ? map.get(l.actor_id) : null
              const d = l.details as { title?: string; email?: string; row?: { name?: string; title?: string } }
              const label = d.title ?? d.row?.name ?? d.row?.title ?? d.email
              return (
                <div key={l.id} className="flex items-start gap-3 rounded-md p-2 text-sm hover:bg-muted/40">
                  <Avatar name={p ? fullName(p) : 'Système'} url={p?.avatar_url} size={26} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{p ? fullName(p) : 'Système'}</span>{' '}
                    <span className="text-muted-foreground">{actionLabel[l.action] ?? l.action}</span>{' '}
                    {l.task_id && l.action !== 'task.deleted' ? (
                      <Link to={`/taches/${l.task_id}`} className="hover:underline">{label ? `« ${label} »` : 'Voir la tâche'}</Link>
                    ) : (
                      label && <span>« {label} »</span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {fmtDateTime(l.created_at)}
                      <CompanyDot company={companies.data?.find((c) => c.id === l.company_id)} withName />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
      {(logs.data?.length ?? 0) >= limit && (
        <button className="mt-3 text-sm text-primary hover:underline" onClick={() => setLimit((l) => l + 200)}>Afficher plus</button>
      )}
    </div>
  )
}
