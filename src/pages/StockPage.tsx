import { StockAPerte } from '@/components/dashboard/StockAPerte'
import { EmptyState } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'

export default function StockPage() {
  const { isSuperAdmin } = useAuth()
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      {isSuperAdmin ? <StockAPerte /> : <EmptyState title="Réservé aux dirigeants" description="Cette page n’est visible que par Pierre et Raph." />}
    </div>
  )
}
