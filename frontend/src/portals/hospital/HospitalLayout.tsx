import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import {
  BriefcaseMedical,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Stethoscope,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Notification } from '../../lib/cases'
import { RealtimeProvider, useRealtime } from '../../lib/realtime'
import { useApi } from '../../lib/useApi'
import { LogoutDialog, NotificationBell, type DoctorOutletContext } from '../doctor/DoctorLayout'
import { useHospital } from './HospitalContext'
import '../doctor/doctor.css'
import './hospital.css'

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/hospital/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/hospital/cases', label: 'Case Management', icon: BriefcaseMedical },
  { to: '/hospital/patients', label: 'Patient Management', icon: Users },
  { to: '/hospital/doctors', label: 'Doctor Management', icon: Stethoscope },
  { to: '/hospital/documents', label: 'Documents', icon: FileText },
  { to: '/hospital/messages', label: 'Messages', icon: MessageSquare },
  { to: '/hospital/account-settings', label: 'Account & Settings', icon: Settings },
]

/** Where a notification leads in the hospital portal. */
export function hospitalNotificationHref(n: Notification) {
  if (n.type === 'new_message') return '/hospital/messages'
  if (n.type === 'hospital_treatment_confirmed') return '/hospital/documents'
  if (n.caseId) return `/hospital/cases/by-case/${n.caseId}`
  return '/hospital/notifications'
}

export function HospitalLayout() {
  return (
    <RealtimeProvider>
      <Shell />
    </RealtimeProvider>
  )
}

function Shell() {
  const hospital = useHospital()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const messagesUnread = useApi<{ count: number }>('/api/hospital/messages/unread-count')

  useRealtime<{ senderType: string }>('provider_message', (message) => {
    if (message.senderType === 'admin') void messagesUnread.reload()
  })
  const unread = messagesUnread.data?.count ?? 0

  const links = (isCollapsed: boolean, onNavigate?: () => void) => (
    <>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, icon: Icon }) => {
          const badge = to === '/hospital/messages' ? unread : 0
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
            <span className="topbar-badge">✓ Partner Hospital</span>
            <NotificationBell
              hrefFor={hospitalNotificationHref}
              allPath="/hospital/notifications"
            />
            <div className="topbar-user">
              <span className="avatar">{hospital.name.slice(0, 1).toUpperCase()}</span>
              <div className="topbar-user-text">
                <p className="topbar-name">{hospital.name}</p>
                <p className="topbar-role">Hospital</p>
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
            context={
              {
                refreshMessagesUnread: () => void messagesUnread.reload(),
              } satisfies DoctorOutletContext
            }
          />
        </main>
      </div>
      <LogoutDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </div>
  )
}
