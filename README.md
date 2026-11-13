# Pilotage — gestion des tâches multi-sociétés

Application web privée pour piloter 3 sociétés (ou plus) : tâches, projets, équipes, collaborateurs,
tableaux de bord, notifications, avec des données **strictement séparées par société** et des
permissions **vérifiées par la base de données** (pas seulement masquées dans l'interface).

**Stack :** React 19 + TypeScript + Vite · Tailwind CSS 4 + composants style shadcn/ui (Radix) ·
Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions, pg_cron).

---

## Fonctionnalités (MVP)

| Domaine | Ce qui est livré |
|---|---|
| Authentification | Connexion par mot de passe ou lien e-mail, mot de passe oublié, inscription **uniquement sur invitation** |
| Sociétés | Création guidée des 3 sociétés, nom / logo / couleur personnalisables, dashboard par société |
| Rôles | Super-administrateur, administrateur de société, manager, employé — **définis par société** |
| Tâches | Titre, description, société, projet, créateur, responsable, collaborateurs, priorité, statut, dates, sous-tâches, checklist, commentaires avec @mentions, fichiers joints, historique, rappels, récurrence, tâches privées, archivage |
| Vues | Kanban (glisser-déposer), Liste (tri, filtres, modification rapide), Calendrier (jour / semaine / mois), Mes tâches, Aujourd'hui, Vue équipe, Toutes les tâches |
| Dashboards | Global (comparatif des sociétés, KPI, graphiques, charge par employé, échéances) et par société, filtres société / employé / équipe / projet / période |
| Notifications | Centre de notifications lu / non lu, temps réel, préférences, rappels automatiques (échéance proche, retard) même application fermée |
| Traçabilité | Journal horodaté **non modifiable** (même par le propriétaire de la base) |
| Divers | Recherche globale (Ctrl K), mode clair / sombre, responsive mobile, export CSV, interface 100 % française |

## Sécurité : comment elle est garantie

- **RLS activée sur toutes les tables** ; aucune donnée accessible sans être connecté.
- Les droits sont calculés par des fonctions SQL (`company_role`, `can_view_task`, `can_manage_task`…)
  à partir des tables d'adhésion : **le rôle envoyé par le navigateur n'est jamais utilisé**.
- Des triggers serveur imposent les règles fines : un employé ne peut changer que le statut de ses tâches,
  un manager n'attribue qu'aux personnes qu'il encadre, personne ne modifie ses propres droits,
  seul le super-administrateur nomme des administrateurs, le créateur / l'auteur sont imposés par le serveur.
- Le super-administrateur est stocké dans une table **sans aucune écriture possible via l'API** ;
  il se nomme uniquement depuis l'éditeur SQL de Supabase.
- **Retrait immédiat des accès** : désactiver un compte coupe instantanément toutes les lectures / écritures (RLS),
  et la fonction serveur bannit le compte Auth.
- Fichiers privés : chemin `société/tâche/fichier`, accès contrôlé par les mêmes règles que la tâche.
- La clé `service_role` n'est utilisée que dans les fonctions serveur (secrets Supabase) et le script de démo.
- **107 tests automatisés** d'accès croisés entre sociétés et entre utilisateurs : `npm run test:db`.

---

## Mise en route (≈ 20 minutes)

### 1. Créer le projet Supabase

1. <https://supabase.com/dashboard> → **New project** (région *Europe West (Paris)*), notez le mot de passe de la base.
2. **Authentication → Sign In / Providers** : désactivez **Allow new users to sign up** (application sur invitation).
3. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse de votre application (ex. `https://pilotage.vercel.app`, ou `http://localhost:5173` en local) ;
   - *Redirect URLs* : ajoutez `https://votre-domaine/definir-mot-de-passe` (et `http://localhost:5173/definir-mot-de-passe`).

### 2. Installer la base de données

Avec la CLI (recommandé) :

```bash
npm install
npx supabase login
npx supabase link --project-ref VOTRE_REF_PROJET      # visible dans l'URL du dashboard
npx supabase db push                                   # applique supabase/migrations/*
```

Sans la CLI : ouvrez **SQL Editor** et exécutez, **dans l'ordre**, le contenu des 4 fichiers de `supabase/migrations/`.

> Les rappels automatiques utilisent l'extension `pg_cron`, activée par la migration. Si un message indique
> qu'elle est indisponible, activez-la dans **Database → Extensions → pg_cron** puis réexécutez la 4ᵉ migration.

### 3. Déployer les fonctions serveur (invitations et retrait d'accès)

```bash
npx supabase secrets set APP_URL=https://votre-domaine
npx supabase functions deploy invite-user
npx supabase functions deploy set-user-access
```

### 4. Créer votre compte super-administrateur

1. **Authentication → Users → Add user → Create new user** : votre e-mail + un mot de passe, cochez *Auto Confirm User*.
2. **SQL Editor** :
   ```sql
   select public.grant_super_admin('votre@email.fr');
   ```

### 5. Lancer l'application

```bash
cp .env.example .env     # puis renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173
```

Les deux valeurs se trouvent dans **Project Settings → API** (utilisez la clé publique *anon* / *publishable*,
**jamais** la clé *service_role*). À la première connexion, l'assistant vous fait créer vos 3 sociétés,
puis inviter vos collaborateurs (**Collaborateurs → Inviter**).

### 6. Mettre en ligne

Vercel ou Netlify : importez le dépôt, commande `npm run build`, dossier `dist`, et ajoutez les variables
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Les redirections SPA sont déjà configurées (`vercel.json`, `public/_redirects`).
Pensez à mettre à jour *Site URL*, *Redirect URLs* et le secret `APP_URL`.

---

## Données de démonstration (séparées de la production)

Les données de démo vont dans **un second projet Supabase dédié**, jamais dans celui de production :

```bash
cp .env.demo.example .env.demo   # URL + clé service_role du projet DÉMO, URL de PROD pour garde-fou
npm run seed:demo
```

Le script refuse de s'exécuter si l'URL de démo est celle de production. Il crée 3 sociétés « (démo) »,
16 collaborateurs (dont un rattaché à deux sociétés), équipes, projets publics / privés et ~50 tâches.
Connexion : `dirigeant@demo.pilotage.test` / mot de passe défini dans `.env.demo`.

## Tests de sécurité

```bash
npm run test:db     # nécessite PostgreSQL 15+ installé localement (initdb, pg_ctl, psql)
```

Le script lance une base jetable, applique les migrations et vérifie notamment : isolation entre sociétés,
tâches privées, projets privés, élévation de privilèges, usurpation d'auteur, fichiers, invitations,
désactivation immédiate, journal infalsifiable, traitements planifiés.

## Sauvegarde et restauration

- Supabase effectue une sauvegarde quotidienne (plan Pro) ; l'option **PITR** permet une restauration à la minute.
- Sauvegarde manuelle : `SUPABASE_DB_URL="postgresql://…" npm run db:backup` (fichier dans `sauvegardes/`).
- Restauration : `pg_restore --clean --if-exists -d "$SUPABASE_DB_URL" sauvegardes/<fichier>.dump`.

## Structure

```
supabase/migrations/   schéma, sécurité (RLS + triggers), journal & notifications, storage / realtime / cron
supabase/functions/    invite-user, set-user-access (Edge Functions Deno)
supabase/tests/        tests de sécurité SQL
scripts/               test-db.sh, seed-demo.mjs, backup.sh
src/                   application React (pages/, components/, hooks/, lib/)
```

## Phase 2 (prévue)

Notifications par e-mail, statistiques détaillées et rapports PDF, automatisations, rappels personnalisables
par société, application mobile installable (PWA).
