import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FolderKanban, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Avatar, Checkbox, EmptyState, Skeleton } from '@/components/ui/misc'
import { CompanyDot } from '@/components/tasks/badges'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { useAuth } from '@/context/auth'
import { useCompanies, useMembers, useProfiles, useProjects, useTasks } from '@/hooks/data'
import { fmtDate, fullName, projectStatusLabel } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Project, ProjectStatus, Task } from '@/lib/types'

export function ProjectsGrid({ projects, tasks }: { projects: Project[]; tasks: Task[] }) {
  const companies = useCompanies()
  const { map } = useProfiles()
  if (!projects.length) return <EmptyState icon={<FolderKanban />} title="Aucun projet" description="Les projets regroupent les tâches d’une même initiative." />
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const ts = tasks.filter((t) => t.project_id === p.id)
        const done = ts.filter((t) => t.status === 'done').length
        const rate = ts.length ? Math.round((done / ts.length) * 100) : 0
        const c = companies.data?.find((x) => x.id === p.company_id)
        const owner = map.get(p.owner_id ?? '')
        return (
          <Link key={p.id} to={`/projets/${p.id}`}>
            <Card className="h-full p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <CompanyDot company={c} withName />
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">{projectStatusLabel[p.status]}</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 font-medium">
                {p.name} {p.visibility === 'private' && <Lock className="size-3 text-muted-foreground" />}
              </p>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${rate}%`, background: c?.color }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{done}/{ts.length} tâches · {rate}%</span>
                <span className="flex items-center gap-1.5">
                  {p.end_date && <>Fin {fmtDate(p.end_date, 'd MMM')}</>}
                  {owner && <Avatar name={fullName(owner)} url={owner.avatar_url} size={18} />}
                </span>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

export function ProjectDialog({ open, onOpenChange, project, companyId }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project | null; companyId?: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { canAdmin } = useAuth()
  const companies = useCompanies()
  const adminCompanies = (companies.data ?? []).filter((c) => canAdmin(c.id))
  const [f, setF] = useState({ company_id: '', name: '', description: '', owner_id: '', visibility: 'public', status: 'active' as ProjectStatus, start_date: '', end_date: '', members: [] as string[] })
  const members = useMembers(f.company_id || null)
  useEffect(() => {
    if (!open) return
    setF(
      project
        ? {
            company_id: project.company_id, name: project.name, description: project.description ?? '', owner_id: project.owner_id ?? '',
            visibility: project.visibility, status: project.status, start_date: project.start_date ?? '', end_date: project.end_date ?? '',
            members: project.project_members?.map((m) => m.user_id) ?? [],
          }
        : { company_id: companyId || adminCompanies[0]?.id || '', name: '', description: '', owner_id: '', visibility: 'public', status: 'active', start_date: '', end_date: '', members: [] },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project])

  async function save() {
    if (!f.name.trim()) return toast.error('Le nom est obligatoire.')
    const payload = {
      company_id: f.company_id, name: f.name.trim(), description: f.description || null, owner_id: f.owner_id || null,
      visibility: f.visibility as 'public' | 'private', status: f.status, start_date: f.start_date || null, end_date: f.end_date || null,
    }
    try {
      let id = project?.id
      if (project) {
        const { error } = await supabase.from('projects').update(payload).eq('id', project.id).select('id').single()
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('projects').insert(payload).select('id').single()
        if (error) throw error
        id = data.id
      }
      const before = new Set(project?.project_members?.map((m) => m.user_id) ?? [])
      const add = f.members.filter((u) => !before.has(u))
      const rem = [...before].filter((u) => !f.members.includes(u))
      if (add.length) { const { error } = await supabase.from('project_members').insert(add.map((user_id) => ({ project_id: id!, user_id }))); if (error) throw error }
      if (rem.length) { const { error } = await supabase.from('project_members').delete().eq('project_id', id!).in('user_id', rem); if (error) throw error }
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(project ? 'Projet mis à jour' : 'Projet créé')
      onOpenChange(false)
      if (!project) navigate(`/projets/${id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{project ? 'Modifier le projet' : 'Nouveau projet'}</DialogTitle>
          <DialogDescription>Un projet privé n’est visible que par ses membres et les administrateurs.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Nom"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Société">
              <NativeSelect value={f.company_id} disabled={!!project} onChange={(e) => setF({ ...f, company_id: e.target.value, owner_id: '', members: [] })}>
                {adminCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Responsable">
              <NativeSelect value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>
                <option value="">Aucun</option>
                {members.data?.filter((m) => m.is_active).map((m) => <option key={m.user_id} value={m.user_id}>{fullName(m.profile)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Visibilité">
              <NativeSelect value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}>
                <option value="public">Public (toute la société)</option>
                <option value="private">Privé (membres autorisés)</option>
              </NativeSelect>
            </Field>
            <Field label="Statut">
              <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ProjectStatus })}>
                {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => <option key={s} value={s}>{projectStatusLabel[s]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Date de début"><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
            <Field label="Date de fin prévue"><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          </div>
          <Field label="Membres autorisés">
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
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
          <Button onClick={save} disabled={!f.company_id}>{project ? 'Enregistrer' : 'Créer le projet'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Projects() {
  const { canAdmin } = useAuth()
  const companies = useCompanies()
  const [companyId, setCompanyId] = useState('')
  const [status, setStatus] = useState('')
  const projects = useProjects()
  const tasks = useTasks()
  const [open, setOpen] = useState(false)
  const list = (projects.data ?? []).filter((p) => (!companyId || p.company_id === companyId) && (status ? p.status === status : p.status !== 'archived'))
  const canCreate = (companies.data ?? []).some((c) => canAdmin(c.id))
  return (
    <div>
      <PageHeader
        title="Projets"
        description="Projets de vos sociétés"
        actions={canCreate && <Button size="sm" onClick={() => setOpen(true)}><Plus /> Nouveau projet</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(companies.data?.length ?? 0) > 1 && (
          <NativeSelect className="w-auto" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Toutes les sociétés</option>
            {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        )}
        <NativeSelect className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Projets actifs</option>
          {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => <option key={s} value={s}>{projectStatusLabel[s]}</option>)}
        </NativeSelect>
      </div>
      {projects.isLoading ? <Skeleton className="h-40" /> : <ProjectsGrid projects={list} tasks={tasks.data ?? []} />}
      <ProjectDialog open={open} onOpenChange={setOpen} companyId={companyId} />
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { canAdmin, session } = useAuth()
  const projects = useProjects()
  const tasks = useTasks()
  const companies = useCompanies()
  const { map } = useProfiles()
  const [edit, setEdit] = useState(false)
  const project = projects.data?.find((p) => p.id === id)
  if (projects.isLoading) return <Skeleton className="h-40" />
  if (!project) return <EmptyState title="Projet introuvable" description="Ce projet n’existe pas ou vous n’y avez pas accès." />
  const company = companies.data?.find((c) => c.id === project.company_id)
  const ts = (tasks.data ?? []).filter((t) => t.project_id === id)
  const done = ts.filter((t) => t.status === 'done').length
  const canEdit = canAdmin(project.company_id) || project.owner_id === session?.user.id
  const owner = map.get(project.owner_id ?? '')

  async function remove() {
    if (!window.confirm('Supprimer ce projet et toutes ses tâches ? Action irréversible.')) return
    const { error, count } = await supabase.from('projects').delete({ count: 'exact' }).eq('id', project!.id)
    if (error || !count) return toast.error(error ? errorMessage(error) : 'Suppression non autorisée.')
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    navigate('/projets')
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={
          canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil /> Modifier</Button>
              {canAdmin(project.company_id) && <Button size="sm" variant="outline" className="text-red-600" onClick={remove}><Trash2 /></Button>}
            </>
          )
        }
      />
      <Card>
        <CardContent className="grid gap-4 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div><p className="text-xs text-muted-foreground">Société</p><CompanyDot company={company} withName className="text-sm text-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">Statut</p>{projectStatusLabel[project.status]}</div>
          <div><p className="text-xs text-muted-foreground">Responsable</p>{owner ? fullName(owner) : '—'}</div>
          <div><p className="text-xs text-muted-foreground">Visibilité</p>{project.visibility === 'private' ? 'Privé' : 'Public'}</div>
          <div><p className="text-xs text-muted-foreground">Dates</p>{fmtDate(project.start_date, 'd MMM')} → {fmtDate(project.end_date, 'd MMM yyyy')}</div>
          <div>
            <p className="text-xs text-muted-foreground">Progression</p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${ts.length ? (done / ts.length) * 100 : 0}%`, background: company?.color }} /></div>
              <span className="text-xs">{ts.length ? Math.round((done / ts.length) * 100) : 0}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
      {!!project.project_members?.length && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> Membres autorisés</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {project.project_members.map((m) => {
              const p = map.get(m.user_id)
              return <span key={m.user_id} className="flex items-center gap-1.5 text-sm"><Avatar name={fullName(p)} url={p?.avatar_url} size={22} />{fullName(p)}</span>
            })}
          </CardContent>
        </Card>
      )}
      <TaskBoard
        tasks={ts}
        loading={tasks.isLoading}
        storageKey="project"
        fixedCompanyId={project.company_id}
        createDefaults={{ companyId: project.company_id, projectId: project.id }}
        hideFilters={['projectId', 'companyId']}
      />
      <ProjectDialog open={edit} onOpenChange={setEdit} project={project} />
    </div>
  )
}
