-- =====================================================================
-- Résumé du matin : chaque jour vers 8 h (heure de Paris), chaque personne reçoit
-- une notification avec ses tâches en retard, du jour et urgentes. Lien vers « Ma liste ».
-- =====================================================================

create or replace function public.send_morning_digest(p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  u record; n int := 0;
  today date := (now() at time zone 'Europe/Paris')::date;
  body text; tops text;
begin
  -- Une seule fois par jour, à partir de 8 h heure de Paris.
  if not p_force and extract(hour from now() at time zone 'Europe/Paris') not between 8 and 11 then return 0; end if;

  for u in
    with mine as (
      select distinct p.id as user_id, t.id, t.title, t.priority, t.due_date
      from profiles p
      join tasks t on (t.assignee_id = p.id or exists (select 1 from task_assignees a where a.task_id = t.id and a.user_id = p.id))
      where p.is_active and t.status <> 'done' and t.archived_at is null
    )
    select user_id,
      count(*) filter (where due_date is not null and (due_date at time zone 'Europe/Paris')::date < today) as late,
      count(*) filter (where due_date is not null and (due_date at time zone 'Europe/Paris')::date = today) as today_n,
      count(*) filter (where priority in ('urgent', 'high')) as urgent,
      (array_agg(title order by
         (due_date is not null and (due_date at time zone 'Europe/Paris')::date <= today) desc,
         case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
         due_date nulls last))[1:3] as top
    from mine
    group by user_id
  loop
    continue when u.late + u.today_n + u.urgent = 0;
    -- Déjà envoyé aujourd'hui ?
    continue when exists (
      select 1 from notifications
      where user_id = u.user_id and type = 'reminder' and title = 'Ta journée'
        and (created_at at time zone 'Europe/Paris')::date = today);

    body := concat_ws(' · ',
      case when u.late > 0 then u.late || ' en retard' end,
      case when u.today_n > 0 then u.today_n || ' pour aujourd''hui' end,
      case when u.urgent > 0 then u.urgent || ' urgente' || case when u.urgent > 1 then 's' else '' end end);
    select string_agg('« ' || x || ' »', ', ') into tops from unnest(u.top) as x;
    if tops is not null then body := body || '. À faire en premier : ' || tops; end if;

    perform notify(u.user_id, 'reminder', 'Ta journée', body, null, null, '/ma-liste');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_morning_digest(boolean) from public, anon, authenticated;

-- Toutes les heures à la 5e minute (le résumé ne part qu'une fois par jour, dès 8 h).
do $$
begin
  perform cron.schedule('resume-du-matin', '5 * * * *', 'select public.send_morning_digest()');
exception when others then
  raise notice 'pg_cron indisponible (%), activez-le dans Supabase > Database > Extensions puis relancez ce script', sqlerrm;
end $$;
