-- =====================================================================
-- 0003 — Journal d'activité, notifications, récurrence, RPC
-- =====================================================================

-- ---------- Écriture dans le journal (interne uniquement) ----------
create or replace function public.log_activity(
  p_company uuid, p_project uuid, p_task uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into activity_logs (company_id, project_id, task_id, actor_id, action, entity_type, entity_id, details)
  values (p_company, p_project, p_task, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'));
$$;

-- ---------- Création d'une notification (respecte les préférences) ----------
create or replace function public.notify(
  p_user uuid, p_type public.notification_type, p_title text, p_body text,
  p_company uuid default null, p_task uuid default null, p_link text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if not exists (select 1 from profiles where id = p_user and is_active) then return; end if;
  if exists (select 1 from notification_preferences where user_id = p_user and type = p_type and not in_app) then return; end if;
  insert into notifications (user_id, company_id, task_id, actor_id, type, title, body, link)
  values (p_user, p_company, p_task, auth.uid(), p_type, p_title, p_body,
          coalesce(p_link, case when p_task is not null then '/taches/' || p_task end));
end $$;

create or replace function public.actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(first_name || ' ' || last_name), ''), email, 'Système')
  from profiles where id = auth.uid()
  union all select 'Système' where auth.uid() is null
  limit 1;
$$;

-- ---------- Triggers sur les tâches ----------
create or replace function public.on_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(public.actor_name(), 'Quelqu''un');
  u uuid;
  next_due timestamptz;
  step interval;
begin
  if tg_op = 'INSERT' then
    perform log_activity(new.company_id, new.project_id, new.id, 'task.created', 'task', new.id,
      jsonb_build_object('title', new.title, 'assignee_id', new.assignee_id, 'priority', new.priority, 'due_date', new.due_date));
    if new.assignee_id is not null then
      perform notify(new.assignee_id, 'task_assigned', 'Nouvelle tâche attribuée',
        who || ' vous a attribué « ' || new.title || ' »', new.company_id, new.id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity(old.company_id, old.project_id, old.id, 'task.deleted', 'task', old.id,
      jsonb_build_object('title', old.title));
    return old;
  end if;

  -- UPDATE
  if new.assignee_id is distinct from old.assignee_id then
    perform log_activity(new.company_id, new.project_id, new.id, 'task.assigned', 'task', new.id,
      jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    if new.assignee_id is not null then
      perform notify(new.assignee_id, 'task_assigned', 'Nouvelle tâche attribuée',
        who || ' vous a attribué « ' || new.title || ' »', new.company_id, new.id);
    end if;
  end if;

  if new.status is distinct from old.status then
    perform log_activity(new.company_id, new.project_id, new.id, 'task.status_changed', 'task', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'blocked_reason', new.blocked_reason));
    if new.status = 'blocked' then
      for u in
        select distinct x from (
          select new.created_by as x
          union select t.manager_id from teams t join team_members tm on tm.team_id = t.id
                where t.company_id = new.company_id and tm.user_id = new.assignee_id
          union select m.user_id from company_memberships m where m.company_id = new.company_id and m.role = 'admin' and m.is_active
        ) s where x is not null
      loop
        perform notify(u, 'task_blocked', 'Tâche bloquée',
          who || ' signale un blocage sur « ' || new.title || ' » : ' || coalesce(new.blocked_reason, ''), new.company_id, new.id);
      end loop;
    elsif new.status = 'done' then
      perform log_activity(new.company_id, new.project_id, new.id, 'task.completed', 'task', new.id, '{}');
      perform notify(new.created_by, 'task_completed', 'Tâche terminée',
        who || ' a terminé « ' || new.title || ' »', new.company_id, new.id);
      -- Récurrence : création de l'occurrence suivante
      if new.recurrence <> 'none' and new.archived_at is null and not exists (
           select 1 from tasks c where c.recurrence_parent_id = coalesce(new.recurrence_parent_id, new.id)
             and c.created_at > coalesce(old.completed_at, new.created_at) and c.id <> new.id and c.status <> 'done'
             and c.due_date > coalesce(new.due_date, now())) then
        step := case new.recurrence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
        next_due := coalesce(new.due_date, now()) + step;
        insert into tasks (company_id, project_id, title, description, created_by, assignee_id, priority, status,
                           is_private, start_date, due_date, recurrence, recurrence_parent_id)
        values (new.company_id, new.project_id, new.title, new.description, new.created_by, new.assignee_id, new.priority, 'todo',
                new.is_private, case when new.start_date is not null then (new.start_date + step)::date end,
                next_due, new.recurrence, coalesce(new.recurrence_parent_id, new.id));
      end if;
    end if;
  end if;

  if new.due_date is distinct from old.due_date then
    perform log_activity(new.company_id, new.project_id, new.id, 'task.due_date_changed', 'task', new.id,
      jsonb_build_object('from', old.due_date, 'to', new.due_date));
    new.due_soon_notified_at := null;
    new.overdue_notified_at := null;
  end if;
  if new.priority is distinct from old.priority then
    perform log_activity(new.company_id, new.project_id, new.id, 'task.priority_changed', 'task', new.id,
      jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.project_id is distinct from old.project_id or new.is_private is distinct from old.is_private then
    perform log_activity(new.company_id, new.project_id, new.id, 'task.updated', 'task', new.id,
      jsonb_build_object('title_changed', new.title is distinct from old.title,
                         'description_changed', new.description is distinct from old.description));
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform log_activity(new.company_id, new.project_id, new.id,
      case when new.archived_at is null then 'task.unarchived' else 'task.archived' end, 'task', new.id, '{}');
  end if;

  -- Modification importante : prévenir responsable + collaborateurs
  if new.due_date is distinct from old.due_date or new.priority is distinct from old.priority
     or new.title is distinct from old.title or new.description is distinct from old.description then
    for u in
      select x from (
        select new.assignee_id as x where new.assignee_id is not distinct from old.assignee_id
        union select user_id from task_assignees where task_id = new.id
      ) s where x is not null
    loop
      perform notify(u, 'task_updated', 'Tâche modifiée',
        who || ' a modifié « ' || new.title || ' »', new.company_id, new.id);
    end loop;
  end if;
  return new;
end $$;

-- BEFORE pour pouvoir réinitialiser les drapeaux de rappel ; les logs sont écrits dans la même transaction.
create trigger trg_task_change_ins after insert on public.tasks for each row execute function public.on_task_change();
create trigger trg_task_change_upd before update on public.tasks for each row execute function public.on_task_change();
create trigger trg_task_change_del after delete on public.tasks for each row execute function public.on_task_change();

-- Le trigger BEFORE UPDATE s'exécute après guard_task (ordre alphabétique : trg_guard_task < trg_task_change_upd)

create or replace function public.on_task_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if tg_op = 'INSERT' then
    select id, company_id, project_id, title into t from tasks where id = new.task_id;
    perform log_activity(t.company_id, t.project_id, t.id, 'task.collaborator_added', 'task', t.id, jsonb_build_object('user_id', new.user_id));
    perform notify(new.user_id, 'task_assigned', 'Vous êtes associé à une tâche',
      coalesce(public.actor_name(), 'Quelqu''un') || ' vous a ajouté à « ' || t.title || ' »', t.company_id, t.id);
    return new;
  else
    select id, company_id, project_id into t from tasks where id = old.task_id;
    if found then
      perform log_activity(t.company_id, t.project_id, t.id, 'task.collaborator_removed', 'task', t.id, jsonb_build_object('user_id', old.user_id));
    end if;
    return old;
  end if;
end $$;
create trigger trg_task_assignee_change after insert or delete on public.task_assignees
  for each row execute function public.on_task_assignee_change();

-- ---------- Commentaires & mentions ----------
create or replace function public.on_comment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
  u uuid;
  who text := coalesce(public.actor_name(), 'Quelqu''un');
begin
  select id, company_id, project_id, title, assignee_id, created_by into t from tasks where id = new.task_id;
  perform log_activity(t.company_id, t.project_id, t.id, 'comment.added', 'comment', new.id,
    jsonb_build_object('excerpt', left(new.body, 140)));
  -- Mentions : uniquement des membres actifs de la société
  foreach u in array coalesce(new.mentions, '{}') loop
    if public.is_active_member(t.company_id, u) then
      perform notify(u, 'mention', 'Vous avez été mentionné',
        who || ' vous a mentionné sur « ' || t.title || ' »', t.company_id, t.id);
    end if;
  end loop;
  -- Responsable et créateur sont prévenus des nouveaux commentaires
  for u in select distinct x from (select t.assignee_id x union select t.created_by) s where x is not null loop
    if not (u = any(coalesce(new.mentions, '{}'))) then
      perform notify(u, 'comment', 'Nouveau commentaire', who || ' a commenté « ' || t.title || ' »', t.company_id, t.id);
    end if;
  end loop;
  return new;
end $$;
create trigger trg_comment_insert after insert on public.task_comments
  for each row execute function public.on_comment_insert();

-- ---------- Journal : sociétés, adhésions, projets, fichiers ----------
create or replace function public.on_generic_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; cid uuid; pid uuid; tid uuid; eid uuid;
begin
  r := coalesce(new, old);
  case tg_table_name
    when 'companies' then cid := r.id; eid := r.id;
    when 'company_memberships' then cid := (to_jsonb(r) ->> 'company_id')::uuid; eid := (to_jsonb(r) ->> 'user_id')::uuid;
    when 'projects' then cid := (to_jsonb(r) ->> 'company_id')::uuid; pid := r.id; eid := r.id;
    when 'attachments' then cid := (to_jsonb(r) ->> 'company_id')::uuid; tid := (to_jsonb(r) ->> 'task_id')::uuid; eid := r.id;
    when 'teams' then cid := (to_jsonb(r) ->> 'company_id')::uuid; eid := r.id;
    else eid := null;
  end case;
  perform log_activity(cid, pid, tid, tg_table_name || '.' || lower(tg_op), tg_table_name, eid,
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
         else jsonb_build_object('row', to_jsonb(r)) end);
  return r;
end $$;
create trigger trg_log_companies after insert or update or delete on public.companies for each row execute function public.on_generic_change();
create trigger trg_log_memberships after insert or update or delete on public.company_memberships for each row execute function public.on_generic_change();
create trigger trg_log_projects after insert or update or delete on public.projects for each row execute function public.on_generic_change();
create trigger trg_log_attachments after insert or delete on public.attachments for each row execute function public.on_generic_change();
create trigger trg_log_teams after insert or update or delete on public.teams for each row execute function public.on_generic_change();

-- ---------- Invitations ----------
create or replace function public.on_invitation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; cname text;
begin
  select name into cname from companies where id = new.company_id;
  perform log_activity(new.company_id, null, null, 'invitation.created', 'invitation', new.id,
    jsonb_build_object('email', new.email, 'role', new.role));
  select id into uid from profiles where lower(email) = new.email;
  if uid is not null then
    perform notify(uid, 'invitation', 'Invitation à rejoindre ' || cname,
      'Vous êtes invité à rejoindre ' || cname || '.', new.company_id, null, '/invitations');
  end if;
  return new;
end $$;
create trigger trg_invitation_insert after insert on public.invitations
  for each row execute function public.on_invitation_insert();

-- Accepter ses invitations (e-mail vérifié obligatoire)
create or replace function public.accept_my_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  my_email text;
  inv record;
  n integer := 0;
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '42501'; end if;
  select lower(email) into my_email from auth.users where id = uid and email_confirmed_at is not null;
  if my_email is null then return 0; end if;
  if not exists (select 1 from profiles where id = uid and is_active) then return 0; end if;
  for inv in
    select * from invitations
    where email = my_email and accepted_at is null and revoked_at is null and expires_at > now()
  loop
    insert into company_memberships (company_id, user_id, role, job_title)
    values (inv.company_id, uid, inv.role, inv.job_title)
    on conflict (company_id, user_id) do update set role = excluded.role, is_active = true;
    if inv.team_id is not null then
      insert into team_members (team_id, company_id, user_id) values (inv.team_id, inv.company_id, uid)
      on conflict do nothing;
    end if;
    if inv.job_title is not null then
      update profiles set job_title = coalesce(job_title, inv.job_title) where id = uid;
    end if;
    update invitations set accepted_at = now() where id = inv.id;
    perform log_activity(inv.company_id, null, null, 'invitation.accepted', 'invitation', inv.id, '{}');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Administration des accès ----------
-- Couper / rétablir immédiatement tous les accès d'un utilisateur (super-admin)
create or replace function public.set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super-administrateur' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Vous ne pouvez pas désactiver votre propre compte' using errcode = '42501';
  end if;
  update profiles set is_active = p_active where id = p_user;
  perform log_activity(null, null, null, case when p_active then 'user.reactivated' else 'user.deactivated' end,
    'profile', p_user, '{}');
end $$;

-- Nommer un super-administrateur : uniquement depuis l'éditeur SQL (rôle postgres)
create or replace function public.grant_super_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from profiles where lower(email) = lower(p_email);
  if uid is null then raise exception 'Aucun utilisateur avec l''e-mail %', p_email; end if;
  insert into platform_admins (user_id) values (uid) on conflict do nothing;
  insert into activity_logs (actor_id, action, entity_type, entity_id) values (null, 'super_admin.granted', 'profile', uid);
end $$;
revoke execute on function public.grant_super_admin(text) from public, anon, authenticated;

create or replace function public.mark_all_notifications_read()
returns void language sql security invoker set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- Fonctions internes : non appelables via l'API
revoke execute on function public.log_activity(uuid, uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.notify(uuid, public.notification_type, text, text, uuid, uuid, text) from public, anon, authenticated;
