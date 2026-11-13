import { AlertTriangle, Calendar, Circle, CircleCheck, CircleDashed, CircleDot, CirclePause, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDue, isOverdue, priorityClass, priorityLabel, statusColor, statusLabel } from '@/lib/labels'
import type { Company, Task, TaskPriority, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const statusIcon: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: CircleDot,
  waiting: CirclePause,
  blocked: AlertTriangle,
  done: CircleCheck,
}

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = statusIcon[status] ?? CircleDashed
  return <Icon className={cn('size-4 shrink-0', className)} style={{ color: statusColor[status] }} />
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge className="border-transparent bg-muted text-foreground">
      <StatusIcon status={status} className="size-3" />
      {statusLabel[status]}
    </Badge>
  )
}

export function PriorityBadge({ priority, compact }: { priority: TaskPriority; compact?: boolean }) {
  if (compact && priority === 'normal') return null
  return <Badge className={priorityClass[priority]}>{priorityLabel[priority]}</Badge>
}

export function DueBadge({ task }: { task: Pick<Task, 'due_date' | 'status'> }) {
  if (!task.due_date) return null
  const late = isOverdue(task)
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', late ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
      <Calendar className="size-3" />
      {formatDue(task.due_date)}
    </span>
  )
}

export function CompanyDot({ company, withName, className }: { company?: Pick<Company, 'color' | 'name'> | null; withName?: boolean; className?: string }) {
  if (!company) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: company.color }} />
      {withName && <span className="truncate">{company.name}</span>}
    </span>
  )
}

export function PrivateIcon({ show }: { show: boolean }) {
  if (!show) return null
  return <Lock className="size-3 text-muted-foreground" aria-label="Privée" />
}

export function CompanyLogo({ company, size = 20 }: { company?: Pick<Company, 'color' | 'name' | 'logo_url'> | null; size?: number }) {
  if (!company) return null
  if (company.logo_url)
    return <img src={company.logo_url} alt="" className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
      style={{ width: size, height: size, background: company.color, fontSize: size * 0.5 }}
    >
      {company.name.slice(0, 1).toUpperCase()}
    </span>
  )
}
