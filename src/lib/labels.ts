import { differenceInCalendarDays, format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { CompanyRole, NotificationType, ProjectStatus, Task, TaskPriority, TaskRecurrence, TaskStatus } from './types'

export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'blocked', 'done']
export const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

export const statusLabel: Record<TaskStatus, string> = {
  todo: 'À faire', in_progress: 'En cours', waiting: 'En attente', blocked: 'Bloquée', done: 'Terminée',
}
export const statusColor: Record<TaskStatus, string> = {
  todo: '#94a3b8', in_progress: '#3b82f6', waiting: '#f59e0b', blocked: '#ef4444', done: '#10b981',
}
export const priorityLabel: Record<TaskPriority, string> = {
  low: 'Faible', normal: 'Normale', high: 'Haute', urgent: 'Urgente',
}
export const priorityClass: Record<TaskPriority, string> = {
  low: 'text-slate-500 border-slate-300/60 bg-slate-500/5',
  normal: 'text-sky-600 border-sky-300/60 bg-sky-500/5 dark:text-sky-400',
  high: 'text-orange-600 border-orange-300/60 bg-orange-500/10 dark:text-orange-400',
  urgent: 'text-red-600 border-red-300/60 bg-red-500/10 dark:text-red-400',
}
export const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export const roleLabel: Record<CompanyRole, string> = { admin: 'Administrateur', manager: 'Manager', employee: 'Employé' }
export const recurrenceLabel: Record<TaskRecurrence, string> = {
  none: 'Aucune', daily: 'Tous les jours', weekly: 'Toutes les semaines', monthly: 'Tous les mois',
}
export const projectStatusLabel: Record<ProjectStatus, string> = {
  planned: 'Planifié', active: 'En cours', on_hold: 'En pause', completed: 'Terminé', archived: 'Archivé',
}
export const notificationTypeLabel: Record<NotificationType, string> = {
  task_assigned: 'Nouvelle tâche attribuée',
  task_updated: 'Modification importante d’une tâche',
  mention: 'Mention dans un commentaire',
  comment: 'Nouveau commentaire sur mes tâches',
  due_soon: 'Échéance proche',
  overdue: 'Tâche en retard',
  task_blocked: 'Tâche signalée comme bloquée',
  task_completed: 'Tâche terminée',
  invitation: 'Invitation à rejoindre une société',
  reminder: 'Rappels personnels',
}
export const actionLabel: Record<string, string> = {
  'task.created': 'a créé la tâche',
  'task.assigned': 'a attribué la tâche',
  'task.status_changed': 'a changé le statut',
  'task.completed': 'a terminé la tâche',
  'task.due_date_changed': 'a changé l’échéance',
  'task.priority_changed': 'a changé la priorité',
  'task.updated': 'a modifié la tâche',
  'task.archived': 'a archivé la tâche',
  'task.unarchived': 'a désarchivé la tâche',
  'task.deleted': 'a supprimé la tâche',
  'task.collaborator_added': 'a ajouté un collaborateur',
  'task.collaborator_removed': 'a retiré un collaborateur',
  'comment.added': 'a commenté',
  'attachments.insert': 'a joint un fichier',
  'attachments.delete': 'a supprimé un fichier',
  'projects.insert': 'a créé le projet',
  'projects.update': 'a modifié le projet',
  'projects.delete': 'a supprimé le projet',
  'companies.insert': 'a créé la société',
  'companies.update': 'a modifié la société',
  'companies.delete': 'a supprimé la société',
  'company_memberships.insert': 'a ajouté un collaborateur',
  'company_memberships.update': 'a modifié les droits d’un collaborateur',
  'company_memberships.delete': 'a retiré un collaborateur',
  'teams.insert': 'a créé l’équipe',
  'teams.update': 'a modifié l’équipe',
  'teams.delete': 'a supprimé l’équipe',
  'invitation.created': 'a envoyé une invitation',
  'invitation.accepted': 'a accepté une invitation',
  'user.deactivated': 'a désactivé un compte',
  'user.reactivated': 'a réactivé un compte',
  'super_admin.granted': 'a nommé un super-administrateur',
}

export function isOverdue(t: Pick<Task, 'due_date' | 'status'>) {
  return !!t.due_date && t.status !== 'done' && isPast(new Date(t.due_date))
}

export function formatDue(d: string | null) {
  if (!d) return ''
  const date = new Date(d)
  if (isToday(date)) return 'Aujourd’hui'
  if (isTomorrow(date)) return 'Demain'
  const diff = differenceInCalendarDays(date, new Date())
  if (diff < 0 && diff > -7) return `Il y a ${-diff} j`
  return format(date, 'd MMM', { locale: fr })
}
export const fmtDate = (d: string | Date | null, pattern = 'd MMM yyyy') => (d ? format(new Date(d), pattern, { locale: fr }) : '—')
export const fmtDateTime = (d: string | Date | null) => fmtDate(d, 'd MMM yyyy à HH:mm')
export const fromNow = (d: string) => formatDistanceToNow(new Date(d), { locale: fr, addSuffix: true })

export function fullName(p?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!p) return 'Inconnu'
  const n = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return n || p.email || 'Inconnu'
}

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'societe'
}
