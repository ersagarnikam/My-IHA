import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import {
  BriefcaseMedical,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Stethoscope,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useApi } from '../../lib/useApi'
import { LogoutDialog } from '../doctor/DoctorLayout'
import '../doctor/doctor.css'
import type { Overview } from './types'

const NAV: { to: string; label: string; icon: LucideIcon; count?: (o: Overview) => number }[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/admin/doctors',
    label: 'Doctor Approvals',
    icon: Stethoscope,
    count: (o) => o.pendingDoctors,
  },
  {
    to: '/admin/cases',
    label: 'Cases',
    icon: BriefcaseMedical,
    count: (o) => o.casesNeedingDoctor,
  },
  {
    to: '/admin/plans',
    label: 'Treatment Plans',
    icon: ClipboardCheck,
    count: (o) => o.plansToReview,
  },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare, count: (o) => o.chatsWaiting },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export type AdminOutletContext = { refreshCounts: () => void }

/** Shell for MTA staff, same look as the doctor portal. */
export function AdminLayout() {
  const { user } = useAuth()
  const overview = useApi<Overview>('/api/admin/overview')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const links = (isCollapsed: boolean, onNavigate?: () => void) => (
    <>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, icon: Icon, count }) => {
          const badge = overview.data && count ? count(overview.data) : 0
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span className="nav-icon">
                <Icon size={16} />
                {isCollapsed && badge > 0 && <span className="nav-dot" />}
              </span>
              {!isCollapsed && <span className="nav-label">{label}</span>}
              {!isCollapsed && badge > 0 && (
                <span className="count-badge nav-count">{badge > 99 ? '99+' : badge}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        <button
          type="button"
          className="nav-item signout"
          title={isCollapsed ? 'Sign out' : undefined}
          onClick={() => {
            onNavigate?.()
            setConfirmLogout(true)
          }}
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  )

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          {!collapsed && <img src="/logo.png" alt="MTA" className="sidebar-logo" />}
          <button
            type="button"
            className="ghost-button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        {links(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="mobile-nav">
          <div className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} />
          <aside className="sidebar mobile">
            <div className="sidebar-head">
              <img src="/logo.png" alt="MTA" className="sidebar-logo" />
              <button
                type="button"
                className="ghost-button"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            {links(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="ghost-button menu-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span className="topbar-divider" />
          </div>
          <div className="topbar-right">
            <span className="topbar-badge admin">MTA Admin</span>
            <div className="topbar-user">
              <span className="avatar">{(user?.email ?? 'A').slice(0, 1).toUpperCase()}</span>
              <div className="topbar-user-text">
                <p className="topbar-name">{user?.email}</p>
                <p className="topbar-role">Coordinator</p>
              </div>
            </div>
            <button
              type="button"
              className="ghost-button"
              aria-label="Sign out"
              onClick={() => setConfirmLogout(true)}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="portal-main">
          <Outlet
            context={{ refreshCounts: () => void overview.reload() } satisfies AdminOutletContext}
          />
        </main>
      </div>
      <LogoutDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </div>
  )
}
