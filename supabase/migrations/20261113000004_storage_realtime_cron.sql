-- =====================================================================
-- 0004 — Fichiers (Supabase Storage), temps réel et traitements planifiés
-- =====================================================================

-- ---------- Storage ----------
-- attachments : PRIVÉ, chemin = {company_id}/{task_id}/{uuid}-{nom}
-- branding   : public en lecture (logos des sociétés, avatars)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800),
       ('branding', 'branding', true, 5242880)
on conflict (id) do nothing;

create or replace function public.storage_task_id(object_name text)
returns uuid language plpgsql immutable as $$
begin
  return (string_to_array(object_name, '/'))[2]::uuid;
exception when others then return null;
end $$;

create or replace function public.storage_company_id(object_name text)
returns uuid language plpgsql immutable as $$
begin
  return (string_to_array(object_name, '/'))[1]::uuid;
exception when others then return null;
end $$;

create policy "attachments_read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_view_task(public.storage_task_id(name)));
create policy "attachments_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_view_task(public.storage_task_id(name))
              and exists (select 1 from public.tasks t where t.id = public.storage_task_id(name)
                          and t.company_id = public.storage_company_id(name)));
create policy "attachments_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.can_manage_task(public.storage_task_id(name))));

-- branding : companies/{company_id}/… (admins) et avatars/{user_id}/… (soi-même)
create policy "branding_write_company" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (string_to_array(name, '/'))[1] = 'companies'
              and public.is_company_admin(public.storage_task_id(name)));
create policy "branding_update_company" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (string_to_array(name, '/'))[1] = 'companies'
         and public.is_company_admin(public.storage_task_id(name)));
create policy "branding_write_avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (string_to_array(name, '/'))[1] = 'avatars'
              and (string_to_array(name, '/'))[2] = auth.uid()::text);
create policy "branding_update_avatar" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (string_to_array(name, '/'))[1] = 'avatars'
         and (string_to_array(name, '/'))[2] = auth.uid()::text);

-- ---------- Realtime (respecte les politiques RLS) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.tasks, public.task_comments;
  end if;
end $$;

-- ---------- Traitements planifiés : échéances proches, retards, rappels ----------
create or replace function public.run_scheduled_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; r record; u uuid;
  n_soon int := 0; n_late int := 0; n_rem int := 0;
begin
  -- Échéance dans les prochaines 24 h
  for t in
    select * from tasks
    where status <> 'done' and archived_at is null and due_date is not null
      and due_date > now() and due_date <= now() + interval '24 hours' and due_soon_notified_at is null
    for update skip locked
  loop
    for u in select x from (select t.assignee_id x union select user_id from task_assignees where task_id = t.id) s where x is not null loop
      perform notify(u, 'due_soon', 'Échéance proche', '« ' || t.title || ' » arrive à échéance le '
        || to_char(t.due_date at time zone 'Europe/Paris', 'DD/MM à HH24:MI'), t.company_id, t.id);
    end loop;
    update tasks set due_soon_notified_at = now() where id = t.id;
    n_soon := n_soon + 1;
  end loop;

  -- Tâches en retard (une notification par échéance)
  for t in
    select * from tasks
    where status <> 'done' and archived_at is null and due_date is not null and due_date < now()
      and overdue_notified_at is null
    for update skip locked
  loop
    for u in select distinct x from (select t.assignee_id x union select t.created_by union select user_id from task_assignees where task_id = t.id) s where x is not null loop
      perform notify(u, 'overdue', 'Tâche en retard', '« ' || t.title || ' » a dépassé son échéance.', t.company_id, t.id);
    end loop;
    update tasks set overdue_notified_at = now() where id = t.id;
    n_late := n_late + 1;
  end loop;

  -- Rappels personnels
  for r in
    select rm.*, tk.title, tk.company_id from task_reminders rm join tasks tk on tk.id = rm.task_id
    where rm.sent_at is null and rm.remind_at <= now()
    for update of rm skip locked
  loop
    insert into notifications (user_id, company_id, task_id, type, title, body, link)
    select r.user_id, r.company_id, r.task_id, 'reminder', 'Rappel', '« ' || r.title || ' »', '/taches/' || r.task_id
    where exists (select 1 from profiles where id = r.user_id and is_active);
    update task_reminders set sent_at = now() where id = r.id;
    n_rem := n_rem + 1;
  end loop;

  return jsonb_build_object('due_soon', n_soon, 'overdue', n_late, 'reminders', n_rem);
end $$;
revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;

-- pg_cron : toutes les 10 minutes, même quand l'application est fermée
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('task-reminders', '*/10 * * * *', 'select public.run_scheduled_jobs()');
exception when others then
  raise notice 'pg_cron indisponible (%), activez-le dans Supabase > Database > Extensions puis relancez cette migration', sqlerrm;
end $$;
