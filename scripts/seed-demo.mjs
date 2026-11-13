#!/usr/bin/env node
/**
 * Données de démonstration pour les 3 sociétés.
 *
 * À exécuter UNIQUEMENT sur un projet Supabase de démonstration, distinct de la production :
 *   cp .env.demo.example .env.demo   # puis renseigner les valeurs
 *   npm run seed:demo
 *
 * Le script refuse de tourner si l'URL de démo est celle de production, et marque
 * chaque société « (démo) » pour qu'aucune confusion ne soit possible.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envFile = new URL('../.env.demo', import.meta.url)
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const url = process.env.DEMO_SUPABASE_URL
const key = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY
const prod = process.env.PROD_SUPABASE_URL
const password = process.env.DEMO_PASSWORD || 'Demo-Pilotage-2026!'
if (!url || !key) {
  console.error('DEMO_SUPABASE_URL et DEMO_SUPABASE_SERVICE_ROLE_KEY sont requis (fichier .env.demo).')
  process.exit(1)
}
if (prod && prod.replace(/\/$/, '') === url.replace(/\/$/, '')) {
  console.error('Refus : l’URL de démonstration est celle de la PRODUCTION. Utilisez un projet Supabase séparé.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const must = (r, what) => {
  if (r.error) throw new Error(`${what} : ${r.error.message}`)
  return r.data
}

const { data: existing } = await db.from('companies').select('id').like('name', '%(démo)%')
if (existing?.length) {
  console.log('Des données de démo existent déjà. Rien n’a été modifié.')
  process.exit(0)
}

async function user(email, first_name, last_name, job_title) {
  const list = must(await db.auth.admin.listUsers({ perPage: 1000 }), 'listUsers')
  let u = list.users.find((x) => x.email === email)
  if (!u) u = must(await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name, last_name } }), `createUser ${email}`).user
  must(await db.from('profiles').update({ first_name, last_name, job_title }).eq('id', u.id), 'profil')
  return u.id
}

const day = 86400000
const at = (d, h = 17) => { const x = new Date(Date.now() + d * day); x.setHours(h, 0, 0, 0); return x.toISOString() }

console.log('Création du dirigeant (super-administrateur)…')
const boss = await user('dirigeant@demo.pilotage.test', 'Dirigeant', 'Démo', 'Président')
must(await db.rpc('grant_super_admin', { p_email: 'dirigeant@demo.pilotage.test' }), 'super-admin')

const companies = [
  { name: 'Société 1 (démo)', color: '#6366f1', domain: 's1', theme: ['Refonte du site web', 'Salon professionnel', 'Process qualité'] },
  { name: 'Société 2 (démo)', color: '#10b981', domain: 's2', theme: ['Ouverture agence Lyon', 'Migration ERP', 'Recrutement commercial'] },
  { name: 'Société 3 (démo)', color: '#f59e0b', domain: 's3', theme: ['Lancement produit', 'Audit financier', 'Formation sécurité'] },
]
const people = [
  ['Claire', 'Martin', 'Directrice des opérations', 'admin'],
  ['Hugo', 'Bernard', 'Chef de projet', 'manager'],
  ['Léa', 'Petit', 'Chargée de communication', 'employee'],
  ['Nathan', 'Robert', 'Développeur', 'employee'],
  ['Inès', 'Richard', 'Assistante commerciale', 'employee'],
]
const firsts = { s1: ['Claire', 'Hugo', 'Léa', 'Nathan', 'Inès'], s2: ['Sophie', 'Lucas', 'Emma', 'Thomas', 'Chloé'], s3: ['Julie', 'Antoine', 'Manon', 'Paul', 'Sarah'] }
const lasts = { s1: ['Martin', 'Bernard', 'Petit', 'Robert', 'Richard'], s2: ['Durand', 'Moreau', 'Simon', 'Laurent', 'Michel'], s3: ['Lefebvre', 'Garcia', 'David', 'Roux', 'Fournier'] }

const statuses = ['todo', 'todo', 'in_progress', 'in_progress', 'waiting', 'blocked', 'done', 'done']
const priorities = ['low', 'normal', 'normal', 'high', 'urgent']
const verbs = ['Préparer', 'Valider', 'Relancer', 'Rédiger', 'Analyser', 'Mettre à jour', 'Organiser', 'Planifier', 'Contrôler', 'Présenter']
const objects = ['le devis client', 'le planning', 'la présentation', 'le budget', 'les contrats', 'le rapport mensuel', 'la checklist', 'les fournisseurs', 'la réunion d’équipe', 'le cahier des charges']

let shared = null
for (const [ci, c] of companies.entries()) {
  console.log(`Création de ${c.name}…`)
  const company = must(await db.from('companies').insert({ name: c.name, color: c.color, slug: `demo-${c.domain}` }).select().single(), 'société')
  const ids = []
  for (let i = 0; i < 5; i++) {
    const [, , job, role] = people[i]
    const id = await user(`${firsts[c.domain][i].toLowerCase()}.${lasts[c.domain][i].toLowerCase()}@demo.pilotage.test`, firsts[c.domain][i], lasts[c.domain][i], job)
    must(await db.from('company_memberships').insert({ company_id: company.id, user_id: id, role, job_title: job }), 'adhésion')
    ids.push(id)
  }
  // Un employé partagé entre deux sociétés (droits définis séparément)
  if (ci === 0) shared = ids[3]
  if (ci === 1 && shared) {
    must(await db.from('company_memberships').insert({ company_id: company.id, user_id: shared, role: 'employee' }), 'adhésion multiple')
    ids.push(shared)
  }
  const [admin, manager, ...employees] = ids
  const team = must(await db.from('teams').insert({ company_id: company.id, name: 'Équipe opérationnelle', color: c.color, manager_id: manager }).select().single(), 'équipe')
  must(await db.from('team_members').insert(employees.map((u) => ({ team_id: team.id, company_id: company.id, user_id: u }))), 'membres équipe')

  const projects = []
  for (const [pi, name] of c.theme.entries()) {
    const p = must(await db.from('projects').insert({
      company_id: company.id, name, description: `Projet de démonstration : ${name.toLowerCase()}.`, owner_id: pi === 0 ? manager : admin,
      visibility: pi === 2 ? 'private' : 'public', status: pi === 2 ? 'planned' : 'active',
      start_date: at(-20 + pi * 5).slice(0, 10), end_date: at(30 + pi * 15).slice(0, 10), created_by: admin,
    }).select().single(), 'projet')
    if (pi === 2) must(await db.from('project_members').insert([{ project_id: p.id, user_id: employees[0] }, { project_id: p.id, user_id: manager }]), 'membres projet')
    projects.push(p)
  }

  for (let k = 0; k < 16; k++) {
    const status = statuses[(k + ci) % statuses.length]
    const due = k % 5 === 4 ? null : at(((k * 3 + ci * 2) % 24) - 6, 9 + (k % 9))
    const assignee = [...employees, manager][k % (employees.length + 1)]
    const t = must(await db.from('tasks').insert({
      company_id: company.id, project_id: k % 4 === 3 ? null : projects[k % 3].id,
      title: `${verbs[(k + ci) % verbs.length]} ${objects[(k * 7 + ci) % objects.length]}`,
      description: 'Tâche générée pour la démonstration. Les détails, sous-tâches et commentaires illustrent le fonctionnement.',
      created_by: k % 3 ? manager : admin, assignee_id: assignee, priority: priorities[(k + ci * 2) % priorities.length],
      status, blocked_reason: status === 'blocked' ? 'En attente d’une réponse du client' : null,
      is_private: k === 7, due_date: due, start_date: at(-10 + (k % 5)).slice(0, 10), recurrence: k === 11 ? 'weekly' : 'none', position: k,
    }).select().single(), 'tâche')
    if (k % 3 === 0) {
      must(await db.from('subtasks').insert([
        { task_id: t.id, title: 'Rassembler les éléments', is_done: true, position: 0 },
        { task_id: t.id, title: 'Faire relire', is_done: status === 'done', position: 1 },
        { task_id: t.id, title: 'Envoyer la version finale', is_done: status === 'done', position: 2 },
      ]), 'sous-tâches')
    }
    if (k % 4 === 1) must(await db.from('task_assignees').insert({ task_id: t.id, user_id: employees[(k + 1) % employees.length] === assignee ? manager : employees[(k + 1) % employees.length] }), 'collaborateur')
    if (k % 5 === 0) must(await db.from('task_comments').insert({ task_id: t.id, author_id: manager, body: 'Pouvez-vous me faire un point d’avancement d’ici vendredi ?' }), 'commentaire')
  }
}
console.log(`\nTerminé. Connexion : dirigeant@demo.pilotage.test / ${password}`)
console.log('Autres comptes : prenom.nom@demo.pilotage.test (même mot de passe), ex. claire.martin@demo.pilotage.test (admin Société 1).')
console.log(`Super-admin : ${boss}`)
