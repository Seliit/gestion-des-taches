import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/context/auth'
import { errorMessage, supabase } from '@/lib/supabase'

export interface QuickList {
  id: string
  title: string
  assignee_id: string | null
  created_by: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}
export interface QuickListItem {
  id: string
  list_id: string
  section: string | null
  text: string
  done: boolean
  done_at: string | null
  position: number
  note: string | null
}

export function useQuickLists() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['quick_lists'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_lists')
        .select('*, quick_list_items(done)')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as (QuickList & { quick_list_items: { done: boolean }[] })[]
    },
  })
}

export function useQuickList(id?: string) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['quick_list', id],
    enabled: !!session && !!id,
    queryFn: async () => {
      const [l, it] = await Promise.all([
        supabase.from('quick_lists').select('*').eq('id', id!).maybeSingle(),
        supabase.from('quick_list_items').select('*').eq('list_id', id!).order('position').order('created_at'),
      ])
      if (l.error) throw l.error
      if (it.error) throw it.error
      return { list: l.data as QuickList | null, items: (it.data ?? []) as QuickListItem[] }
    },
  })
}

/** Cocher / décocher une ligne, avec retour immédiat à l'écran. */
export function useToggleItem(listId: string) {
  const qc = useQueryClient()
  const key = ['quick_list', listId]
  type Data = { list: QuickList | null; items: QuickListItem[] }
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('quick_list_items').update({ done }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Data>(key)
      qc.setQueryData<Data>(key, (old) => old && { ...old, items: old.items.map((i) => (i.id === id ? { ...i, done } : i)) })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(errorMessage(e))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['quick_lists'] })
    },
  })
}
