import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Checkbox, Spinner } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useCompanies, useManagedIds, useMembers, useProjects } from '@/hooks/data'
import { fullName, PRIORITIES, priorityLabel, recurrenceLabel, STATUSES, statusLabel } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Task, TaskPriority, TaskRecurrence, TaskStatus } from '@/lib/types'

function toLocalInput(d: string | null) {
  if (!d) return ''
  const date = new Date(d)
  const off = date.getTimezoneOffset()
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16)
}

export interface TaskDefaults {
  companyId?: string
  projectId?: string
  assigneeId?: string
  status?: TaskStatus
  dueDate?: string
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaults,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  task?: Task | null
  defaults?: TaskDefaults
}) {
  const { memberships, canCreateTask, roleIn, session } = useAuth()
  const companies = useCompanies()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const managed = useManagedIds()
  const editable = useMemo(
    () => (companies.data ?? []).filter((c) => (task ? c.id === task.company_id : canCreateTask(c.id))),
    [companies.data, task, canCreateTask],
  )

  const [form, setForm] = useState({
    company_id: '',
    project_id: '',
    title: '',
    description: '',
    assignee_id: '',
    collaborators: [] as string[],
    priority: 'normal' as TaskPriority,
    status: 'todo' as TaskStatus,
    start_date: '',
    due_date: '',
    is_private: false,
    recurrence: 'none' as TaskRecurrence,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        company_id: task.company_id,
        project_id: task.project_id ?? '',
        title: task.title,
        description: task.description ?? '',
        assignee_id: task.assignee_id ?? '',
        collaborators: task.task_assignees?.map((a) => a.user_id) ?? [],
        priority: task.priority,
        status: task.status,
        start_date: task.start_date ?? '',
        due_date: toLocalInput(task.due_date),
        is_private: task.is_private,
        recurrence: task.recurrence,
      })
    } else {
      const firstCompany = defaults?.companyId || editable[0]?.id || memberships[0]?.company_id || ''
      setForm((f) => ({
        ...f,
        company_id: firstCompany,
        project_id: defaults?.projectId ?? '',
        title: '',
        description: '',
        assignee_id: defaults?.assigneeId ?? '',
        collaborators: [],
        priority: 'normal',
        status: defaults?.status ?? 'todo',
        start_date: '',
        due_date: defaults?.dueDate ? toLocalInput(defaults.dueDate) : '',
        is_private: false,
        recurrence: 'none',
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task])

  const projects = useProjects(form.company_id || null)
  const members = useMembers(form.company_id || null)
  const role = roleIn(form.company_id)
  // Un manager ne peut attribuer qu'à lui-même et à son équipe (vérifié aussi par la base)
  const assignable = (members.data ?? []).filter(
    (m) => m.is_active && m.profile?.is_active && (role === 'admin' || m.user_id === session?.user.id || managed.has(m.user_id)),
  )

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.title.trim()) return toast.error('Le titre est obligatoire.')
    if (!form.company_id) return toast.error('Choisissez une société.')
    setSaving(true)
    try {
      const payload = {
        company_id: form.company_id,
        project_id: form.project_id || null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        assignee_id: form.assignee_id || null,
        priority: form.priority,
        status: form.status,
        start_date: form.start_date || null,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        is_private: form.is_private,
        recurrence: form.recurrence,
        ...(form.status === 'blocked' && !task?.blocked_reason ? { blocked_reason: 'Signalé à la création' } : {}),
      }
      let id = task?.id
      if (task) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task.id).select('id').single()
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('tasks').insert(payload).select('id').single()
        if (error) throw error
        id = data.id
      }
      // Collaborateurs associés
      const before = new Set(task?.task_assignees?.map((a) => a.user_id) ?? [])
      const after = new Set(form.collaborators.filter((u) => u !== form.assignee_id))
      const toAdd = [...after].filter((u) => !before.has(u))
      const toRemove = [...before].filter((u) => !after.has(u))
      if (toAdd.length) {
        const { error } = await supabase.from('task_assignees').insert(toAdd.map((user_id) => ({ task_id: id!, user_id })))
        if (error) throw error
      }
      if (toRemove.length) {
        const { error } = await supabase.from('task_assignees').delete().eq('task_id', id!).in('user_id', toRemove)
        if (error) throw error
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['tasks'] }), qc.invalidateQueries({ queryKey: ['task', id] })])
      toast.success(task ? 'Tâche mise à jour' : 'Tâche créée')
      onOpenChange(false)
      if (!task && id) navigate(`/taches/${id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle>
          <DialogDescription>Les collaborateurs proposés sont ceux de la société choisie.</DialogDescription>
        </DialogHeader>
        {editable.length === 0 && !task ? (
          <p className="text-sm text-muted-foreground">Votre rôle ne vous permet pas de créer des tâches.</p>
        ) : (
          <div className="grid gap-3">
            <Field label="Titre">
              <Input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Préparer le devis client" />
            </Field>
            <Field label="Description">
              <Textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Détails, contexte, liens…" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Société">
                <NativeSelect
                  value={form.company_id}
                  disabled={!!task}
                  onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value, project_id: '', assignee_id: '', collaborators: [] }))}
                >
                  {editable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Projet">
                <NativeSelect value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                  <option value="">Sans projet</option>
                  {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Responsable principal">
                <NativeSelect value={form.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
                  <option value="">Non attribuée</option>
                  {assignable.map((m) => <option key={m.user_id} value={m.user_id}>{fullName(m.profile)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Priorité">
                <NativeSelect value={form.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Statut">
                <NativeSelect value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Récurrence">
                <NativeSelect value={form.recurrence} onChange={(e) => set('recurrence', e.target.value as TaskRecurrence)}>
                  {(Object.keys(recurrenceLabel) as TaskRecurrence[]).map((r) => <option key={r} value={r}>{recurrenceLabel[r]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Date de début">
                <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
              </Field>
              <Field label="Date limite">
                <Input type="datetime-local" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
              </Field>
            </div>
            {assignable.length > 1 && (
              <Field label="Collaborateurs associés">
                <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                  {assignable
                    .filter((m) => m.user_id !== form.assignee_id)
                    .map((m) => {
                      const on = form.collaborators.includes(m.user_id)
                      return (
                        <label key={m.user_id} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                          <Checkbox
                            checked={on}
                            onCheckedChange={() =>
                              set('collaborators', on ? form.collaborators.filter((u) => u !== m.user_id) : [...form.collaborators, m.user_id])
                            }
                          />
                          {fullName(m.profile)}
                        </label>
                      )
                    })}
                </div>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_private} onCheckedChange={(v) => set('is_private', v === true)} />
              Tâche privée (visible uniquement par les personnes concernées et les responsables)
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={saving || (editable.length === 0 && !task)}>
            {saving && <Spinner className="text-primary-foreground" />}
            {task ? 'Enregistrer' : 'Créer la tâche'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function useTaskDialog() {
  const [state, setState] = useState<{ open: boolean; task?: Task | null; defaults?: TaskDefaults }>({ open: false })
  const node: ReactNode = (
    <TaskFormDialog
      open={state.open}
      task={state.task}
      defaults={state.defaults}
      onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}
    />
  )
  return {
    openCreate: (defaults?: TaskDefaults) => setState({ open: true, task: null, defaults }),
    openEdit: (task: Task) => setState({ open: true, task }),
    node,
  }
}
