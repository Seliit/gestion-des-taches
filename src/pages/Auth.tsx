import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, CheckSquare, Mail, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useCompanies } from '@/hooks/data'
import { slugify } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><CheckSquare className="size-5" /></span>
          <span className="text-lg font-semibold">Pilotage</span>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'password' | 'magic' | 'forgot'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  if (session) return <Navigate to="/" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } })
        if (error) throw error
        toast.success('Lien de connexion envoyé. Vérifiez votre boîte e-mail.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/definir-mot-de-passe` })
        if (error) throw error
        toast.success('E-mail de réinitialisation envoyé.')
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{mode === 'forgot' ? 'Mot de passe oublié' : 'Connexion'}</CardTitle>
          <CardDescription>Accès réservé aux collaborateurs invités.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            {mode === 'password' && (
              <Field label="Mot de passe"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            )}
            <Button type="submit" disabled={loading}>
              {loading && <Spinner className="text-primary-foreground" />}
              {mode === 'password' ? 'Se connecter' : mode === 'magic' ? 'Recevoir un lien de connexion' : 'Envoyer le lien'}
            </Button>
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              {mode !== 'password' && <button type="button" className="text-primary hover:underline" onClick={() => setMode('password')}>Connexion par mot de passe</button>}
              {mode !== 'magic' && <button type="button" className="text-primary hover:underline" onClick={() => setMode('magic')}><Mail className="mr-1 inline size-3" />Lien par e-mail</button>}
              {mode !== 'forgot' && <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode('forgot')}>Mot de passe oublié ?</button>}
            </div>
          </form>
        </CardContent>
      </Card>
    </Shell>
  )
}

/** Après un lien d'invitation ou de réinitialisation : définir son mot de passe et son nom. */
export function SetPassword() {
  const { session, profile, refresh } = useAuth()
  const navigate = useNavigate()
  const [f, setF] = useState({ first_name: '', last_name: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  if (!session)
    return (
      <Shell>
        <Card><CardContent className="pt-5 text-sm">Lien invalide ou expiré. Demandez une nouvelle invitation ou utilisez « Mot de passe oublié ».<div className="mt-3"><Button variant="outline" onClick={() => navigate('/connexion')}>Connexion</Button></div></CardContent></Card>
      </Shell>
    )
  const needName = !profile?.first_name
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (f.password.length < 10) return toast.error('10 caractères minimum.')
    if (f.password !== f.confirm) return toast.error('Les mots de passe ne correspondent pas.')
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: f.password })
      if (error) throw error
      if (needName) {
        const { error: e2 } = await supabase.from('profiles').update({ first_name: f.first_name, last_name: f.last_name }).eq('id', session!.user.id)
        if (e2) throw e2
      }
      await supabase.rpc('accept_my_invitations')
      await refresh()
      toast.success('Bienvenue !')
      navigate('/')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  return (
    <Shell>
      <Card>
        <CardHeader><CardTitle className="text-lg">Définir mon mot de passe</CardTitle><CardDescription>{session.user.email}</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            {needName && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom"><Input required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
                <Field label="Nom"><Input required value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
              </div>
            )}
            <Field label="Mot de passe" hint="10 caractères minimum"><Input type="password" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label="Confirmer"><Input type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
            <Button type="submit" disabled={loading}>{loading && <Spinner className="text-primary-foreground" />} Valider</Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  )
}

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9']

/** Parcours de configuration initiale (super-administrateur). */
export function Setup() {
  const { isSuperAdmin } = useAuth()
  const companies = useCompanies()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [rows, setRows] = useState([
    { name: 'Société 1', color: DEFAULT_COLORS[0] },
    { name: 'Société 2', color: DEFAULT_COLORS[1] },
    { name: 'Société 3', color: DEFAULT_COLORS[2] },
  ])
  const [loading, setLoading] = useState(false)
  if (!isSuperAdmin) return <Navigate to="/" replace />
  if (companies.data?.length) return <Navigate to="/" replace />

  async function create() {
    setLoading(true)
    const payload = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), color: r.color, slug: `${slugify(r.name)}-${Math.random().toString(36).slice(2, 6)}` }))
    const { error } = await supabase.from('companies').insert(payload)
    setLoading(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Sociétés créées. Invitez maintenant vos collaborateurs.')
    await qc.invalidateQueries({ queryKey: ['companies'] })
    navigate('/collaborateurs')
  }

  return (
    <div className="mx-auto max-w-xl py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Building2 className="size-5" /> Configurer vos sociétés</CardTitle>
          <CardDescription>Étape 1 sur 2 : nommez vos sociétés et choisissez leur couleur. Le logo s’ajoute ensuite dans Paramètres › Sociétés. Étape 2 : inviter vos collaborateurs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="color" className="w-12 p-1" value={r.color} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
              <Input value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              {rows.length > 1 && <Button size="icon" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 /></Button>}
            </div>
          ))}
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setRows([...rows, { name: `Société ${rows.length + 1}`, color: DEFAULT_COLORS[rows.length % 5] }])}>
            <Plus /> Ajouter une société
          </Button>
          <Button onClick={create} disabled={loading}>{loading && <Spinner className="text-primary-foreground" />} Créer les sociétés</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function NotConfigured() {
  return (
    <Shell>
      <Card>
        <CardHeader><CardTitle>Configuration requise</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> ne sont pas définies.</p>
          <p className="text-muted-foreground">Copiez <code>.env.example</code> en <code>.env</code> et renseignez les valeurs de votre projet Supabase (voir le guide d’installation).</p>
        </CardContent>
      </Card>
    </Shell>
  )
}
