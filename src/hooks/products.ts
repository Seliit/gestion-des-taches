import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/context/auth'
import { DEFAULT_PRODUCT_COLUMNS } from '@/lib/products'
import { errorMessage, supabase } from '@/lib/supabase'
import type { ProductCard, ProductColumn } from '@/lib/types'

async function run<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await q
  if (error) throw error
  return data as T
}

export function useProductColumns(companyId?: string | null) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['product_columns', companyId],
    enabled: !!session && !!companyId,
    queryFn: () =>
      run<ProductColumn[]>(
        supabase.from('product_columns').select('*').eq('company_id', companyId!).order('position').order('created_at'),
      ),
  })
}

export function useProductCards(companyId?: string | null) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['product_cards', companyId],
    enabled: !!session && !!companyId,
    queryFn: () => run<ProductCard[]>(supabase.from('product_cards').select('*').eq('company_id', companyId!).limit(5000)),
  })
}

/** Crée les colonnes de départ si la société n'en a encore aucune. */
export function useEnsureDefaultColumns(companyId: string | null | undefined, columns: ProductColumn[] | undefined) {
  const qc = useQueryClient()
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (!companyId || !columns || columns.length || done.current === companyId) return
    done.current = companyId
    supabase
      .from('product_columns')
      .insert(
        // Toutes les lignes avec les mêmes champs : sinon un champ absent est envoyé à null.
        DEFAULT_PRODUCT_COLUMNS.map((c, i) => ({
          company_id: companyId,
          name: c.name,
          position: (i + 1) * 1000,
          is_store: !!c.is_store,
          is_protected: !!c.is_protected,
        })),
      )
      .then(({ error }) => {
        if (error) toast.error(errorMessage(error))
        qc.invalidateQueries({ queryKey: ['product_columns', companyId] })
      })
  }, [companyId, columns, qc])
}

/** Mutation générique sur les tables du tableau, avec rafraîchissement. */
export function useProductMutation<V>(fn: (v: V) => PromiseLike<{ error: unknown }>, success?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: V) => {
      const { error } = await fn(v)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product_cards'] })
      qc.invalidateQueries({ queryKey: ['product_columns'] })
      if (success) toast.success(success)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

/** Modification d'une carte avec mise à jour immédiate à l'écran (glisser-déposer, cases à cocher). */
export function useUpdateProductCard(companyId?: string | null) {
  const qc = useQueryClient()
  const key = ['product_cards', companyId]
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProductCard> }) => {
      const { error } = await supabase.from('product_cards').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProductCard[]>(key)
      qc.setQueryData<ProductCard[]>(key, (old) => old?.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(errorMessage(e))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export type LookupResult = Partial<
  Pick<ProductCard, 'title' | 'image_url' | 'asin' | 'ean' | 'amazon_url' | 'sell_price' | 'monthly_sales' | 'bsr' | 'amazon_fees'>
>

/**
 * Recherche Amazon en lecture seule via la fonction serveur « product-lookup »
 * (clé API côté serveur uniquement). Renvoie null si l'API n'est pas branchée.
 */
export async function lookupProduct(q: { asin?: string; ean?: string }): Promise<LookupResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('product-lookup', { body: q })
    if (error || !data || (data as { error?: string }).error) return null
    return data as LookupResult
  } catch {
    return null
  }
}
