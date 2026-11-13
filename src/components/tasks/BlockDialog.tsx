import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'

/** Demande l'explication obligatoire d'un blocage. */
export function BlockDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReason('') }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signaler un blocage</DialogTitle>
          <DialogDescription>Expliquez le problème rencontré. Votre responsable sera prévenu.</DialogDescription>
        </DialogHeader>
        <Textarea autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. En attente de la validation du client" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="destructive" disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); setReason('') }}>
            Signaler le blocage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
