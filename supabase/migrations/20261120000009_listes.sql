-- =====================================================================
-- « Listes » : la façon de travailler de Pierre. On colle une liste de choses à faire
-- (un bloc par société), elle devient une liste à cocher pour la personne choisie.
-- Visible par son auteur, la personne à qui elle est envoyée et les super-admins.
-- Relançable sans risque.
-- =====================================================================

create table if not exists public.quick_lists (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quick_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.quick_lists (id) on delete cascade,
  section text check (section is null or char_length(section) <= 80),
  text text not null check (char_length(btrim(text)) between 1 and 500),
  done boolean not null default false,
  done_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quick_list_items_list on public.quick_list_items (list_id, position);
create index if not exists quick_lists_assignee on public.quick_lists (assignee_id) where archived_at is null;

drop trigger if exists trg_quick_lists_touch on public.quick_lists;
create trigger trg_quick_lists_touch before update on public.quick_lists
  for each row execute function public.touch_updated_at();

-- Date de la case cochée, et liste « mise à jour » pour remonter en haut.
create or replace function public.quick_list_item_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.done is distinct from old.done then
    new.done_at := case when new.done then now() end;
  end if;
  update quick_lists set updated_at = now() where id = new.list_id;
  return new;
end $$;
drop trigger if exists trg_quick_list_item_done on public.quick_list_items;
create trigger trg_quick_list_item_done before insert or update on public.quick_list_items
  for each row execute function public.quick_list_item_done();

-- Prévenir la personne qui reçoit une nouvelle liste.
create or replace function public.quick_list_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform notify(new.assignee_id, 'task_assigned', 'Nouvelle liste', new.title, null, null, '/listes/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_quick_list_notify on public.quick_lists;
create trigger trg_quick_list_notify after insert or update of assignee_id on public.quick_lists
  for each row execute function public.quick_list_notify();

alter table public.quick_lists enable row level security;
alter table public.quick_list_items enable row level security;
revoke all on public.quick_lists, public.quick_list_items from anon;
grant select, insert, update, delete on public.quick_lists, public.quick_list_items to authenticated;

create or replace function public.can_see_quick_list(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from quick_lists l
    where l.id = lid and (l.created_by = auth.uid() or l.assignee_id = auth.uid())
  ) and exists (select 1 from profiles where id = auth.uid() and is_active);
$$;
revoke execute on function public.can_see_quick_list(uuid) from public, anon;

drop policy if exists quick_lists_select on public.quick_lists;
drop policy if exists quick_lists_insert on public.quick_lists;
drop policy if exists quick_lists_update on public.quick_lists;
drop policy if exists quick_lists_delete on public.quick_lists;
create policy quick_lists_select on public.quick_lists for select to authenticated
  using (public.can_see_quick_list(id));
create policy quick_lists_insert on public.quick_lists for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and is_active));
create policy quick_lists_update on public.quick_lists for update to authenticated
  using (public.can_see_quick_list(id)) with check (public.can_see_quick_list(id));
create policy quick_lists_delete on public.quick_lists for delete to authenticated
  using (public.is_super_admin() or created_by = auth.uid());

drop policy if exists quick_list_items_all on public.quick_list_items;
create policy quick_list_items_all on public.quick_list_items for all to authenticated
  using (public.can_see_quick_list(list_id)) with check (public.can_see_quick_list(list_id));

do $$
begin
  alter publication supabase_realtime add table public.quick_lists, public.quick_list_items;
exception when others then
  raise notice 'Publication temps réel non modifiée : %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
