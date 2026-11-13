import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Company, CompanyRole, Membership, Profile, Task } from '@/lib/types'

interface AuthState {
  session: Session | null
  loading: boolean
  profile: Profile | null
  isSuperAdmin: boolean
  memberships: (Membership & { company: Company })[]
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  /** Rôle dans une société (le super-admin est considéré comme admin partout). Affichage uniquement : la base vérifie tout. */
  roleIn: (companyId: string | null | undefined) => CompanyRole | null
  canAdmin: (companyId: string | null | undefined) => boolean
  canCreateTask: (companyId: string | null | undefined) => boolean
  canManageTask: (task: Pick<Task, 'company_id' | 'created_by' | 'assignee_id'>, managedIds?: Set<string>) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [memberships, setMemberships] = useState<(Membership & { company: Company })[]>([])

  const loadUser = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setIsSuperAdmin(false)
      setMemberships([])
      return
    }
    // Acceptation automatique des invitations en attente (e-mail vérifié requis côté serveur)
    await supabase.rpc('accept_my_invitations').then(() => undefined, () => undefined)
    const [p, a, m] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('platform_admins').select('user_id').eq('user_id', s.user.id).maybeSingle(),
      supabase.from('company_memberships').select('*, company:companies(*)').eq('user_id', s.user.id).eq('is_active', true),
    ])
    setProfile((p.data as Profile) ?? null)
    setIsSuperAdmin(Boolean(a.data) && Boolean((p.data as Profile | null)?.is_active))
    setMemberships(((m.data ?? []) as (Membership & { company: Company })[]).filter((x) => x.company))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadUser(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => {
          loadUser(s).then(() => qc.invalidateQueries())
        }, 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadUser, qc])

  const value = useMemo<AuthState>(() => {
    const roleIn = (cid: string | null | undefined): CompanyRole | null => {
      if (!cid) return null
      if (isSuperAdmin) return 'admin'
      return memberships.find((m) => m.company_id === cid)?.role ?? null
    }
    const uid = session?.user.id
    return {
      session,
      loading,
      profile,
      isSuperAdmin,
      memberships,
      refresh: () => loadUser(session),
      signOut: async () => {
        await supabase.auth.signOut()
        qc.clear()
      },
      roleIn,
      canAdmin: (cid) => roleIn(cid) === 'admin',
      canCreateTask: (cid) => {
        const r = roleIn(cid)
        return r === 'admin' || r === 'manager'
      },
      canManageTask: (t, managed) => {
        const r = roleIn(t.company_id)
        if (r === 'admin') return true
        if (r !== 'manager') return false
        return t.created_by === uid || t.assignee_id === uid || (!!t.assignee_id && !!managed?.has(t.assignee_id))
      },
    }
  }, [session, loading, profile, isSuperAdmin, memberships, loadUser, qc])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
