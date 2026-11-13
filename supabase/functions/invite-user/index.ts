// Fonction serveur : invitation d'un collaborateur.
// 1. L'invitation est insérée AVEC LE JETON DE L'APPELANT : la base (RLS + triggers) vérifie
//    qu'il est administrateur de la société et qu'il ne crée pas d'administrateur sans être super-admin.
// 2. Seulement ensuite, la clé service (jamais exposée au navigateur) envoie l'e-mail d'invitation.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Non authentifié' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl = Deno.env.get('APP_URL')

  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: me, error: meErr } = await asUser.auth.getUser()
  if (meErr || !me.user) return json({ error: 'Session invalide' }, 401)

  let body: { company_id?: string; email?: string; role?: string; team_id?: string | null; job_title?: string | null; redirect_to?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requête invalide' }, 400)
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!body.company_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Société ou e-mail invalide' }, 400)
  if (!['admin', 'manager', 'employee'].includes(String(body.role))) return json({ error: 'Rôle invalide' }, 400)

  // Étape 1 : contrôle des droits par la base de données
  const { data: invitation, error: invErr } = await asUser
    .from('invitations')
    .insert({ company_id: body.company_id, email, role: body.role, team_id: body.team_id ?? null, job_title: body.job_title ?? null })
    .select('id')
    .single()
  if (invErr) return json({ error: invErr.message.includes('row-level security') ? 'Vous ne pouvez pas inviter dans cette société.' : invErr.message }, 403)

  // Étape 2 : envoi de l'e-mail (compte inexistant) — un compte existant reçoit une notification interne (trigger)
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (existing) return json({ id: invitation.id, message: 'Cette personne a déjà un compte : elle a été notifiée dans l’application.' })

  // Le lien de redirection doit pointer vers l'application (liste blanche Supabase « Redirect URLs »)
  const redirectTo = appUrl ? `${appUrl.replace(/\/$/, '')}/definir-mot-de-passe` : body.redirect_to
  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (mailErr) return json({ id: invitation.id, message: `Invitation enregistrée, mais l’e-mail n’a pas pu être envoyé : ${mailErr.message}` })
  return json({ id: invitation.id, message: 'Invitation envoyée par e-mail.' })
})
