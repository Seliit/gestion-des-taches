import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Check, Minus, Plus, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Avatar, Spinner, Switch } from '@/components/ui/misc'
import { CompanyLogo } from '@/components/tasks/badges'
import { useAuth } from '@/context/auth'
import { useTheme } from '@/context/theme'
import { useCompanies, useMembers } from '@/hooks/data'
import { fullName, notificationTypeLabel, roleLabel, slugify } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { Company, CompanyRole, NotificationType } from '@/lib/types'

async function uploadBranding(path: string, file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Image trop lourde (5 Mo max).')
  const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return `${supabase.storage.from('branding').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

export function ProfileSettings() {
  const { profile, refresh, session } = useAuth()
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()
  const [f, setF] = useState({ first_name: '', last_name: '', job_title: '', phone: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (profile) setF({ first_name: profile.first_name, last_name: profile.last_name, job_title: profile.job_title ?? '', phone: profile.phone ?? '' })
  }, [profile])
  async function save() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update(f).eq('id', session!.user.id)
    setSaving(false)
    if (error) return toast.error(errorMessage(error))
    toast.success('Profil enregistré')
    await refresh()
    qc.invalidateQueries({ queryKey: ['profiles'] })
  }
  async function avatar(file?: File) {
    if (!file) return
    try {
      const url = await uploadBranding(`avatars/${session!.user.id}/avatar`, file)
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', session!.user.id)
      if (error) throw error
      await refresh()
      qc.invalidateQueries({ queryKey: ['profiles'] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <PageHeader title="Mon profil" />
      <Card>
        <CardContent className="grid gap-4 pt-4">
          <div className="flex items-center gap-4">
            <Avatar name={fullName(profile)} url={profile?.avatar_url} size={64} />
            <label className="cursor-pointer">
              <span className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs hover:bg-accent"><Upload className="size-3.5" /> Changer la photo</span>
              <input type="file" accept="image/*" hidden onChange={(e) => avatar(e.target.files?.[0])} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prénom"><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
            <Field label="Nom"><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
            <Field label="Fonction"><Input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field>
            <Field label="Téléphone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </div>
          <Field label="E-mail" hint="L’adresse e-mail se modifie dans Sécurité."><Input value={profile?.email ?? ''} disabled /></Field>
          <Field label="Thème">
            <NativeSelect value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}>
              <option value="system">Système</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </NativeSelect>
          </Field>
          <Button onClick={save} disabled={saving} className="justify-self-start">{saving && <Spinner className="text-primary-foreground" />} Enregistrer</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function CompanyEditor({ company }: { company: Company }) {
  const qc = useQueryClient()
  const { isSuperAdmin } = useAuth()
  const [f, setF] = useState({ name: company.name, color: company.color })
  useEffect(() => setF({ name: company.name, color: company.color }), [company])
  async function save(patch: Partial<Company>) {
    const { error } = await supabase.from('companies').update(patch).eq('id', company.id).select('id').single()
    if (error) return toast.error(errorMessage(error))
    toast.success('Société mise à jour')
    qc.invalidateQueries({ queryKey: ['companies'] })
  }
  async function logo(file?: File) {
    if (!file) return
    try {
      await save({ logo_url: await uploadBranding(`companies/${company.id}/logo`, file) })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  async function remove() {
    const typed = window.prompt(`Supprimer « ${company.name} » efface définitivement ses projets, tâches et fichiers.\nTapez le nom de la société pour confirmer :`)
    if (typed !== company.name) return
    const { error } = await supabase.from('companies').delete().eq('id', company.id)
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries()
  }
  return (
    <Card id={company.id}>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
        <label className="cursor-pointer" title="Changer le logo">
          <CompanyLogo company={{ ...company, color: f.color }} size={44} />
          <input type="file" accept="image/*" hidden onChange={(e) => logo(e.target.files?.[0])} />
        </label>
        <Field label="Nom"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Couleur"><Input type="color" className="w-16 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => save(f)} disabled={f.name === company.name && f.color === company.color}>Enregistrer</Button>
          {company.logo_url && <Button size="sm" variant="outline" onClick={() => save({ logo_url: null })}>Retirer le logo</Button>}
          {isSuperAdmin && <Button size="icon-sm" variant="ghost" className="text-red-600" onClick={remove} title="Supprimer"><Trash2 /></Button>}
        </div>
      </CardContent>
    </Card>
  )
}

export function CompaniesSettings() {
  const { isSuperAdmin, canAdmin } = useAuth()
  const companies = useCompanies()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  useEffect(() => {
    const id = params.get('id')
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 200)
  }, [params])
  async function create() {
    if (!name.trim()) return
    const { error } = await supabase.from('companies').insert({ name: name.trim(), slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}` })
    if (error) return toast.error(errorMessage(error))
    setName('')
    qc.invalidateQueries({ queryKey: ['companies'] })
  }
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader title="Sociétés" description="Nom, logo et couleur de chaque société" />
      {(companies.data ?? []).filter((c) => canAdmin(c.id)).map((c) => <CompanyEditor key={c.id} company={c} />)}
      {isSuperAdmin && (
        <Card>
          <CardHeader><CardTitle>Ajouter une société</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la société" />
            <Button onClick={create}><Plus /> Créer</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const MATRIX: { label: string; roles: CompanyRole[] }[] = [
  { label: 'Voir les tâches qui lui sont attribuées', roles: ['admin', 'manager', 'employee'] },
  { label: 'Voir les projets publics de la société', roles: ['admin', 'manager', 'employee'] },
  { label: 'Changer le statut de ses tâches, signaler un blocage', roles: ['admin', 'manager', 'employee'] },
  { label: 'Commenter, joindre des fichiers, cocher ses sous-tâches', roles: ['admin', 'manager', 'employee'] },
  { label: 'Créer des tâches et les attribuer à son équipe', roles: ['admin', 'manager'] },
  { label: 'Modifier priorités et échéances des tâches de son équipe', roles: ['admin', 'manager'] },
  { label: 'Voir toutes les tâches de la société (y compris privées)', roles: ['admin'] },
  { label: 'Créer des projets et des équipes', roles: ['admin'] },
  { label: 'Inviter des collaborateurs, gérer les rôles manager/employé', roles: ['admin'] },
  { label: 'Supprimer des tâches, modifier les paramètres de la société', roles: ['admin'] },
]

export function RolesSettings() {
  const { canAdmin, isSuperAdmin, session } = useAuth()
  const companies = useCompanies()
  const adminCompanies = (companies.data ?? []).filter((c) => canAdmin(c.id))
  const [companyId, setCompanyId] = useState('')
  const cid = companyId || adminCompanies[0]?.id
  const members = useMembers(cid)
  const qc = useQueryClient()
  async function setRole(id: string, role: CompanyRole) {
    const { error } = await supabase.from('company_memberships').update({ role }).eq('id', id).select('id').single()
    if (error) return toast.error(errorMessage(error))
    toast.success('Rôle mis à jour')
    qc.invalidateQueries({ queryKey: ['members'] })
  }
  async function setActive(id: string, is_active: boolean) {
    const { error } = await supabase.from('company_memberships').update({ is_active }).eq('id', id).select('id').single()
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['members'] })
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <PageHeader title="Rôles et permissions" description="Les droits sont définis individuellement pour chaque société et vérifiés par le serveur." />
      <Card>
        <CardHeader><CardTitle>Ce que permet chaque rôle</CardTitle><CardDescription>Le super-administrateur a tous les droits sur toutes les sociétés.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="py-2 text-left font-medium">Permission</th>{(['admin', 'manager', 'employee'] as CompanyRole[]).map((r) => <th key={r} className="py-2 text-center font-medium">{roleLabel[r]}</th>)}</tr></thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-2">{row.label}</td>
                  {(['admin', 'manager', 'employee'] as CompanyRole[]).map((r) => (
                    <td key={r} className="py-2 text-center">{row.roles.includes(r) ? <Check className="inline size-4 text-emerald-500" /> : <Minus className="inline size-4 text-muted-foreground/50" />}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Droits par collaborateur</CardTitle>
          {adminCompanies.length > 1 && (
            <NativeSelect className="w-auto" value={cid} onChange={(e) => setCompanyId(e.target.value)}>
              {adminCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          )}
        </CardHeader>
        <CardContent className="grid gap-1">
          {members.data?.map((m) => {
            const editable = m.user_id !== session?.user.id && (isSuperAdmin || m.role !== 'admin')
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md px-1 py-1.5">
                <Link to={`/collaborateurs/${m.user_id}`} className="flex items-center gap-2 text-sm hover:underline">
                  <Avatar name={fullName(m.profile)} url={m.profile?.avatar_url} size={26} /> {fullName(m.profile)}
                </Link>
                <div className="flex items-center gap-3">
                  <NativeSelect className="h-8 w-40 text-xs" value={m.role} disabled={!editable} onChange={(e) => setRole(m.id, e.target.value as CompanyRole)}>
                    <option value="employee">{roleLabel.employee}</option>
                    <option value="manager">{roleLabel.manager}</option>
                    {(isSuperAdmin || m.role === 'admin') && <option value="admin">{roleLabel.admin}</option>}
                  </NativeSelect>
                  <Switch checked={m.is_active} disabled={!editable} onCheckedChange={(v) => setActive(m.id, v)} title={m.is_active ? 'Actif' : 'Désactivé'} />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

export function NotificationSettings() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const prefs = useQuery({
    queryKey: ['notification_preferences'],
    queryFn: async () => {
      const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', session!.user.id)
      return new Map((data ?? []).map((p: { type: NotificationType; in_app: boolean }) => [p.type, p.in_app]))
    },
  })
  async function toggle(type: NotificationType, in_app: boolean) {
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: session!.user.id, type, in_app })
    if (error) return toast.error(errorMessage(error))
    qc.invalidateQueries({ queryKey: ['notification_preferences'] })
  }
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <PageHeader title="Préférences de notification" description="Choisissez les événements pour lesquels vous êtes notifié dans l’application." />
      <Card>
        <CardContent className="grid gap-1 pt-4">
          {(Object.keys(notificationTypeLabel) as NotificationType[]).map((t) => (
            <label key={t} className="flex items-center justify-between gap-3 rounded-md px-1 py-2 text-sm">
              {notificationTypeLabel[t]}
              <Switch checked={prefs.data?.get(t) ?? true} onCheckedChange={(v) => toggle(t, v)} />
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export function SecuritySettings() {
  const { session, isSuperAdmin } = useAuth()
  const [pwd, setPwd] = useState({ a: '', b: '' })
  const [email, setEmail] = useState('')
  async function changePassword() {
    if (pwd.a.length < 10) return toast.error('10 caractères minimum.')
    if (pwd.a !== pwd.b) return toast.error('Les mots de passe ne correspondent pas.')
    const { error } = await supabase.auth.updateUser({ password: pwd.a })
    if (error) return toast.error(errorMessage(error))
    setPwd({ a: '', b: '' })
    toast.success('Mot de passe modifié')
  }
  async function changeEmail() {
    const { error } = await supabase.auth.updateUser({ email })
    if (error) return toast.error(errorMessage(error))
    toast.success('Un e-mail de confirmation a été envoyé aux deux adresses.')
  }
  async function signOutOthers() {
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) return toast.error(errorMessage(error))
    toast.success('Les autres sessions ont été déconnectées')
  }
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <PageHeader title="Sécurité" />
      <Card>
        <CardHeader><CardTitle>Mot de passe</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Field label="Nouveau mot de passe"><Input type="password" autoComplete="new-password" value={pwd.a} onChange={(e) => setPwd({ ...pwd, a: e.target.value })} /></Field>
          <Field label="Confirmer"><Input type="password" autoComplete="new-password" value={pwd.b} onChange={(e) => setPwd({ ...pwd, b: e.target.value })} /></Field>
          <Button className="justify-self-start" onClick={changePassword}>Modifier le mot de passe</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Adresse e-mail</CardTitle><CardDescription>Actuelle : {session?.user.email}</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Nouvelle adresse" />
          <Button variant="outline" onClick={changeEmail} disabled={!email}>Modifier</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent><Button variant="outline" onClick={signOutOthers}>Déconnecter mes autres appareils</Button></CardContent>
      </Card>
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> Sauvegarde et restauration</CardTitle>
            <CardDescription>
              Supabase sauvegarde la base chaque jour (restauration à la minute près avec l’option PITR). Une sauvegarde manuelle est possible avec
              <code className="mx-1 rounded bg-muted px-1">npm run db:backup</code> (voir le guide dans le dépôt).
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
