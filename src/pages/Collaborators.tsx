import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ban, Mail, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Avatar, EmptyState, Skeleton, Switch } from '@/components/ui/misc'
import { CompanyDot } from '@/components/tasks/badges'
import { InviteDialog } from '@/components/InviteDialog'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { useAuth } from '@/context/auth'
import { useCompanies, useInvitations, useMembers, useProfiles, useTasks, useTeams } from '@/hooks/data'
import { fmtDate, fullName, isOverdue, roleLabel } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { CompanyRole, Membership, Profile } from '@/lib/types'

export default function Collaborators() {
  const { canAdmin } = useAuth()
  const companies = useCompanies()
  const members = useMembers()
  const teams = useTeams()
  const tasks = useTasks()
  const invitations = useInvitations()
  const qc = useQueryClient()
  const [companyId, setCompanyId] = useState('')
  const [q, setQ] = useState('')
  const [invite, setInvite] = useState(false)
  const canInvite = (companies.data ?? []).some((c) => canAdmin(c.id))

  const people = useMemo(() => {
    const m = new Map<string, { profile: Profile; memberships: Membership[] }>()
    for (const x of members.data ?? []) {
      if (companyId && x.company_id !== companyId) continue
      if (!x.profile) continue
      const e = m.get(x.user_id) ?? { profile: x.profile, memberships: [] }
      e.memberships.push(x)
      m.set(x.user_id, e)
    }
    const term = q.toLowerCase()
    return [...m.values()]
      .filter((p) => !term || fullName(p.profile).toLowerCase().includes(term) || p.profile.email.toLowerCase().includes(term))
      .sort((a, b) => fullName(a.profile).localeCompare(fullName(b.profile)))
  }, [members.data, companyId, q])

  const pending = (invitations.data ?? []).filter((i) => !i.accepted_at && !i.revoked_at && (!companyId || i.company_id === companyId) && canAdmin(i.company_id))

  async function revoke(id: string) {
    const { error } = await supabase.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['invitations'] })
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Collaborateurs"
        description={`${people.length} collaborateur${people.length > 1 ? 's' : ''}`}
        actions={canInvite && <Button size="sm" onClick={() => setInvite(true)}><UserPlus /> Inviter</Button>}
      />
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
        {(companies.data?.length ?? 0) > 1 && (
          <NativeSelect className="w-auto" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Toutes les sociétés</option>
            {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        )}
      </div>

      {members.isLoading ? (
        <Skeleton className="h-60" />
      ) : !people.length ? (
        <EmptyState icon={<Users />} title="Aucun collaborateur" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nom</th>
                <th className="px-3 py-2 text-left font-medium">Sociétés et rôles</th>
                <th className="px-3 py-2 text-left font-medium">Équipes</th>
                <th className="px-3 py-2 text-right font-medium">Attribuées</th>
                <th className="px-3 py-2 text-right font-medium">Terminées</th>
                <th className="px-3 py-2 text-right font-medium">En retard</th>
              </tr>
            </thead>
            <tbody>
              {people.map(({ profile, memberships }) => {
                const ts = (tasks.data ?? []).filter((t) => t.assignee_id === profile.id)
                const userTeams = (teams.data ?? []).filter((t) => t.team_members?.some((m) => m.user_id === profile.id))
                return (
                  <tr key={profile.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link to={`/collaborateurs/${profile.id}`} className="flex items-center gap-2.5">
                        <Avatar name={fullName(profile)} url={profile.avatar_url} size={30} />
                        <div className="min-w-0">
                          <p className="truncate font-medium hover:underline">{fullName(profile)} {!profile.is_active && <span className="text-xs text-red-600">(désactivé)</span>}</p>
                          <p className="truncate text-xs text-muted-foreground">{profile.job_title || profile.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {memberships.map((m) => {
                          const c = companies.data?.find((x) => x.id === m.company_id)
                          return (
                            <span key={m.id} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${m.is_active ? '' : 'opacity-50 line-through'}`}>
                              <CompanyDot company={c} /> {c?.name} · {roleLabel[m.role]}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{userTeams.map((t) => t.name).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ts.filter((t) => t.status !== 'done').length}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ts.filter((t) => t.status === 'done').length}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{ts.filter(isOverdue).length || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="size-4" /> Invitations en attente</CardTitle></CardHeader>
          <CardContent className="grid gap-1">
            {pending.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{i.email}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <CompanyDot company={companies.data?.find((c) => c.id === i.company_id)} withName />
                  {roleLabel[i.role]} · expire le {fmtDate(i.expires_at, 'd MMM')}
                  <Button size="icon-sm" variant="ghost" onClick={() => revoke(i.id)} title="Révoquer"><X /></Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <InviteDialog open={invite} onOpenChange={setInvite} companyId={companyId} />
    </div>
  )
}

export function CollaboratorDetail() {
  const { id } = useParams<{ id: string }>()
  const { isSuperAdmin, canAdmin, session } = useAuth()
  const qc = useQueryClient()
  const { map, isLoading } = useProfiles()
  const members = useMembers()
  const companies = useCompanies()
  const tasks = useTasks()
  const profile = map.get(id ?? '')
  if (isLoading) return <Skeleton className="h-40" />
  if (!profile) return <EmptyState title="Collaborateur introuvable" description="Cette personne n’existe pas ou ne fait pas partie de vos sociétés." />
  const memberships = (members.data ?? []).filter((m) => m.user_id === id)
  const ts = (tasks.data ?? []).filter((t) => t.assignee_id === id || t.task_assignees?.some((a) => a.user_id === id))
  const isSelf = session?.user.id === id

  async function setRole(m: Membership, role: CompanyRole) {
    const { error } = await supabase.from('company_memberships').update({ role }).eq('id', m.id).select('id').single()
    if (error) return toast.error(errorMessage(error))
    toast.success('Rôle mis à jour')
    qc.invalidateQueries({ queryKey: ['members'] })
  }
  async function setMembershipActive(m: Membership, is_active: boolean) {
    const { error } = await supabase.from('company_memberships').update({ is_active }).eq('id', m.id).select('id').single()
    if (error) return toast.error(errorMessage(error))
    toast.success(is_active ? 'Accès rétabli' : 'Accès à la société retiré')
    qc.invalidateQueries({ queryKey: ['members'] })
  }
  async function setGlobalActive(active: boolean) {
    if (!active && !window.confirm(`Retirer immédiatement tous les accès de ${fullName(profile)} ?`)) return
    // Fonction serveur : désactive le profil (effet immédiat via RLS) et invalide les sessions.
    const { error } = await supabase.functions.invoke('set-user-access', { body: { user_id: id, active } })
    if (error) {
      const r = await supabase.rpc('set_user_active', { p_user: id, p_active: active })
      if (r.error) return toast.error(errorMessage(r.error))
    }
    toast.success(active ? 'Compte réactivé' : 'Accès retirés immédiatement')
    qc.invalidateQueries({ queryKey: ['profiles'] })
    qc.invalidateQueries({ queryKey: ['members'] })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={fullName(profile)} url={profile.avatar_url} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{fullName(profile)}</h1>
          <p className="text-sm text-muted-foreground">{profile.job_title || '—'} · {profile.email}</p>
          {!profile.is_active && <p className="mt-1 text-sm font-medium text-red-600">Compte désactivé : aucun accès</p>}
        </div>
        {isSuperAdmin && !isSelf && (
          profile.is_active ? (
            <Button variant="destructive" size="sm" onClick={() => setGlobalActive(false)}><Ban /> Retirer tous les accès</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setGlobalActive(true)}><ShieldCheck /> Réactiver le compte</Button>
          )
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Sociétés, rôles et permissions</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {memberships.map((m) => {
            const c = companies.data?.find((x) => x.id === m.company_id)
            // Seul le super-admin modifie un administrateur ; personne ne modifie ses propres droits (règle serveur).
            const editable = !isSelf && canAdmin(m.company_id) && (isSuperAdmin || m.role !== 'admin')
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                <CompanyDot company={c} withName className="text-sm text-foreground" />
                <div className="flex items-center gap-3">
                  <NativeSelect className="h-8 w-40 text-xs" disabled={!editable} value={m.role} onChange={(e) => setRole(m, e.target.value as CompanyRole)}>
                    <option value="employee">{roleLabel.employee}</option>
                    <option value="manager">{roleLabel.manager}</option>
                    {(isSuperAdmin || m.role === 'admin') && <option value="admin">{roleLabel.admin}</option>}
                  </NativeSelect>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={m.is_active} disabled={!editable} onCheckedChange={(v) => setMembershipActive(m, v)} />
                    {m.is_active ? 'Actif' : 'Désactivé'}
                  </label>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <TaskBoard tasks={ts} loading={tasks.isLoading} storageKey="person" defaultView="list" hideFilters={['assigneeId']} createDefaults={{ assigneeId: id }} />
    </div>
  )
}
