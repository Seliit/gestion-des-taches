export type CompanyRole = 'admin' | 'manager' | 'employee'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'blocked' | 'done'
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'archived'
export type ProjectVisibility = 'public' | 'private'
export type NotificationType =
  | 'task_assigned' | 'task_updated' | 'mention' | 'due_soon' | 'overdue'
  | 'task_blocked' | 'task_completed' | 'invitation' | 'reminder' | 'comment'

export interface Profile {
  id: string
  email: string
  first_name: string
  last_name: string
  avatar_url: string | null
  job_title: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface Company {
  id: string
  name: string
  slug: string
  color: string
  logo_url: string | null
  created_at: string
}

export interface Membership {
  id: string
  company_id: string
  user_id: string
  role: CompanyRole
  job_title: string | null
  is_active: boolean
  created_at: string
  profile?: Profile
}

export interface Team {
  id: string
  company_id: string
  name: string
  description: string | null
  color: string
  manager_id: string | null
  team_members?: { user_id: string }[]
}

export interface Project {
  id: string
  company_id: string
  name: string
  description: string | null
  owner_id: string | null
  visibility: ProjectVisibility
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  created_by: string | null
  created_at: string
  project_members?: { user_id: string }[]
}

export interface Task {
  id: string
  company_id: string
  project_id: string | null
  title: string
  description: string | null
  created_by: string | null
  assignee_id: string | null
  priority: TaskPriority
  status: TaskStatus
  is_private: boolean
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  blocked_reason: string | null
  recurrence: TaskRecurrence
  position: number
  archived_at: string | null
  created_at: string
  updated_at: string
  task_assignees?: { user_id: string }[]
  subtasks?: { id: string; is_done: boolean }[]
}

export interface Subtask { id: string; task_id: string; title: string; is_done: boolean; assignee_id: string | null; due_date: string | null; position: number }
export interface ChecklistItem { id: string; task_id: string; label: string; is_done: boolean; position: number }
export interface Comment { id: string; task_id: string; author_id: string | null; body: string; mentions: string[]; created_at: string; edited_at: string | null }
export interface Attachment { id: string; task_id: string; company_id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; uploaded_by: string | null; created_at: string }
export interface Reminder { id: string; task_id: string; user_id: string; remind_at: string; sent_at: string | null }

export interface Invitation {
  id: string
  company_id: string
  email: string
  role: CompanyRole
  team_id: string | null
  job_title: string | null
  invited_by: string | null
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  company_id: string | null
  task_id: string | null
  actor_id: string | null
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface ActivityLog {
  id: number
  company_id: string | null
  project_id: string | null
  task_id: string | null
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

// ---------- Tableau « Idées produits » (Amazon FBA) ----------
export type ProductVerdict = 'bon' | 'moyen' | 'a_eviter'

export interface ProductColumn {
  id: string
  company_id: string
  name: string
  position: number
  is_store: boolean
  is_protected: boolean
  created_at: string
}

export interface ProductCard {
  id: string
  company_id: string
  column_id: string
  title: string
  image_url: string | null
  ean: string | null
  asin: string | null
  amazon_url: string | null
  supplier_url: string | null
  buy_price: number | null
  sell_price: number | null
  amazon_fees: number | null
  profit: number | null
  roi: number | null
  monthly_sales: number | null
  bsr: number | null
  notes: string | null
  received_at: string | null
  verdict: ProductVerdict | null
  in_cart: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
