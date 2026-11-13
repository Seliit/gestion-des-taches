import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { useCompanies, useTeams } from '@/hooks/data'
import { roleLabel } from '@/lib/labels'
import { errorMessage, supabase } from '@/lib/supabase'
import type { CompanyRole } from '@/lib/types'

/**
 * Invitation d'un collaborateur : la fonction serveur « invite-user » enregistre l'invitation
 * (avec les droits de l'utilisateur connecté, donc contrôlée par RLS) puis envoie l'e-mail.
 */
export function InviteDialog({ open, onOpenChange, companyId }: { open: boolean; onOpenChange: (o: boolean) => void; companyId?: string }) {
  const qc = useQueryClient()
  const { canAdmin, isSuperAdmin } = useAuth()
  const companies = useCompanies()
  const adminCompanies = (companies.data ?? []).filter((c) => canAdmin(c.id))
  const [f, setF] = useState({ company_id: '', email: '', role: 'employee' as CompanyRole, team_id: '', job_title: '' })
  const teams = useTeams(f.company_id || null)
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (open) setF({ company_id: companyId || adminCompanies[0]?.id || '', email: '', role: 'employee', team_id: '', job_title: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function send() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return toast.error('Adresse e-mail invalide.')
    setSending(true)
    const body = { company_id: f.company_id, email: f.email.trim().toLowerCase(), role: f.role, team_id: f.team_id || null, job_title: f.job_title || null }
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', { body: { ...body, redirect_to: `${window.location.origin}/definir-mot-de-passe` } })
      if (error) {
        // Fonction non déployée : on enregistre au moins l'invitation (la personne pourra créer son compte avec cet e-mail).
        const ctx = (error as { context?: Response }).context
        const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
        if (detail?.error) throw new Error(detail.error)
        const { error: e2 } = await supabase.from('invitations').insert(body)
        if (e2) throw e2
        toast.warning('Invitation enregistrée, mais l’e-mail n’a pas pu être envoyé (fonction « invite-user » non déployée).')
      } else {
        toast.success(data?.message ?? 'Invitation envoyée')
      }
      qc.invalidateQueries({ queryKey: ['invitations'] })
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un collaborateur</DialogTitle>
          <DialogDescription>La personne recevra un e-mail pour créer son compte et rejoindre la société.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="E-mail professionnel"><Input autoFocus type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="prenom.nom@societe.fr" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Société">
              <NativeSelect value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value, team_id: '' })}>
                {adminCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Rôle">
              <NativeSelect value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as CompanyRole })}>
                <option value="employee">{roleLabel.employee}</option>
                <option value="manager">{roleLabel.manager}</option>
                {isSuperAdmin && <option value="admin">{roleLabel.admin}</option>}
              </NativeSelect>
            </Field>
            <Field label="Équipe">
              <NativeSelect value={f.team_id} onChange={(e) => setF({ ...f, team_id: e.target.value })}>
                <option value="">Aucune</option>
                {teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Fonction"><Input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} placeholder="Ex. Comptable" /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={send} disabled={sending || !f.company_id}>{sending && <Spinner className="text-primary-foreground" />} Envoyer l’invitation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
