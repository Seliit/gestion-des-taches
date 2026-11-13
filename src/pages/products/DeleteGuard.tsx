import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/**
 * Confirmation de suppression. En mode « strict » (colonne protégée), deux confirmations
 * successives sont exigées : un premier « Oui », puis la saisie du mot SUPPRIMER.
 */
export function DeleteGuard({
  open, onOpenChange, title, description, strict, strictReason, onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  strict?: boolean
  strictReason?: string
  onConfirm: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (open) {
      setStep(1)
      setTyped('')
    }
  }, [open])

  function confirm() {
    if (strict && step === 1) return setStep(2)
    onOpenChange(false)
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="theme-produits dark text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {strict && <ShieldAlert className="size-5 text-amber-400" />}
            {step === 1 ? title : 'Seconde confirmation'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? (strict ? strictReason ?? description : description) : 'Tapez SUPPRIMER pour confirmer définitivement.'}
          </DialogDescription>
        </DialogHeader>
        {step === 2 && <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SUPPRIMER" />}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            variant="destructive"
            disabled={step === 2 && typed.trim().toUpperCase() !== 'SUPPRIMER'}
            onClick={confirm}
          >
            {strict && step === 1 ? 'Oui, continuer' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
