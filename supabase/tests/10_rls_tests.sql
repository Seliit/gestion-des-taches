-- =====================================================================
-- Tests de sécurité : isolation entre sociétés, rôles, élévation de privilèges.
-- Chaque assertion qui échoue interrompt le script (ON_ERROR_STOP).
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on

create schema t;
grant usage on schema t to authenticated, anon;
create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function t.throws(q text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'ok - % (refusé : %)', label, sqlerrm;
    return;
  end;
  raise exception 'ÉCHEC (aurait dû être refusé) : %', label;
end $$;
create function t.rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------- Jeu de données (en tant que postgres, sans RLS) ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'pierre@test.fr', now(), '{"first_name":"Pierre","last_name":"Dirigeant"}'),
 ('00000000-0000-0000-0000-0000000000a1', 'admin1@test.fr', now(), '{"first_name":"Alice","last_name":"Admin"}'),
 ('00000000-0000-0000-0000-0000000000a2', 'admin2@test.fr', now(), '{"first_name":"Bruno","last_name":"Admin"}'),
 ('00000000-0000-0000-0000-0000000000b1', 'manager1@test.fr', now(), '{"first_name":"Marc","last_name":"Manager"}'),
 ('00000000-0000-0000-0000-0000000000e1', 'emp1@test.fr', now(), '{"first_name":"Emma","last_name":"Un"}'),
 ('00000000-0000-0000-0000-0000000000e2', 'emp2@test.fr', now(), '{"first_name":"Eric","last_name":"Deux"}'),
 ('00000000-0000-0000-0000-0000000000e3', 'emp3@test.fr', now(), '{"first_name":"Eva","last_name":"Trois"}');
select public.grant_super_admin('pierre@test.fr');

insert into companies (id, name, slug, color) values
 ('c0000000-0000-0000-0000-000000000001', 'Société 1', 'societe-1', '#6366f1'),
 ('c0000000-0000-0000-0000-000000000002', 'Société 2', 'societe-2', '#10b981'),
 ('c0000000-0000-0000-0000-000000000003', 'Société 3', 'societe-3', '#f59e0b');

insert into company_memberships (company_id, user_id, role) values
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin'),
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'manager'),
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'employee'),
 ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'employee'),
 ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin'),
 ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e3', 'employee'),
 ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'employee'); -- E1 dans 2 sociétés

insert into teams (id, company_id, name, manager_id) values
 ('70000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Équipe A', '00000000-0000-0000-0000-0000000000b1');
insert into team_members (team_id, company_id, user_id) values
 ('70000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1');

insert into projects (id, company_id, name, visibility, owner_id) values
 ('90000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Projet public', 'public', '00000000-0000-0000-0000-0000000000a1'),
 ('90000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Projet privé', 'private', '00000000-0000-0000-0000-0000000000a1'),
 ('90000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Projet S2', 'public', '00000000-0000-0000-0000-0000000000a2');
insert into project_members (project_id, user_id) values
 ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1');

insert into tasks (id, company_id, project_id, title, assignee_id, is_private, created_by) values
 ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Tâche E1 publique', '00000000-0000-0000-0000-0000000000e1', false, '00000000-0000-0000-0000-0000000000a1'),
 ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Tâche privée E2', '00000000-0000-0000-0000-0000000000e2', true, '00000000-0000-0000-0000-0000000000a1'),
 ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'Tâche projet privé', '00000000-0000-0000-0000-0000000000a1', false, '00000000-0000-0000-0000-0000000000a1'),
 ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000003', 'Tâche Société 2', '00000000-0000-0000-0000-0000000000e3', false, '00000000-0000-0000-0000-0000000000a2'),
 ('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', null, 'Tâche hors projet E2', '00000000-0000-0000-0000-0000000000e2', false, '00000000-0000-0000-0000-0000000000a1');

-- Raccourcis de connexion
\set as_super  'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000a","email":"pierre@test.fr"}'', false); set role authenticated;'
\set as_admin1 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a1","email":"admin1@test.fr"}'', false); set role authenticated;'
\set as_admin2 'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a2","email":"admin2@test.fr"}'', false); set role authenticated;'
\set as_mgr1   'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000b1","email":"manager1@test.fr"}'', false); set role authenticated;'
\set as_emp1   'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000e1","email":"emp1@test.fr"}'', false); set role authenticated;'
\set as_emp2   'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000e2","email":"emp2@test.fr"}'', false); set role authenticated;'
\set as_emp3   'reset role; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000e3","email":"emp3@test.fr"}'', false); set role authenticated;'
\set as_anon   'reset role; select set_config(''request.jwt.claims'', '''', false); set role anon;'
\set as_pg     'reset role; select set_config(''request.jwt.claims'', '''', false);'
\o /dev/null

-- ===================== 1. Anonyme =====================
:as_anon
select t.throws('select * from public.tasks', 'anonyme : aucun accès aux tâches');
select t.throws('select * from public.companies', 'anonyme : aucun accès aux sociétés');
select t.throws('select public.accept_my_invitations()', 'anonyme : aucune fonction appelable');
select t.throws('select public.set_user_active(''00000000-0000-0000-0000-0000000000e1'', false)', 'anonyme : ne désactive personne');

-- ===================== 2. Super-administrateur =====================
:as_super
select t.ok((select count(*) from companies) = 3, 'super-admin voit les 3 sociétés');
select t.ok((select count(*) from tasks) = 5, 'super-admin voit toutes les tâches, y compris privées');
select t.ok((select count(*) from profiles) = 7, 'super-admin voit tous les collaborateurs');
insert into companies (name, slug) values ('Société test', 'societe-test');
select t.ok((select count(*) from companies) = 4, 'super-admin crée une société');
delete from companies where slug = 'societe-test';

-- ===================== 3. Admin Société 1 : isolation =====================
:as_admin1
select t.ok((select count(*) from companies) = 1, 'admin S1 ne voit que sa société');
select t.ok((select count(*) from tasks where company_id = 'c0000000-0000-0000-0000-000000000002') = 0, 'admin S1 ne voit aucune tâche de S2');
select t.ok((select count(*) from projects where company_id = 'c0000000-0000-0000-0000-000000000002') = 0, 'admin S1 ne voit aucun projet de S2');
select t.ok((select count(*) from profiles where id = '00000000-0000-0000-0000-0000000000e3') = 0, 'admin S1 ne voit pas les employés de S2 seulement');
select t.ok((select count(*) from tasks where company_id = 'c0000000-0000-0000-0000-000000000001') = 4, 'admin S1 voit toutes les tâches de S1');
select t.throws($$insert into tasks (company_id, title) values ('c0000000-0000-0000-0000-000000000002', 'intrusion')$$, 'admin S1 ne crée pas de tâche dans S2');
select t.ok(t.rows($$update tasks set title = 'piraté' where id = 'a0000000-0000-0000-0000-000000000004'$$) = 0, 'admin S1 ne modifie pas une tâche de S2');
select t.ok(t.rows($$delete from tasks where id = 'a0000000-0000-0000-0000-000000000004'$$) = 0, 'admin S1 ne supprime pas une tâche de S2');
select t.throws($$insert into company_memberships (company_id, user_id, role) values ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'admin')$$, 'admin S1 ne s''ajoute pas à S2');
select t.throws($$insert into tasks (company_id, title, assignee_id) values ('c0000000-0000-0000-0000-000000000001', 'x', '00000000-0000-0000-0000-0000000000e3')$$, 'admin S1 n''attribue pas une tâche à un employé de S2');
select t.ok(t.rows($$update companies set name = 'X' where id = 'c0000000-0000-0000-0000-000000000002'$$) = 0, 'admin S1 ne modifie pas les paramètres de S2');
select t.throws($$insert into companies (name, slug) values ('Pirate', 'pirate')$$, 'admin S1 ne crée pas de société');

-- ===================== 4. Élévation de privilèges =====================
select t.throws($$insert into platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a1')$$, 'admin S1 ne devient pas super-admin');
select t.throws($$select public.grant_super_admin('admin1@test.fr')$$, 'grant_super_admin non appelable via l''API');
select t.throws($$update company_memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000e2' and company_id = 'c0000000-0000-0000-0000-000000000001'$$, 'admin S1 ne nomme pas d''autre admin');
select t.throws($$update company_memberships set role = 'employee' where user_id = '00000000-0000-0000-0000-0000000000a1'$$, 'admin S1 ne modifie pas sa propre adhésion');
select t.throws($$update profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000e1'$$, 'admin S1 ne désactive pas un compte (réservé super-admin)');
select t.throws($$select public.set_user_active('00000000-0000-0000-0000-0000000000e1', false)$$, 'set_user_active réservé au super-admin');
select t.throws($$insert into invitations (company_id, email, role) values ('c0000000-0000-0000-0000-000000000001', 'boss@test.fr', 'admin')$$, 'admin S1 n''invite pas un admin');
update company_memberships set role = 'manager' where user_id = '00000000-0000-0000-0000-0000000000e2' and company_id = 'c0000000-0000-0000-0000-000000000001';
select t.ok((select role from company_memberships where user_id = '00000000-0000-0000-0000-0000000000e2' and company_id = 'c0000000-0000-0000-0000-000000000001') = 'manager', 'admin S1 change le rôle d''un employé en manager');
update company_memberships set role = 'employee' where user_id = '00000000-0000-0000-0000-0000000000e2' and company_id = 'c0000000-0000-0000-0000-000000000001';

:as_emp1
select t.ok(t.rows($$update company_memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000e1'$$) = 0, 'employé ne s''attribue pas le rôle admin');
select t.ok((select bool_and(role = 'employee') from company_memberships where user_id = auth.uid()), 'rôle de l''employé inchangé');
select t.ok(t.rows($$update company_memberships set role = 'manager' where user_id = '00000000-0000-0000-0000-0000000000e2'$$) = 0, 'employé ne change pas le rôle d''un collègue');
select t.throws($$update profiles set is_active = true where id = auth.uid()$$, 'employé ne modifie pas son statut actif');
select t.throws($$update profiles set email = 'x@y.fr' where id = auth.uid()$$, 'employé ne modifie pas son e-mail via l''API');
update profiles set job_title = 'Comptable' where id = auth.uid();
select t.ok((select job_title from profiles where id = auth.uid()) = 'Comptable', 'employé modifie son profil');

-- ===================== 5. Employé : visibilité des tâches =====================
select t.ok((select count(*) from companies) = 2, 'employé multi-sociétés voit ses 2 sociétés');
select t.ok(exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000001'), 'employé voit sa tâche');
select t.ok(not exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000002'), 'employé ne voit pas la tâche privée d''un collègue');
select t.ok(not exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000005'), 'employé ne voit pas la tâche hors projet d''un collègue');
select t.ok(exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000003'), 'employé membre voit les tâches du projet privé');
select t.ok(exists (select 1 from projects where id = '90000000-0000-0000-0000-000000000002'), 'employé membre voit le projet privé');
select t.ok(exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000004'), 'employé voit les tâches publiques de S2 (il est membre de S2)');
select t.throws($$insert into tasks (company_id, title) values ('c0000000-0000-0000-0000-000000000001', 'perso')$$, 'employé ne crée pas de tâche');
select t.throws($$update tasks set title = 'nouveau titre' where id = 'a0000000-0000-0000-0000-000000000001'$$, 'employé ne change pas le titre');
select t.throws($$update tasks set due_date = now() + interval '1 year' where id = 'a0000000-0000-0000-0000-000000000001'$$, 'employé ne change pas l''échéance');
select t.throws($$update tasks set assignee_id = '00000000-0000-0000-0000-0000000000e2' where id = 'a0000000-0000-0000-0000-000000000001'$$, 'employé ne réattribue pas');
select t.throws($$update tasks set status = 'blocked' where id = 'a0000000-0000-0000-0000-000000000001'$$, 'blocage sans explication refusé');
update tasks set status = 'blocked', blocked_reason = 'En attente du fournisseur' where id = 'a0000000-0000-0000-0000-000000000001';
select t.ok((select status from tasks where id = 'a0000000-0000-0000-0000-000000000001') = 'blocked', 'employé signale un blocage');
update tasks set status = 'in_progress' where id = 'a0000000-0000-0000-0000-000000000001';
select t.ok(t.rows($$update tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000003'$$) = 0, 'employé ne change pas le statut d''une tâche qui ne lui est pas attribuée');
select t.ok(t.rows($$delete from tasks where id = 'a0000000-0000-0000-0000-000000000001'$$) = 0, 'employé ne supprime pas de tâche');
insert into task_comments (task_id, body) values ('a0000000-0000-0000-0000-000000000001', 'Je m''en occupe');
select t.throws($$insert into task_comments (task_id, body) values ('a0000000-0000-0000-0000-000000000002', 'curieux')$$, 'employé ne commente pas une tâche invisible');
insert into task_comments (task_id, author_id, body) values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'usurpation');
select t.ok((select author_id from task_comments where body = 'usurpation') = auth.uid(), 'auteur du commentaire imposé par le serveur (pas d''usurpation)');

:as_emp2
select t.ok(exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000002'), 'E2 voit sa tâche privée');
select t.ok(not exists (select 1 from projects where id = '90000000-0000-0000-0000-000000000002'), 'non-membre ne voit pas le projet privé');
select t.ok(not exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000003'), 'non-membre ne voit pas les tâches du projet privé');
select t.ok((select count(*) from companies) = 1, 'E2 ne voit que S1');

:as_emp3
select t.ok((select count(*) from tasks where company_id = 'c0000000-0000-0000-0000-000000000001') = 0, 'employé S2 ne voit rien de S1');
select t.ok((select count(*) from company_memberships where company_id = 'c0000000-0000-0000-0000-000000000001') = 0, 'employé S2 ne voit pas les membres de S1');
select t.throws($$insert into task_comments (task_id, body) values ('a0000000-0000-0000-0000-000000000001', 'intrusion')$$, 'employé S2 ne commente pas une tâche de S1');

-- ===================== 6. Manager =====================
:as_mgr1
insert into tasks (company_id, project_id, title, assignee_id) values ('c0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Tâche équipe', '00000000-0000-0000-0000-0000000000e1');
select t.ok(exists (select 1 from tasks where title = 'Tâche équipe' and created_by = auth.uid()), 'manager crée une tâche pour son équipe (créateur forcé)');
select t.throws($$insert into tasks (company_id, title, assignee_id) values ('c0000000-0000-0000-0000-000000000001', 'hors équipe', '00000000-0000-0000-0000-0000000000e2')$$, 'manager n''attribue pas hors de son équipe');
insert into tasks (company_id, title, created_by) values ('c0000000-0000-0000-0000-000000000001', 'faux créateur', '00000000-0000-0000-0000-0000000000a1');
select t.ok((select created_by from tasks where title = 'faux créateur') = auth.uid(), 'créateur imposé par le serveur');
select t.ok(exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000001'), 'manager voit les tâches de son équipe');
select t.ok(not exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000002'), 'manager ne voit pas la tâche privée hors équipe');
update tasks set due_date = now() + interval '3 days' where id = 'a0000000-0000-0000-0000-000000000001';
select t.ok((select due_date is not null from tasks where id = 'a0000000-0000-0000-0000-000000000001'), 'manager modifie l''échéance d''une tâche de son équipe');
select t.ok(t.rows($$update tasks set priority = 'urgent' where id = 'a0000000-0000-0000-0000-000000000005'$$) = 0, 'manager ne modifie pas une tâche hors équipe');
select t.throws($$insert into projects (company_id, name) values ('c0000000-0000-0000-0000-000000000001', 'proj manager')$$, 'manager ne crée pas de projet');

-- ===================== 7. Notifications =====================
:as_emp1
select t.ok(exists (select 1 from notifications where type = 'task_assigned' and title = 'Nouvelle tâche attribuée'), 'employé notifié lors d''une attribution');
select t.ok(exists (select 1 from notifications where type = 'task_updated'), 'employé notifié d''une modification importante');
select t.throws($$insert into notifications (user_id, type, title) values (auth.uid(), 'mention', 'faux')$$, 'employé ne crée pas de notification');
select t.throws($$update notifications set title = 'modifié'$$, 'employé ne modifie que le statut lu');
update notifications set read_at = now();
select t.ok(not exists (select 1 from notifications where read_at is null), 'employé marque ses notifications comme lues');
:as_emp2
select t.ok(not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000e1'), 'E2 ne voit pas les notifications de E1');
:as_admin1
select t.ok(exists (select 1 from notifications where type = 'task_blocked'), 'admin notifié d''un blocage');
select t.ok(exists (select 1 from notifications where type = 'comment'), 'créateur notifié d''un commentaire');
insert into task_comments (task_id, body, mentions) values ('a0000000-0000-0000-0000-000000000001', '@Eva regarde', array['00000000-0000-0000-0000-0000000000e3'::uuid]);
:as_emp3
select t.ok(not exists (select 1 from notifications where type = 'mention'), 'pas de fuite par mention vers une autre société');

-- ===================== 8. Journal d'activité =====================
:as_super
select t.ok((select count(*) from activity_logs where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'task.status_changed') >= 2, 'changements de statut journalisés');
select t.ok(exists (select 1 from activity_logs where action = 'comment.added' and actor_id = '00000000-0000-0000-0000-0000000000e1'), 'commentaire journalisé avec son auteur');
select t.ok(exists (select 1 from activity_logs where action = 'task.due_date_changed'), 'changement d''échéance journalisé');
select t.throws($$delete from activity_logs$$, 'super-admin ne peut pas effacer le journal via l''API');
select t.throws($$insert into activity_logs (action, entity_type) values ('faux', 'task')$$, 'insertion manuelle dans le journal interdite');
:as_admin2
select t.ok(not exists (select 1 from activity_logs where company_id = 'c0000000-0000-0000-0000-000000000001'), 'admin S2 ne voit pas le journal de S1');
:as_pg
select t.throws($$update activity_logs set action = 'falsifié'$$, 'journal infalsifiable même pour le propriétaire de la base');

-- ===================== 9. Fichiers (Storage) =====================
:as_emp1
insert into storage.objects (bucket_id, name) values ('attachments', 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001/f1-devis.pdf');
insert into attachments (task_id, company_id, storage_path, file_name) values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001/f1-devis.pdf', 'devis.pdf');
select t.ok((select count(*) from storage.objects) = 1, 'employé joint un fichier à sa tâche');
select t.throws($$insert into storage.objects (bucket_id, name) values ('attachments', 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000002/x.pdf')$$, 'employé ne dépose pas sur une tâche invisible');
select t.throws($$insert into storage.objects (bucket_id, name) values ('attachments', 'c0000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000001/x.pdf')$$, 'chemin de société falsifié refusé');
:as_emp3
select t.ok((select count(*) from storage.objects) = 0, 'employé S2 ne lit pas les fichiers de S1');
select t.ok((select count(*) from attachments) = 0, 'employé S2 ne voit pas les pièces jointes de S1');

-- ===================== 10. Invitations =====================
:as_admin1
insert into invitations (company_id, email, role, team_id) values ('c0000000-0000-0000-0000-000000000001', 'Nouveau@Test.fr', 'employee', '70000000-0000-0000-0000-000000000001');
:as_admin2
select t.ok(not exists (select 1 from invitations), 'admin S2 ne voit pas les invitations de S1');
:as_pg
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000f1', 'nouveau@test.fr', null);
:as_emp1
select t.ok(public.accept_my_invitations() = 0, 'invitation d''un autre e-mail non acceptée');
reset role; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","email":"nouveau@test.fr"}', false); set role authenticated;
select t.ok(public.accept_my_invitations() = 0, 'e-mail non vérifié : invitation non acceptée');
:as_pg
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000f1';
reset role; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","email":"nouveau@test.fr"}', false); set role authenticated;
select t.ok(public.accept_my_invitations() = 1, 'invitation acceptée après vérification de l''e-mail');
select t.ok((select role from company_memberships where user_id = auth.uid()) = 'employee', 'rôle de l''invitation appliqué');
select t.ok(exists (select 1 from team_members where user_id = auth.uid()), 'ajouté à l''équipe de l''invitation');
select t.ok((select count(*) from companies) = 1, 'nouvel employé ne voit que sa société');

-- ===================== 11. Récurrence & traitements planifiés =====================
:as_admin1
insert into tasks (id, company_id, title, assignee_id, recurrence, due_date) values ('a0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'Rapport hebdo', '00000000-0000-0000-0000-0000000000e1', 'weekly', now() - interval '1 hour');
:as_emp1
select t.throws($$select public.run_scheduled_jobs()$$, 'traitements planifiés non appelables via l''API');
:as_pg
select public.run_scheduled_jobs();
:as_emp1
select t.ok(exists (select 1 from notifications where type = 'overdue' and task_id = 'a0000000-0000-0000-0000-000000000009'), 'notification de retard envoyée par le traitement planifié');
update tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000009';
select t.ok(exists (select 1 from tasks where recurrence_parent_id = 'a0000000-0000-0000-0000-000000000009' and status = 'todo' and due_date > now()), 'occurrence suivante créée pour une tâche récurrente');
:as_admin1
select t.ok(exists (select 1 from notifications where type = 'task_completed' and task_id = 'a0000000-0000-0000-0000-000000000009'), 'créateur notifié quand la tâche est terminée');

-- ===================== 12. Retrait immédiat des accès =====================
:as_super
select public.set_user_active('00000000-0000-0000-0000-0000000000e1', false);
:as_emp1
select t.ok((select count(*) from tasks) = 0, 'compte désactivé : plus aucune tâche visible');
select t.ok((select count(*) from companies) = 0, 'compte désactivé : plus aucune société visible');
select t.ok(t.rows($$update tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000001'$$) = 0, 'compte désactivé : aucune modification possible');
:as_admin1
select t.throws($$insert into tasks (company_id, title, assignee_id) values ('c0000000-0000-0000-0000-000000000001', 'x', '00000000-0000-0000-0000-0000000000e1')$$, 'impossible d''attribuer à un compte désactivé');
:as_super
select public.set_user_active('00000000-0000-0000-0000-0000000000e1', true);
:as_emp1
select t.ok((select count(*) from companies) = 2, 'compte réactivé : accès rétablis');

-- Désactivation dans une seule société
:as_admin1
update company_memberships set is_active = false where user_id = '00000000-0000-0000-0000-0000000000e1' and company_id = 'c0000000-0000-0000-0000-000000000001';
:as_emp1
select t.ok((select count(*) from companies) = 1, 'désactivé dans S1 : ne garde que S2');
select t.ok(not exists (select 1 from tasks where company_id = 'c0000000-0000-0000-0000-000000000001'), 'désactivé dans S1 : plus de tâches de S1');

-- ===================== 13. Suppression (admin) =====================
:as_admin1
delete from tasks where id = 'a0000000-0000-0000-0000-000000000005';
select t.ok(not exists (select 1 from tasks where id = 'a0000000-0000-0000-0000-000000000005'), 'admin supprime une tâche de sa société');
:as_super
select t.ok(exists (select 1 from activity_logs where action = 'task.deleted' and task_id = 'a0000000-0000-0000-0000-000000000005'), 'suppression conservée dans le journal');

\o
reset role;
\echo 'Tous les tests de sécurité sont passés.'
