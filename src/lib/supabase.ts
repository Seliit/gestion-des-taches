import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// Seule la clé publique « anon » est utilisée côté navigateur.
// Toutes les autorisations sont vérifiées par PostgreSQL (RLS) et les fonctions serveur.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function errorMessage(e: unknown): string {
  if (!e) return 'Erreur inconnue'
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (msg.includes('row-level security')) return 'Action non autorisée pour votre rôle.'
  if (msg.includes('permission denied')) return 'Permission refusée.'
  if (msg.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (msg.includes('Email not confirmed')) return 'Adresse e-mail non confirmée. Vérifiez votre boîte de réception.'
  if (msg.includes('duplicate key')) return 'Cet élément existe déjà.'
  if (msg.includes('JSON object requested') || msg.includes('0 rows')) return 'Action non autorisée ou élément introuvable.'
  return msg
}
