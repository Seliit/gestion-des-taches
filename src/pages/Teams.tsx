import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Avatar, Checkbox, EmptyState } from '@/components/ui/misc'
import { CompanyDot } from '@/components/tasks/badges'
import { useAuth } from '@/context/auth'
import { useCompanies, useMembers, useProfiles, useTasks, useTeams } from '@/hooks/data'
import { fullName } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Team } from '@/lib/types'

function TeamDialog({ open, onOpenChange, team }: { open: boolean; onOpenChange: (o: boolean) => void; team?: Team | null }) {
  const qc = useQueryClient()
  const { canAdmin } = useAuth()
  const companies = useCompanies()
  const adminCompanies = (companies.data ?? []).filter((c) => canAdmin(c.id))
  const [f, setF] = useState({ company_id: '', name: '', description: '', color: '#64748b', manager_id: '', members: [] as string[] })
  const members = useMembers(f.company_id || null)
  useEffect(() => {
    if (!open) return
    setF(
      team
        ? { company_id: team.company_id, name: team.name, description: team.description ?? '', color: team.color, manager_id: team.manager_id ?? '', members: team.team_members?.map((m) => m.user_id) ?? [] }
        : { company_id: adminCompanies[0]?.id ?? '', name: '', description: '', color: '#64748b', manager_id: '', members: [] },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team])

  async function save() {
    if (!f.name.trim()) return toast.error('Le nom est obligatoire.')
    try {
      const payload = { company_id: f.company_id, name: f.name.trim(), description: f.description || null, color: f.color, manager_id: f.manager_id || null }
      let id = team?.id
      if (team) {
        const { error } = await supabase.from('teams').update(payload).eq('id', team.id).select('id').single()
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('teams').insert(payload).select('id').single()
        if (error) throw error
        id = data.id
      }
      const before = new Set(team?.team_members?.map((m) => m.user_id) ?? [])
      const add = f.members.filter((u) => !before.has(u))
      const rem = [...before].filter((u) => !f.members.includes(u))
      if (add.length) { const { error } = await supabase.from('team_members').insert(add.map((user_id) => ({ team_id: id!, company_id: f.company_id, user_id }))); if (error) throw error }
      if (rem.length) { const { error } = await supabase.from('team_members').delete().eq('team_id', id!).in('user_id', rem); if (error) throw error }
      qc.invalidateQueries({ queryKey: ['teams'] })
      toast.success('Équipe enregistrée')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{team ? 'Modifier l’équipe' : 'Nouvelle équipe'}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Nom"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Couleur"><Input type="color" className="w-14 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Société">
              <NativeSelect value={f.company_id} disabled={!!team} onChange={(e) => setF({ ...f, company_id: e.target.value, manager_id: '', members: [] })}>
                {adminCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Manager">
              <NativeSelect value={f.manager_id} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
                <option value="">Aucun</option>
                {members.data?.filter((m) => m.is_active && m.role !== 'employee').map((m) => <option key={m.user_id} value={m.user_id}>{fullName(m.profile)}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Membres">
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
              {members.data?.filter((m) => m.is_active).map((m) => {
                const on = f.members.includes(m.user_id)
                return (
                  <label key={m.user_id} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                    <Checkbox checked={on} onCheckedChange={() => setF({ ...f, members: on ? f.members.filter((u) => u !== m.user_id) : [...f.members, m.user_id] })} />
                    {fullName(m.profile)}
                  </label>
                )
              })}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={!f.company_id}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Teams() {
  const { canAdmin } = useAuth()
  const qc = useQueryClient()
  const companies = useCompanies()
  const teams = useTeams()
  const tasks = useTasks()
  const { map } = useProfiles()
  const [dialog, setDialog] = useState<{ open: boolean; team?: Team | null }>({ open: false })
  const canCreate = (companies.data ?? []).some((c) => canAdmin(c.id))

  async function remove(t: Team) {
    if (!window.confirm(`Supprimer l’équipe « ${t.name} » ?`)) return
    const { error } = await supabase.from('teams').delete().eq('id', t.id)
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['teams'] })
  }

  return (
    <div>
      <PageHeader title="Équipes" actions={canCreate && <Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> Nouvelle équipe</Button>} />
      {!teams.data?.length ? (
        <EmptyState icon={<UsersRound />} title="Aucune équipe" description="Les équipes permettent aux managers de suivre leurs collaborateurs." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.data.map((t) => {
            const ids = new Set(t.team_members?.map((m) => m.user_id))
            const open = (tasks.data ?? []).filter((x) => x.assignee_id && ids.has(x.assignee_id) && x.status !== 'done').length
            const manager = map.get(t.manager_id ?? '')
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between">
                  <CompanyDot company={companies.data?.find((c) => c.id === t.company_id)} withName />
                  {canAdmin(t.company_id) && (
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => setDialog({ open: true, team: t })}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => remove(t)}><Trash2 /></Button>
                    </div>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.name}</p>
                {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Manager : {manager ? fullName(manager) : '—'} · {open} tâches ouvertes</p>
                <div className="mt-3 flex -space-x-1.5">
                  {[...ids].slice(0, 10).map((u) => <Avatar key={u} name={fullName(map.get(u))} url={map.get(u)?.avatar_url} size={26} />)}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <TeamDialog open={dialog.open} team={dialog.team} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </div>
  )
}
