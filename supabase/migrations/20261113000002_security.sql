-- =====================================================================
-- 0002 — Sécurité : fonctions d'autorisation, triggers de contrôle, RLS
-- Toutes les décisions d'accès sont prises ici, côté base de données.
-- Le rôle envoyé par le frontend n'est jamais pris en compte.
-- =====================================================================

-- ---------- Fonctions d'autorisation (SECURITY DEFINER, sans récursion RLS) ----------

create or replace function public.is_active_user(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = uid and p.is_active);
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins a join profiles p on p.id = a.user_id
    where a.user_id = auth.uid() and p.is_active
  );
$$;

-- Rôle effectif de l'utilisateur courant dans une société (null si aucun / désactivé)
create or replace function public.company_role(cid uuid)
returns public.company_role language sql stable security definer set search_path = public as $$
  select m.role from company_memberships m join profiles p on p.id = m.user_id
  where m.company_id = cid and m.user_id = auth.uid() and m.is_active and p.is_active;
$$;

create or replace function public.is_company_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.company_role(cid) is not null;
$$;

create or replace function public.is_company_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.company_role(cid) = 'admin';
$$;

-- L'utilisateur cible est-il un membre actif de la société ?
create or replace function public.is_active_member(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from company_memberships m join profiles p on p.id = m.user_id
    where m.company_id = cid and m.user_id = uid and m.is_active and p.is_active
  );
$$;

-- L'utilisateur courant encadre-t-il uid (manager d'une équipe dont uid est membre) ?
create or replace function public.manages_user(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and public.company_role(cid) in ('manager', 'admin') and (
    uid = auth.uid() or exists (
      select 1 from teams t join team_members tm on tm.team_id = t.id
      where t.company_id = cid and t.manager_id = auth.uid() and tm.user_id = uid
    )
  );
$$;

create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid());
$$;

create or replace function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p where p.id = pid and (
      public.is_company_admin(p.company_id)
      or (public.company_role(p.company_id) is not null and (
            p.visibility = 'public' or p.owner_id = auth.uid() or public.is_project_member(p.id)))
    )
  );
$$;

create or replace function public.is_task_collaborator(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from task_assignees where task_id = tid and user_id = auth.uid());
$$;

-- Droit de voir une tâche (utilisé par les tables enfants : commentaires, fichiers…)
create or replace function public.can_view_task(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t where t.id = tid and (
      public.is_company_admin(t.company_id)
      or (public.company_role(t.company_id) is not null and (
            t.created_by = auth.uid() or t.assignee_id = auth.uid()
         or public.is_task_collaborator(t.id)
         or public.manages_user(t.company_id, t.assignee_id)
         or (not t.is_private and t.project_id is not null and public.can_view_project(t.project_id))))
    )
  );
$$;

-- Droit de « gérer » une tâche : tout modifier (titre, échéance, attribution…)
create or replace function public.can_manage_task(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t where t.id = tid and (
      public.is_company_admin(t.company_id)
      or (public.company_role(t.company_id) = 'manager'
          and (t.created_by = auth.uid() or public.manages_user(t.company_id, t.assignee_id)))
    )
  );
$$;

-- Droit de « travailler » sur une tâche : statut, sous-tâches, blocage (employé attribué)
create or replace function public.can_work_on_task(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_task(tid) or exists (
    select 1 from tasks t where t.id = tid and public.company_role(t.company_id) is not null
      and (t.assignee_id = auth.uid() or public.is_task_collaborator(t.id))
  );
$$;

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_companies_touch before update on public.companies for each row execute function public.touch_updated_at();
create trigger trg_memberships_touch before update on public.company_memberships for each row execute function public.touch_updated_at();
create trigger trg_teams_touch before update on public.teams for each row execute function public.touch_updated_at();
create trigger trg_projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger trg_tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- ---------- Création automatique du profil ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'first_name', ''),
          coalesce(new.raw_user_meta_data ->> 'last_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Contrôles d'intégrité métier ----------

-- Adhésions : personne ne peut modifier sa propre adhésion (sauf super-admin) ;
-- seul le super-admin nomme ou modifie des administrateurs de société.
-- SECURITY INVOKER : current_user = 'authenticated' pour un appel via l'API,
-- et le propriétaire lorsqu'une fonction interne de confiance (SECURITY DEFINER) écrit.
create or replace function public.guard_membership()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user <> 'authenticated' or public.is_super_admin() then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and (old.user_id = auth.uid() or old.role = 'admin') then
    raise exception 'Permission refusée : adhésion non modifiable' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.user_id = auth.uid() or new.role = 'admin' then
      raise exception 'Permission refusée : seul le super-administrateur nomme des administrateurs' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.company_id <> old.company_id or new.user_id <> old.user_id) then
      raise exception 'Société et utilisateur non modifiables' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_membership before insert or update or delete on public.company_memberships
  for each row execute function public.guard_membership();

-- Membres d'équipe et de projet : doivent appartenir à la société
create or replace function public.guard_team_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from company_memberships where company_id = new.company_id and user_id = new.user_id) then
    raise exception 'Cet utilisateur n''appartient pas à la société' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_guard_team_member before insert or update on public.team_members
  for each row execute function public.guard_team_member();

create or replace function public.guard_team()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.manager_id is not null and not exists (
    select 1 from company_memberships where company_id = new.company_id and user_id = new.manager_id) then
    raise exception 'Le manager doit appartenir à la société' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.company_id <> old.company_id then
    raise exception 'Société non modifiable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_team before insert or update on public.teams
  for each row execute function public.guard_team();

create or replace function public.guard_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and (new.company_id <> old.company_id or new.created_by is distinct from old.created_by) then
    raise exception 'Société et créateur non modifiables' using errcode = '42501';
  end if;
  if new.owner_id is not null and not exists (
    select 1 from company_memberships where company_id = new.company_id and user_id = new.owner_id) then
    raise exception 'Le responsable doit appartenir à la société' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_guard_project before insert or update on public.projects
  for each row execute function public.guard_project();

create or replace function public.guard_project_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from projects p join company_memberships m on m.company_id = p.company_id
    where p.id = new.project_id and m.user_id = new.user_id) then
    raise exception 'Cet utilisateur n''appartient pas à la société du projet' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_guard_project_member before insert or update on public.project_members
  for each row execute function public.guard_project_member();

-- Tâches : contrôle fin des colonnes modifiables selon le rôle
-- SECURITY INVOKER : current_user = 'authenticated' pour un appel via l'API,
-- et le propriétaire lorsqu'une fonction interne de confiance (SECURITY DEFINER) écrit.
create or replace function public.guard_task()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  is_manager_level boolean;
  allowed_cols text[] := array['status','blocked_reason','position','updated_at','completed_at',
                               'due_soon_notified_at','overdue_notified_at'];
begin
  -- Statut terminé / bloqué : cohérence
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.status = 'blocked' and coalesce(btrim(new.blocked_reason), '') = '' then
    raise exception 'Merci d''expliquer le blocage' using errcode = '23514';
  end if;
  if new.status <> 'blocked' and tg_op = 'UPDATE' and old.status = 'blocked' then
    new.blocked_reason := null;
  end if;

  -- Appels système (cron, service, triggers internes) : pas de contrôle utilisateur
  if uid is null or current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := uid;
  else
    if new.company_id <> old.company_id or new.created_by is distinct from old.created_by then
      raise exception 'Société et créateur non modifiables' using errcode = '42501';
    end if;
  end if;

  is_manager_level := public.is_company_admin(new.company_id) or (
    public.company_role(new.company_id) = 'manager' and (
      tg_op = 'INSERT' or old.created_by = uid or public.manages_user(old.company_id, old.assignee_id)));

  if tg_op = 'UPDATE' and not is_manager_level then
    -- Employé : uniquement statut / blocage / position
    if (to_jsonb(new) - allowed_cols) is distinct from (to_jsonb(old) - allowed_cols) then
      raise exception 'Permission refusée : vous pouvez seulement changer le statut de cette tâche' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Responsable : membre actif de la société ; un manager n'attribue qu'à son équipe
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if not public.is_active_member(new.company_id, new.assignee_id) then
      raise exception 'Le responsable doit être un collaborateur actif de la société' using errcode = '23514';
    end if;
    if not public.is_company_admin(new.company_id) and not public.manages_user(new.company_id, new.assignee_id) then
      raise exception 'Vous ne pouvez attribuer des tâches qu''aux collaborateurs que vous encadrez' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_task before insert or update on public.tasks
  for each row execute function public.guard_task();

create or replace function public.guard_task_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select company_id into t from tasks where id = new.task_id;
  if not public.is_active_member(t.company_id, new.user_id) then
    raise exception 'Le collaborateur doit être actif dans la société' using errcode = '23514';
  end if;
  if auth.uid() is not null and not public.is_company_admin(t.company_id)
     and not public.manages_user(t.company_id, new.user_id) then
    raise exception 'Vous ne pouvez associer que les collaborateurs que vous encadrez' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_task_assignee before insert on public.task_assignees
  for each row execute function public.guard_task_assignee();

-- Sous-tâches : un employé ne peut que cocher / décocher
create or replace function public.guard_subtask()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_manage_task(old.task_id) then return new; end if;
  if new.task_id <> old.task_id or new.title <> old.title or new.assignee_id is distinct from old.assignee_id
     or new.due_date is distinct from old.due_date or new.position <> old.position then
    raise exception 'Permission refusée : vous pouvez seulement cocher cette sous-tâche' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_subtask before update on public.subtasks
  for each row execute function public.guard_subtask();

create or replace function public.guard_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_manage_task(old.task_id) then return new; end if;
  if new.task_id <> old.task_id or new.label <> old.label or new.position <> old.position then
    raise exception 'Permission refusée : vous pouvez seulement cocher cet élément' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_checklist before update on public.checklist_items
  for each row execute function public.guard_checklist();

create or replace function public.guard_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.edited_at := null;
    -- on ne garde que les mentions de personnes pouvant voir la tâche (contrôle dans le trigger de notif)
  else
    if new.task_id <> old.task_id or new.author_id is distinct from old.author_id or new.created_at <> old.created_at then
      raise exception 'Permission refusée' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard_comment before insert or update on public.task_comments
  for each row execute function public.guard_comment();

create or replace function public.guard_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  select company_id into new.company_id from tasks where id = new.task_id;
  if new.storage_path not like new.company_id::text || '/' || new.task_id::text || '/%' then
    raise exception 'Chemin de fichier invalide' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_guard_attachment before insert on public.attachments
  for each row execute function public.guard_attachment();

-- SECURITY INVOKER : current_user = 'authenticated' pour un appel via l'API,
-- et le propriétaire lorsqu'une fonction interne de confiance (SECURITY DEFINER) écrit.
create or replace function public.guard_invitation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.email := lower(btrim(new.email));
    new.invited_by := coalesce(auth.uid(), new.invited_by);
    new.accepted_at := null;
    if current_user = 'authenticated' and not public.is_super_admin() and new.role = 'admin' then
      raise exception 'Seul le super-administrateur peut inviter un administrateur' using errcode = '42501';
    end if;
    if new.team_id is not null and not exists (select 1 from teams where id = new.team_id and company_id = new.company_id) then
      raise exception 'Équipe invalide' using errcode = '23514';
    end if;
  elsif current_user = 'authenticated' then
    -- seule la révocation est possible via l'API
    if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') then
      raise exception 'Seule la révocation est autorisée' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_invitation before insert or update on public.invitations
  for each row execute function public.guard_invitation();

-- Journal : aucune modification ni suppression, même par le propriétaire des tables
create or replace function public.forbid_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Le journal d''activité est en lecture seule' using errcode = '42501';
end $$;
create trigger trg_activity_logs_immutable before update or delete on public.activity_logs
  for each row execute function public.forbid_change();
create trigger trg_activity_logs_no_truncate before truncate on public.activity_logs
  for each statement execute function public.forbid_change();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.subtasks enable row level security;
alter table public.checklist_items enable row level security;
alter table public.task_comments enable row level security;
alter table public.attachments enable row level security;
alter table public.task_reminders enable row level security;
alter table public.invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.activity_logs enable row level security;

-- Aucun accès anonyme
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;

-- ---- profiles ----
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_super_admin() or exists (
    select 1 from company_memberships mine join company_memberships theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.is_active and theirs.user_id = profiles.id)
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active_user()) with check (id = auth.uid());
create policy profiles_update_super on public.profiles for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
-- Colonnes modifiables : jamais is_active, email ou id par l'API (super-admin passe par une RPC)
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, avatar_url, job_title, phone) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- ---- platform_admins : lecture de sa propre ligne, aucune écriture ----
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
revoke insert, update, delete on public.platform_admins from authenticated;

-- ---- companies ----
create policy companies_select on public.companies for select to authenticated
  using (public.is_company_member(id));
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_super_admin());
create policy companies_update on public.companies for update to authenticated
  using (public.is_company_admin(id)) with check (public.is_company_admin(id));
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_super_admin());

-- ---- company_memberships ----
create policy memberships_select on public.company_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_company_member(company_id));
create policy memberships_insert on public.company_memberships for insert to authenticated
  with check (public.is_company_admin(company_id));
create policy memberships_update on public.company_memberships for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
create policy memberships_delete on public.company_memberships for delete to authenticated
  using (public.is_company_admin(company_id));

-- ---- teams / team_members ----
create policy teams_select on public.teams for select to authenticated using (public.is_company_member(company_id));
create policy teams_write on public.teams for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
create policy team_members_select on public.team_members for select to authenticated using (public.is_company_member(company_id));
create policy team_members_write on public.team_members for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

-- ---- projects / project_members ----
create policy projects_select on public.projects for select to authenticated using (
  public.is_company_admin(company_id)
  or (public.company_role(company_id) is not null
      and (visibility = 'public' or owner_id = auth.uid() or public.is_project_member(id)))
);
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_company_admin(company_id));
create policy projects_update on public.projects for update to authenticated
  using (public.is_company_admin(company_id) or (owner_id = auth.uid() and public.company_role(company_id) is not null))
  with check (public.is_company_admin(company_id) or (owner_id = auth.uid() and public.company_role(company_id) is not null));
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_company_admin(company_id));

create policy project_members_select on public.project_members for select to authenticated
  using (public.can_view_project(project_id));
create policy project_members_write on public.project_members for all to authenticated
  using (exists (select 1 from projects p where p.id = project_id
                 and (public.is_company_admin(p.company_id) or (p.owner_id = auth.uid() and public.company_role(p.company_id) is not null))))
  with check (exists (select 1 from projects p where p.id = project_id
                 and (public.is_company_admin(p.company_id) or (p.owner_id = auth.uid() and public.company_role(p.company_id) is not null))));

-- ---- tasks ----
create policy tasks_select on public.tasks for select to authenticated using (
  public.is_company_admin(company_id)
  or (public.company_role(company_id) is not null and (
        created_by = auth.uid() or assignee_id = auth.uid()
     or public.is_task_collaborator(id)
     or public.manages_user(company_id, assignee_id)
     or (not is_private and project_id is not null and public.can_view_project(project_id))))
);
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.is_company_admin(company_id) or public.company_role(company_id) = 'manager'
);
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_company_admin(company_id)
  or (public.company_role(company_id) is not null and (
        created_by = auth.uid() or assignee_id = auth.uid()
     or public.is_task_collaborator(id)
     or (public.company_role(company_id) = 'manager' and public.manages_user(company_id, assignee_id))))
) with check (public.company_role(company_id) is not null or public.is_super_admin());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_company_admin(company_id));

-- ---- enfants des tâches ----
create policy task_assignees_select on public.task_assignees for select to authenticated using (public.can_view_task(task_id));
create policy task_assignees_insert on public.task_assignees for insert to authenticated with check (public.can_manage_task(task_id));
create policy task_assignees_delete on public.task_assignees for delete to authenticated using (public.can_manage_task(task_id));

create policy subtasks_select on public.subtasks for select to authenticated using (public.can_view_task(task_id));
create policy subtasks_insert on public.subtasks for insert to authenticated with check (public.can_manage_task(task_id));
create policy subtasks_update on public.subtasks for update to authenticated
  using (public.can_work_on_task(task_id)) with check (public.can_work_on_task(task_id));
create policy subtasks_delete on public.subtasks for delete to authenticated using (public.can_manage_task(task_id));

create policy checklist_select on public.checklist_items for select to authenticated using (public.can_view_task(task_id));
create policy checklist_insert on public.checklist_items for insert to authenticated with check (public.can_manage_task(task_id));
create policy checklist_update on public.checklist_items for update to authenticated
  using (public.can_work_on_task(task_id)) with check (public.can_work_on_task(task_id));
create policy checklist_delete on public.checklist_items for delete to authenticated using (public.can_manage_task(task_id));

create policy comments_select on public.task_comments for select to authenticated using (public.can_view_task(task_id));
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_task(task_id));
create policy comments_update on public.task_comments for update to authenticated
  using (author_id = auth.uid() and public.can_view_task(task_id)) with check (author_id = auth.uid());
create policy comments_delete on public.task_comments for delete to authenticated
  using ((author_id = auth.uid() and public.can_view_task(task_id))
         or exists (select 1 from tasks t where t.id = task_id and public.is_company_admin(t.company_id)));

create policy attachments_select on public.attachments for select to authenticated using (public.can_view_task(task_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.can_view_task(task_id));
create policy attachments_delete on public.attachments for delete to authenticated
  using ((uploaded_by = auth.uid() and public.can_view_task(task_id)) or public.can_manage_task(task_id));
revoke update on public.attachments from authenticated;

create policy reminders_own on public.task_reminders for all to authenticated
  using (user_id = auth.uid() and public.can_view_task(task_id))
  with check (user_id = auth.uid() and public.can_view_task(task_id));
revoke update (sent_at) on public.task_reminders from authenticated;

-- ---- invitations ----
create policy invitations_select on public.invitations for select to authenticated using (
  public.is_company_admin(company_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.is_company_admin(company_id));
create policy invitations_update on public.invitations for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
revoke delete on public.invitations from authenticated;

-- ---- notifications : chacun ne voit que les siennes, et ne peut que les marquer lues ----
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- activity_logs : lecture filtrée, aucune écriture via l'API ----
create policy activity_select on public.activity_logs for select to authenticated using (
  public.is_company_admin(company_id)
  or (task_id is not null and public.can_view_task(task_id))
  or (task_id is null and project_id is not null and public.can_view_project(project_id))
);
revoke insert, update, delete, truncate on public.activity_logs from authenticated;
