import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowLeft, Bell, Download, MoreHorizontal, Paperclip, Pencil, Plus, Repeat, Send, Trash2, Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar, Checkbox, EmptyState, Skeleton, Spinner } from '@/components/ui/misc'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CompanyDot, PriorityBadge, PrivateIcon } from '@/components/tasks/badges'
import { useTaskDialog } from '@/components/tasks/TaskFormDialog'
import { useStatusChanger } from '@/components/tasks/views'
import { useAuth } from '@/context/auth'
import { TASK_SELECT, useActivity, useCompanies, useManagedIds, useMembers, useProfiles, useProjects, useUpdateTask } from '@/hooks/data'
import { actionLabel, fmtDate, fmtDateTime, fromNow, fullName, isOverdue, recurrenceLabel, STATUSES, statusColor, statusLabel } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Attachment, ChecklistItem, Comment, Reminder, Subtask, Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { session, canManageTask, canAdmin } = useAuth()
  const managed = useManagedIds()
  const { map } = useProfiles()
  const companies = useCompanies()
  const projects = useProjects()
  const edit = useTaskDialog()
  const update = useUpdateTask()
  const { change, dialog: blockDialog } = useStatusChanger()

  const taskQ = useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Task | null
    },
  })
  const task = taskQ.data

  if (taskQ.isLoading) return <div className="grid gap-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40" /></div>
  if (!task)
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Tâche introuvable"
        description="Elle a peut-être été supprimée, ou vous n’avez pas l’autorisation de la consulter."
        action={<Button variant="outline" onClick={() => navigate(-1)}>Retour</Button>}
      />
    )

  const uid = session?.user.id
  const canManage = canManageTask(task, managed)
  const canWork = canManage || task.assignee_id === uid || !!task.task_assignees?.some((a) => a.user_id === uid)
  const company = companies.data?.find((c) => c.id === task.company_id)
  const project = projects.data?.find((p) => p.id === task.project_id)
  const assignee = map.get(task.assignee_id ?? '')
  const creator = map.get(task.created_by ?? '')

  async function remove() {
    if (!window.confirm('Supprimer définitivement cette tâche ? Cette action est irréversible (elle reste tracée dans l’historique).')) return
    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', task!.id)
    if (error || !count) return toast.error(error ? errorMessage(error) : 'Suppression non autorisée.')
    toast.success('Tâche supprimée')
    qc.invalidateQueries({ queryKey: ['tasks'] })
    navigate('/taches')
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft /> Retour</Button>
        <div className="flex items-center gap-2">
          {canManage && <Button variant="outline" size="sm" onClick={() => edit.openEdit(task)}><Pencil /> Modifier</Button>}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="Plus d’actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {task.archived_at ? (
                  <DropdownMenuItem onClick={() => update.mutate({ id: task.id, patch: { archived_at: null } })}><ArchiveRestore /> Désarchiver</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => update.mutate({ id: task.id, patch: { archived_at: new Date().toISOString() } })}><Archive /> Archiver</DropdownMenuItem>
                )}
                {canAdmin(task.company_id) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={remove}><Trash2 /> Supprimer</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid min-w-0 gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <CompanyDot company={company} withName />
              {project && <Link to={`/projets/${project.id}`} className="text-xs text-muted-foreground hover:underline">· {project.name}</Link>}
              <PrivateIcon show={task.is_private} />
              {task.archived_at && <span className="rounded bg-muted px-1.5 text-xs">Archivée</span>}
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{task.title}</h1>
          </div>

          {task.status === 'blocked' && (
            <div className="flex gap-3 rounded-xl border border-red-300/60 bg-red-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-400">Tâche bloquée</p>
                <p className="text-muted-foreground">{task.blocked_reason}</p>
              </div>
            </div>
          )}

          <Card>
            <CardContent className="pt-4">
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune description.</p>
              )}
            </CardContent>
          </Card>

          <Subtasks taskId={task.id} canManage={canManage} canWork={canWork} />
          <Checklist taskId={task.id} canManage={canManage} canWork={canWork} />
          <Attachments task={task} canManage={canManage} />
          <Comments task={task} />
          <History taskId={task.id} />
        </div>

        <div className="grid h-fit gap-4">
          <Card>
            <CardContent className="grid gap-4 pt-4 text-sm">
              <div className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">Statut</span>
                <NativeSelect value={task.status} disabled={!canWork} onChange={(e) => change(task, e.target.value as TaskStatus)} style={{ color: statusColor[task.status] }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                </NativeSelect>
                {canWork && task.status !== 'blocked' && task.status !== 'done' && (
                  <Button variant="outline" size="sm" className="text-red-600" onClick={() => change(task, 'blocked')}>
                    <AlertTriangle /> Signaler un blocage
                  </Button>
                )}
              </div>
              <Info label="Priorité"><PriorityBadge priority={task.priority} /></Info>
              <Info label="Responsable">
                {assignee ? <Person id={assignee.id} /> : <span className="text-muted-foreground">Non attribuée</span>}
              </Info>
              {!!task.task_assignees?.length && (
                <Info label="Collaborateurs">
                  <div className="grid gap-1.5">{task.task_assignees.map((a) => <Person key={a.user_id} id={a.user_id} />)}</div>
                </Info>
              )}
              <Info label="Créée par">{creator ? <Person id={creator.id} /> : '—'}</Info>
              <Info label="Date limite">
                <span className={cn(isOverdue(task) && 'font-medium text-red-600')}>{task.due_date ? fmtDateTime(task.due_date) : '—'}</span>
              </Info>
              <Info label="Date de début">{fmtDate(task.start_date)}</Info>
              <Info label="Créée le">{fmtDateTime(task.created_at)}</Info>
              {task.completed_at && <Info label="Terminée le">{fmtDateTime(task.completed_at)}</Info>}
              {task.recurrence !== 'none' && (
                <Info label="Récurrence"><span className="inline-flex items-center gap-1"><Repeat className="size-3" /> {recurrenceLabel[task.recurrence]}</span></Info>
              )}
            </CardContent>
          </Card>
          <Reminders taskId={task.id} />
        </div>
      </div>
      {edit.node}
      {blockDialog}
    </div>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

function Person({ id }: { id: string }) {
  const { map } = useProfiles()
  const p = map.get(id)
  return (
    <Link to={`/collaborateurs/${id}`} className="inline-flex items-center gap-2 hover:underline">
      <Avatar name={fullName(p)} url={p?.avatar_url} size={20} />
      <span>{fullName(p)}</span>
    </Link>
  )
}

function useList<T>(table: string, taskId: string, order = 'position') {
  return useQuery({
    queryKey: [table, taskId],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*').eq('task_id', taskId).order(order)
      if (error) throw error
      return data as T[]
    },
  })
}

function Subtasks({ taskId, canManage, canWork }: { taskId: string; canManage: boolean; canWork: boolean }) {
  const qc = useQueryClient()
  const list = useList<Subtask>('subtasks', taskId)
  const [title, setTitle] = useState('')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['subtasks', taskId] }); qc.invalidateQueries({ queryKey: ['tasks'] }) }
  const items = list.data ?? []
  const done = items.filter((s) => s.is_done).length
  async function add() {
    if (!title.trim()) return
    const { error } = await supabase.from('subtasks').insert({ task_id: taskId, title: title.trim(), position: items.length })
    if (error) return toast.error(errorMessage(error))
    setTitle('')
    refresh()
  }
  async function toggle(s: Subtask) {
    const { error } = await supabase.from('subtasks').update({ is_done: !s.is_done }).eq('id', s.id)
    if (error) toast.error(errorMessage(error))
    refresh()
  }
  async function remove(s: Subtask) {
    const { error } = await supabase.from('subtasks').delete().eq('id', s.id)
    if (error) toast.error(errorMessage(error))
    refresh()
  }
  if (!items.length && !canManage) return null
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Sous-tâches {items.length > 0 && <span className="font-normal text-muted-foreground">· {done}/{items.length}</span>}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        {items.length > 0 && (
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        )}
        {items.map((s) => (
          <div key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
            <Checkbox checked={s.is_done} disabled={!canWork} onCheckedChange={() => toggle(s)} />
            <span className={cn('flex-1 text-sm', s.is_done && 'text-muted-foreground line-through')}>{s.title}</span>
            {canManage && (
              <button className="opacity-0 group-hover:opacity-100" onClick={() => remove(s)} aria-label="Supprimer"><Trash2 className="size-3.5 text-muted-foreground" /></button>
            )}
          </div>
        ))}
        {canManage && (
          <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ajouter une sous-tâche" className="h-8" />
            <Button size="sm" variant="outline" type="submit"><Plus /></Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function Checklist({ taskId, canManage, canWork }: { taskId: string; canManage: boolean; canWork: boolean }) {
  const qc = useQueryClient()
  const list = useList<ChecklistItem>('checklist_items', taskId)
  const [label, setLabel] = useState('')
  const items = list.data ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['checklist_items', taskId] })
  async function add() {
    if (!label.trim()) return
    const { error } = await supabase.from('checklist_items').insert({ task_id: taskId, label: label.trim(), position: items.length })
    if (error) return toast.error(errorMessage(error))
    setLabel('')
    refresh()
  }
  if (!items.length && !canManage) return null
  return (
    <Card>
      <CardHeader><CardTitle>Checklist</CardTitle></CardHeader>
      <CardContent className="grid gap-1">
        {items.map((c) => (
          <div key={c.id} className="group flex items-center gap-2 px-1 py-1">
            <Checkbox
              checked={c.is_done}
              disabled={!canWork}
              onCheckedChange={async () => {
                const { error } = await supabase.from('checklist_items').update({ is_done: !c.is_done }).eq('id', c.id)
                if (error) toast.error(errorMessage(error))
                refresh()
              }}
            />
            <span className={cn('flex-1 text-sm', c.is_done && 'text-muted-foreground line-through')}>{c.label}</span>
            {canManage && (
              <button
                className="opacity-0 group-hover:opacity-100"
                aria-label="Supprimer"
                onClick={async () => { await supabase.from('checklist_items').delete().eq('id', c.id); refresh() }}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ajouter un élément" className="h-8" />
            <Button size="sm" variant="outline" type="submit"><Plus /></Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function Attachments({ task, canManage }: { task: Task; canManage: boolean }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { map } = useProfiles()
  const list = useList<Attachment>('attachments', task.id, 'created_at')
  const [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['attachments', task.id] })

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} dépasse 50 Mo`); continue }
        const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_')
        const path = `${task.company_id}/${task.id}/${crypto.randomUUID()}-${safe}`
        const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type })
        if (up.error) throw up.error
        const { error } = await supabase.from('attachments').insert({
          task_id: task.id, company_id: task.company_id, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
        })
        if (error) {
          await supabase.storage.from('attachments').remove([path])
          throw error
        }
      }
      toast.success('Fichier ajouté')
      refresh()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }
  async function download(a: Attachment) {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(a.storage_path, 60, { download: a.file_name })
    if (error) return toast.error(errorMessage(error))
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function remove(a: Attachment) {
    if (!window.confirm(`Supprimer ${a.file_name} ?`)) return
    const { error } = await supabase.from('attachments').delete().eq('id', a.id)
    if (error) return toast.error(errorMessage(error))
    await supabase.storage.from('attachments').remove([a.storage_path])
    refresh()
  }
  const size = (n: number | null) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Paperclip className="size-4" /> Fichiers joints</CardTitle>
        <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
          {uploading ? <Spinner /> : <Upload />} Joindre
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </CardHeader>
      <CardContent className="grid gap-1">
        {!list.data?.length && <p className="text-sm text-muted-foreground">Aucun fichier.</p>}
        {list.data?.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50">
            <button className="flex min-w-0 items-center gap-2 text-left hover:underline" onClick={() => download(a)}>
              <Download className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{a.file_name}</span>
            </button>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {size(a.size_bytes)} · {fullName(map.get(a.uploaded_by ?? ''))}
              {(canManage || a.uploaded_by === session?.user.id) && (
                <button onClick={() => remove(a)} aria-label="Supprimer"><Trash2 className="size-3.5" /></button>
              )}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Comments({ task }: { task: Task }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { map } = useProfiles()
  const members = useMembers(task.company_id)
  const list = useList<Comment>('task_comments', task.id, 'created_at')
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState<Map<string, string>>(new Map())
  const [sending, setSending] = useState(false)
  const query = /(^|\s)@([\p{L}-]*)$/u.exec(body)?.[2]
  const suggestions = useMemo(
    () =>
      query === undefined
        ? []
        : (members.data ?? [])
            .filter((m) => m.is_active && m.user_id !== session?.user.id && fullName(m.profile).toLowerCase().includes(query.toLowerCase()))
            .slice(0, 6),
    [query, members.data, session],
  )

  function pick(uid: string, name: string) {
    setBody((b) => b.replace(/@([\p{L}-]*)$/u, `@${name} `))
    setMentions((m) => new Map(m).set(uid, name))
  }
  async function send() {
    if (!body.trim()) return
    setSending(true)
    const ids = [...mentions].filter(([, name]) => body.includes(`@${name}`)).map(([id]) => id)
    const { error } = await supabase.from('task_comments').insert({ task_id: task.id, body: body.trim(), mentions: ids })
    setSending(false)
    if (error) return toast.error(errorMessage(error))
    setBody('')
    setMentions(new Map())
    qc.invalidateQueries({ queryKey: ['task_comments', task.id] })
    qc.invalidateQueries({ queryKey: ['activity'] })
  }
  async function remove(c: Comment) {
    const { error } = await supabase.from('task_comments').delete().eq('id', c.id)
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['task_comments', task.id] })
  }
  const render = (text: string) =>
    text.split(/(@[\p{L}-]+(?: [\p{L}-]+)?)/u).map((part, i) =>
      part.startsWith('@') ? <span key={i} className="rounded bg-primary/10 px-0.5 text-primary">{part}</span> : part,
    )

  return (
    <Card>
      <CardHeader><CardTitle>Commentaires</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {list.data?.map((c) => {
          const p = map.get(c.author_id ?? '')
          return (
            <div key={c.id} className="group flex gap-3">
              <Avatar name={fullName(p)} url={p?.avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{fullName(p)}</span>
                  <span className="text-muted-foreground">{fromNow(c.created_at)}</span>
                  {c.author_id === session?.user.id && (
                    <button className="ml-auto opacity-0 group-hover:opacity-100" onClick={() => remove(c)} aria-label="Supprimer">
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{render(c.body)}</p>
              </div>
            </div>
          )
        })}
        <div className="relative">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            placeholder="Écrire un commentaire… (@ pour mentionner, Ctrl+Entrée pour envoyer)"
          />
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-lg border bg-popover p-1 shadow-lg">
              {suggestions.map((m) => (
                <button
                  key={m.user_id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => pick(m.user_id, fullName(m.profile))}
                >
                  <Avatar name={fullName(m.profile)} url={m.profile?.avatar_url} size={20} />
                  {fullName(m.profile)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={send} disabled={sending || !body.trim()}>
              {sending ? <Spinner className="text-primary-foreground" /> : <Send />} Envoyer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Reminders({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const [at, setAt] = useState('')
  const list = useQuery({
    queryKey: ['reminders', taskId],
    queryFn: async () => {
      const { data } = await supabase.from('task_reminders').select('*').eq('task_id', taskId).eq('user_id', session!.user.id).order('remind_at')
      return (data ?? []) as Reminder[]
    },
  })
  async function add() {
    if (!at) return
    const { error } = await supabase.from('task_reminders').insert({ task_id: taskId, user_id: session!.user.id, remind_at: new Date(at).toISOString() })
    if (error) return toast.error(errorMessage(error))
    setAt('')
    toast.success('Rappel programmé')
    qc.invalidateQueries({ queryKey: ['reminders', taskId] })
  }
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-4" /> Mes rappels</CardTitle></CardHeader>
      <CardContent className="grid gap-2">
        {list.data?.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm">
            <span className={cn(r.sent_at && 'text-muted-foreground line-through')}>{fmtDateTime(r.remind_at)}</span>
            <button
              aria-label="Supprimer"
              onClick={async () => { await supabase.from('task_reminders').delete().eq('id', r.id); qc.invalidateQueries({ queryKey: ['reminders', taskId] }) }}
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" variant="outline" onClick={add} disabled={!at}><Plus /></Button>
        </div>
      </CardContent>
    </Card>
  )
}

function History({ taskId }: { taskId: string }) {
  const logs = useActivity({ taskId, limit: 100 })
  const { map } = useProfiles()
  const describe = (l: { action: string; details: Record<string, unknown> }) => {
    const d = l.details as Record<string, string>
    if (l.action === 'task.status_changed') return `${actionLabel[l.action]} : ${statusLabel[d.from as TaskStatus] ?? d.from} → ${statusLabel[d.to as TaskStatus] ?? d.to}`
    if (l.action === 'task.assigned') return `${actionLabel[l.action]} à ${fullName(map.get(d.to))}`
    if (l.action === 'task.due_date_changed') return `${actionLabel[l.action]} : ${d.to ? fmtDateTime(d.to) : 'aucune'}`
    if (l.action === 'task.collaborator_added' || l.action === 'task.collaborator_removed')
      return `${actionLabel[l.action]} : ${fullName(map.get((l.details as { user_id: string }).user_id))}`
    return actionLabel[l.action] ?? l.action
  }
  return (
    <Card>
      <CardHeader><CardTitle>Historique</CardTitle></CardHeader>
      <CardContent>
        <ol className="relative grid gap-3 border-l pl-4">
          {logs.data?.map((l) => (
            <li key={l.id} className="text-sm">
              <span className="absolute -left-1 mt-1.5 size-2 rounded-full bg-border" />
              <span className="font-medium">{l.actor_id ? fullName(map.get(l.actor_id)) : 'Système'}</span>{' '}
              <span className="text-muted-foreground">{describe(l)}</span>
              <div className="text-xs text-muted-foreground">{fmtDateTime(l.created_at)}</div>
            </li>
          ))}
          {!logs.data?.length && <li className="text-sm text-muted-foreground">Aucun événement.</li>}
        </ol>
      </CardContent>
    </Card>
  )
}

