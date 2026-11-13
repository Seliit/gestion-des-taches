import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, supabase } from '@/lib/supabase'
import type { ActivityLog, Company, Invitation, Membership, Notification, Profile, Project, Task, Team } from '@/lib/types'
import { useAuth } from '@/context/auth'

async function run<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export function useCompanies() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['companies'],
    enabled: !!session,
    queryFn: () => run<Company[]>(supabase.from('companies').select('*').order('created_at')),
  })
}

export function useProfiles() {
  const { session } = useAuth()
  const q = useQuery({
    queryKey: ['profiles'],
    enabled: !!session,
    queryFn: () => run<Profile[]>(supabase.from('profiles').select('*').order('first_name')),
  })
  const map = useMemo(() => new Map((q.data ?? []).map((p) => [p.id, p])), [q.data])
  return { ...q, map }
}

export function useMembers(companyId?: string | null) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['members', companyId ?? 'all'],
    enabled: !!session,
    queryFn: () => {
      let q = supabase.from('company_memberships').select('*, profile:profiles(*)').order('created_at')
      if (companyId) q = q.eq('company_id', companyId)
      return run<(Membership & { profile: Profile })[]>(q)
    },
  })
}

export function useTeams(companyId?: string | null) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['teams', companyId ?? 'all'],
    enabled: !!session,
    queryFn: () => {
      let q = supabase.from('teams').select('*, team_members(user_id)').order('name')
      if (companyId) q = q.eq('company_id', companyId)
      return run<Team[]>(q)
    },
  })
}

/** Identifiants des collaborateurs encadrés par l'utilisateur courant (managers). */
export function useManagedIds() {
  const { session } = useAuth()
  const teams = useTeams()
  return useMemo(() => {
    const s = new Set<string>()
    for (const t of teams.data ?? []) if (t.manager_id === session?.user.id) t.team_members?.forEach((m) => s.add(m.user_id))
    return s
  }, [teams.data, session])
}

export function useProjects(companyId?: string | null) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['projects', companyId ?? 'all'],
    enabled: !!session,
    queryFn: () => {
      let q = supabase.from('projects').select('*, project_members(user_id)').order('created_at', { ascending: false })
      if (companyId) q = q.eq('company_id', companyId)
      return run<Project[]>(q)
    },
  })
}

export const TASK_SELECT = '*, task_assignees(user_id), subtasks(id, is_done)'

export function useTasks(opts: { companyId?: string | null; includeArchived?: boolean } = {}) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['tasks', opts.companyId ?? 'all', !!opts.includeArchived],
    enabled: !!session,
    queryFn: () => {
      let q = supabase.from('tasks').select(TASK_SELECT).order('position').order('created_at', { ascending: false }).limit(5000)
      if (opts.companyId) q = q.eq('company_id', opts.companyId)
      if (!opts.includeArchived) q = q.is('archived_at', null)
      return run<Task[]>(q)
    },
  })
}

export function useNotifications() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['notifications'],
    enabled: !!session,
    queryFn: () =>
      run<Notification[]>(
        supabase.from('notifications').select('*').eq('user_id', session!.user.id).order('created_at', { ascending: false }).limit(200),
      ),
  })
}

export function useInvitations(companyId?: string | null) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['invitations', companyId ?? 'all'],
    enabled: !!session,
    queryFn: () => {
      let q = supabase.from('invitations').select('*').order('created_at', { ascending: false })
      if (companyId) q = q.eq('company_id', companyId)
      return run<Invitation[]>(q)
    },
  })
}

export function useActivity(filters: { companyId?: string | null; taskId?: string; limit?: number } = {}) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['activity', filters],
    enabled: !!session,
    queryFn: () => {
      let q = supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(filters.limit ?? 200)
      if (filters.companyId) q = q.eq('company_id', filters.companyId)
      if (filters.taskId) q = q.eq('task_id', filters.taskId)
      return run<ActivityLog[]>(q)
    },
  })
}

/** Mutation générique avec toast d'erreur et invalidation. */
export function useAction<V>(fn: (v: V) => PromiseLike<unknown>, opts: { invalidate?: string[][]; success?: string } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: V) => {
      const r = (await fn(v)) as { error?: unknown } | undefined
      if (r && typeof r === 'object' && 'error' in r && r.error) throw r.error
      return r
    },
    onSuccess: () => {
      for (const k of opts.invalidate ?? [['tasks']]) qc.invalidateQueries({ queryKey: k })
      if (opts.success) toast.success(opts.success)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useUpdateTask() {
  return useAction(
    ({ id, patch }: { id: string; patch: Partial<Task> }) => supabase.from('tasks').update(patch).eq('id', id).select('id').single(),
    { invalidate: [['tasks'], ['task'], ['activity']] },
  )
}
