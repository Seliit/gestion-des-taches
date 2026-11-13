-- =====================================================================
-- 0001 — Schéma de base : sociétés, collaborateurs, équipes, projets, tâches
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Types ----------
create type public.company_role as enum ('admin', 'manager', 'employee');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'blocked', 'done');
create type public.task_recurrence as enum ('none', 'daily', 'weekly', 'monthly');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed', 'archived');
create type public.project_visibility as enum ('public', 'private');
create type public.notification_type as enum (
  'task_assigned', 'task_updated', 'mention', 'due_soon', 'overdue',
  'task_blocked', 'task_completed', 'invitation', 'reminder', 'comment'
);

-- ---------- Profils (1-1 avec auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  avatar_url text,
  job_title text,
  phone text,
  is_active boolean not null default true,       -- false = accès coupé immédiatement partout
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- Super-administrateurs : table séparée, AUCUNE écriture possible via l'API.
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Sociétés ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.company_role not null default 'employee',
  job_title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on public.company_memberships (user_id);

-- ---------- Équipes ----------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  color text not null default '#64748b',
  manager_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create index on public.teams (company_id);
create index on public.teams (manager_id);

create table public.team_members (
  team_id uuid not null,
  company_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (team_id, company_id) references public.teams (id, company_id) on delete cascade
);
create index on public.team_members (user_id);

-- ---------- Projets ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  owner_id uuid references public.profiles (id) on delete set null,
  visibility public.project_visibility not null default 'public',
  status public.project_status not null default 'active',
  start_date date,
  end_date date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index on public.projects (company_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on public.project_members (user_id);

-- ---------- Tâches ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null, -- responsable principal
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'todo',
  is_private boolean not null default false,
  start_date date,
  due_date timestamptz,
  completed_at timestamptz,
  blocked_reason text,
  recurrence public.task_recurrence not null default 'none',
  recurrence_parent_id uuid references public.tasks (id) on delete set null,
  position double precision not null default 0,
  archived_at timestamptz,
  due_soon_notified_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- le projet doit appartenir à la même société
  foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade
);
create index on public.tasks (company_id, status);
create index on public.tasks (assignee_id);
create index on public.tasks (project_id);
create index on public.tasks (due_date) where status <> 'done';

-- Collaborateurs associés
create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index on public.task_assignees (user_id);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  is_done boolean not null default false,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index on public.subtasks (task_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 300),
  is_done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index on public.checklist_items (task_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index on public.task_comments (task_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.attachments (task_id);

create table public.task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.task_reminders (remind_at) where sent_at is null;

-- ---------- Invitations ----------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.company_role not null default 'employee',
  team_id uuid references public.teams (id) on delete set null,
  job_title text,
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create index on public.invitations (lower(email)) where accepted_at is null and revoked_at is null;

-- ---------- Notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type public.notification_type not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (user_id, type)
);

-- ---------- Journal d'activité (append-only, sans FK pour survivre aux suppressions) ----------
create table public.activity_logs (
  id bigint generated always as identity primary key,
  company_id uuid,
  project_id uuid,
  task_id uuid,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity_logs (company_id, created_at desc);
create index on public.activity_logs (task_id, created_at desc);
