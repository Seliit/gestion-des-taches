import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bell, Building2, CalendarDays, CheckSquare, ClipboardList, FolderKanban, History, LayoutDashboard, LogOut, Menu, Monitor, Moon,
  Search, Settings, Shield, Sun, Sunrise, User, Users, UsersRound, BarChart3, BellRing, Lock, UserCheck, ListTodo,
} from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CompanyLogo } from '@/components/tasks/badges'
import { GlobalSearch } from './GlobalSearch'
import { useAuth } from '@/context/auth'
import { useTheme } from '@/context/theme'
import { useCompanies, useNotifications, useTeams } from '@/hooks/data'
import { fullName } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function NavItem({ to, icon: Icon, label, badge, end, onClick }: { to: string; icon: typeof Bell; label: string; badge?: number; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          isActive && 'bg-accent font-medium text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {!!badge && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</p>
      {children}
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { isSuperAdmin, memberships, session } = useAuth()
  const companies = useCompanies()
  const notifications = useNotifications()
  const teams = useTeams()
  const unread = notifications.data?.filter((n) => !n.read_at).length ?? 0
  const isAdminSomewhere = isSuperAdmin || memberships.some((m) => m.role === 'admin')
  const isManagerSomewhere = isAdminSomewhere || memberships.some((m) => m.role === 'manager') || (teams.data ?? []).some((t) => t.manager_id === session?.user.id)
  const p = { onClick: onNavigate }

  return (
    <nav className="flex flex-col px-2 pb-6">
      <Section title={isSuperAdmin ? 'Espace global' : 'Mon espace'}>
        <NavItem to="/" end icon={LayoutDashboard} label="Vue d’ensemble" {...p} />
        <NavItem to="/ma-liste" icon={ListTodo} label="Ma liste" {...p} />
        <NavItem to="/aujourdhui" icon={Sunrise} label="Aujourd’hui" {...p} />
        <NavItem to="/mes-taches" icon={CheckSquare} label="Mes tâches" {...p} />
        <NavItem to="/taches" icon={ClipboardList} label={isSuperAdmin ? 'Toutes les tâches' : 'Tâches'} {...p} />
        {isManagerSomewhere && <NavItem to="/equipe" icon={UserCheck} label="Vue équipe" {...p} />}
        <NavItem to="/calendrier" icon={CalendarDays} label="Calendrier" {...p} />
        <NavItem to="/notifications" icon={Bell} label="Notifications" badge={unread} {...p} />
      </Section>

      <Section title="Mes sociétés">
        {companies.data?.map((c) => (
          <NavLink
            key={c.id}
            to={`/societes/${c.id}`}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                isActive && 'bg-accent font-medium text-foreground',
              )
            }
          >
            <CompanyLogo company={c} size={18} />
            <span className="truncate">{c.name}</span>
          </NavLink>
        ))}
        {!companies.data?.length && <p className="px-2.5 text-xs text-muted-foreground">Aucune société</p>}
      </Section>

      <Section title="Gestion">
        <NavItem to="/projets" icon={FolderKanban} label="Projets" {...p} />
        <NavItem to="/collaborateurs" icon={Users} label="Collaborateurs" {...p} />
        <NavItem to="/equipes" icon={UsersRound} label="Équipes" {...p} />
        {isManagerSomewhere && <NavItem to="/rapports" icon={BarChart3} label="Rapports" {...p} />}
        <NavItem to="/historique" icon={History} label="Historique" {...p} />
      </Section>

      <Section title="Paramètres">
        <NavItem to="/parametres/profil" icon={User} label="Mon profil" {...p} />
        {isAdminSomewhere && <NavItem to="/parametres/societes" icon={Building2} label="Sociétés" {...p} />}
        {isAdminSomewhere && <NavItem to="/parametres/roles" icon={Shield} label="Rôles et permissions" {...p} />}
        <NavItem to="/parametres/notifications" icon={BellRing} label="Notifications" {...p} />
        <NavItem to="/parametres/securite" icon={Lock} label="Sécurité" {...p} />
      </Section>
    </nav>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-4 py-4">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <CheckSquare className="size-4" />
      </span>
      <span className="font-semibold tracking-tight">Pilotage</span>
    </Link>
  )
}

/** Abonnements temps réel : tâches, commentaires et notifications (filtrés par RLS côté serveur). */
function useRealtime() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    const ch = supabase
      .channel(`app-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['task'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
        qc.invalidateQueries({ queryKey: ['task_comments'] })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        const n = payload.new as { title: string; body: string | null; link: string | null }
        toast(n.title, { description: n.body ?? undefined, action: n.link ? { label: 'Voir', onClick: () => navigate(n.link!) } : undefined })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [session, qc, navigate])
}

export function AppLayout() {
  const { profile, signOut, isSuperAdmin } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const notifications = useNotifications()
  const unread = useMemo(() => notifications.data?.filter((n) => !n.read_at).length ?? 0, [notifications.data])
  const navigate = useNavigate()
  const location = useLocation()
  useRealtime()

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])
  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto"><SidebarContent /></div>
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="inset-y-0 left-0 right-auto top-0 h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none p-0 [&]:left-0 [&]:top-0">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <div className="overflow-y-auto">
            <Brand />
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu">
            <Menu />
          </Button>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 max-w-md flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Rechercher…</span>
            <kbd className="hidden rounded border bg-background px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="relative" onClick={() => navigate('/notifications')} aria-label="Notifications">
              <Bell />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full" aria-label="Mon compte">
                  <Avatar name={fullName(profile)} url={profile?.avatar_url} size={30} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="grid">
                  <span className="text-sm text-foreground">{fullName(profile)}</span>
                  <span className="truncate font-normal">{profile?.email}</span>
                  {isSuperAdmin && <span className="mt-1 w-fit rounded bg-primary/10 px-1.5 text-[10px] text-primary">Super-administrateur</span>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/parametres/profil')}><Settings /> Mon profil</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Thème</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setTheme('light')}><Sun /> Clair {theme === 'light' && '✓'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}><Moon /> Sombre {theme === 'dark' && '✓'}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}><Monitor /> Système {theme === 'system' && '✓'}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut /> Se déconnecter</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}

export function PageHeader({ title, description, actions, icon }: { title: string; description?: string; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
