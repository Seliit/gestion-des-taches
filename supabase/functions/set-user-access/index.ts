// Fonction serveur : retrait ou rétablissement immédiat de tous les accès d'un utilisateur.
// - set_user_active (appelée avec le jeton de l'appelant) vérifie qu'il est super-administrateur
//   et coupe instantanément l'accès aux données (toutes les politiques RLS testent profiles.is_active).
// - Le compte Auth est ensuite banni : plus de connexion ni de renouvellement de session.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Non authentifié' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { user_id, active } = await req.json().catch(() => ({}))
  if (typeof user_id !== 'string' || typeof active !== 'boolean') return json({ error: 'Requête invalide' }, 400)

  const { error } = await asUser.rpc('set_user_active', { p_user: user_id, p_active: active })
  if (error) return json({ error: error.message }, 403)

  const { error: banErr } = await admin.auth.admin.updateUserById(user_id, { ban_duration: active ? 'none' : '876000h' })
  if (banErr) return json({ ok: true, warning: `Accès aux données coupé, mais bannissement Auth impossible : ${banErr.message}` })
  return json({ ok: true })
})
