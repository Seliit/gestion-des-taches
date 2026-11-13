import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Spinner } from '@/components/ui/misc'
import { useAuth } from '@/context/auth'
import { isConfigured } from '@/lib/supabase'
import Dashboard from '@/pages/Dashboard'
import CompanyPage from '@/pages/CompanyPage'
import TaskDetail from '@/pages/TaskDetail'
import Projects, { ProjectDetail } from '@/pages/Projects'
import Collaborators, { CollaboratorDetail } from '@/pages/Collaborators'
import Teams from '@/pages/Teams'
import Reports from '@/pages/Reports'
import ActivityPage from '@/pages/ActivityPage'
import MyList from '@/pages/MyList'
import { AllTasks, CalendarPage, InvitationsPage, MyTasks, NotificationsPage, TeamView, Today } from '@/pages/TaskPages'
import { CompaniesSettings, NotificationSettings, ProfileSettings, RolesSettings, SecuritySettings } from '@/pages/settings/Settings'
import { Login, NotConfigured, SetPassword, Setup } from '@/pages/Auth'

function Protected() {
  const { session, loading, profile } = useAuth()
  const location = useLocation()
  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  if (!session) return <Navigate to="/connexion" replace state={{ from: location }} />
  if (profile && !profile.is_active)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Votre compte a été désactivé. Contactez votre administrateur.
      </div>
    )
  return <AppLayout />
}

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route path="/definir-mot-de-passe" element={<SetPassword />} />
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        <Route path="ma-liste" element={<MyList />} />
        <Route path="configuration" element={<Setup />} />
        <Route path="aujourdhui" element={<Today />} />
        <Route path="taches" element={<AllTasks />} />
        <Route path="taches/:id" element={<TaskDetail />} />
        <Route path="mes-taches" element={<MyTasks />} />
        <Route path="equipe" element={<TeamView />} />
        <Route path="calendrier" element={<CalendarPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="invitations" element={<InvitationsPage />} />
        <Route path="societes/:id" element={<CompanyPage />} />
        <Route path="projets" element={<Projects />} />
        <Route path="projets/:id" element={<ProjectDetail />} />
        <Route path="collaborateurs" element={<Collaborators />} />
        <Route path="collaborateurs/:id" element={<CollaboratorDetail />} />
        <Route path="equipes" element={<Teams />} />
        <Route path="rapports" element={<Reports />} />
        <Route path="historique" element={<ActivityPage />} />
        <Route path="parametres/profil" element={<ProfileSettings />} />
        <Route path="parametres/societes" element={<CompaniesSettings />} />
        <Route path="parametres/roles" element={<RolesSettings />} />
        <Route path="parametres/notifications" element={<NotificationSettings />} />
        <Route path="parametres/securite" element={<SecuritySettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/**
 * Sur téléphone, quand l'app est ouverte depuis l'écran d'accueil, on arrive directement sur « Ma liste »
 * (une seule fois par ouverture : le tableau de bord reste accessible ensuite).
 */
function Home() {
  let redirect = false
  try {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone && window.innerWidth < 768 && !sessionStorage.getItem('pilotage-home-vu')) {
      sessionStorage.setItem('pilotage-home-vu', '1')
      redirect = true
    }
  } catch {
    /* stockage indisponible : on reste sur le tableau de bord */
  }
  return redirect ? <Navigate to="/ma-liste" replace /> : <Dashboard />
}
