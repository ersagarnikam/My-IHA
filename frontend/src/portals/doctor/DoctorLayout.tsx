import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  Bell,
  BriefcaseMedical,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/Toasts'
import { Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import type { Notification } from '../../lib/cases'
import { useFormat } from '../../lib/format'
import { RealtimeProvider, useRealtime } from '../../lib/realtime'
import { useApi } from '../../lib/useApi'
import { useDoctor } from './DoctorContext'
import { useDoctorPhoto } from './settings/useDoctorPhoto'
import './doctor.css'

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/doctor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/doctor/cases', label: 'My Cases', icon: BriefcaseMedical },
  { to: '/doctor/consultations', label: 'Consultations', icon: CalendarDays },
  { to: '/doctor/messages', label: 'Messages', icon: MessageSquare },
  { to: '/doctor/account-settings', label: 'Account & Settings', icon: Settings },
]

export type DoctorOutletContext = { refreshMessagesUnread: () => void }

/** Where a notification leads in the doctor portal. */
export function doctorNotificationHref(n: Notification) {
  if (n.type === 'new_message') return '/doctor/messages'
  if (n.type.startsWith('consultation')) return '/doctor/consultations'
  if (n.type.includes('fee')) return '/doctor/account-settings?tab=billing'
  if (n.caseId) return `/doctor/cases/${n.caseId}`
  return '/doctor/notifications'
}

export function DoctorLayout() {
  return (
    <RealtimeProvider>
      <Shell />
    </RealtimeProvider>
  )
}

function Shell() {
  const doctor = useDoctor()
  const photo = useDoctorPhoto(doctor.hasPhoto)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const messagesUnread = useApi<{ count: number }>('/api/doctor/messages/unread-count')

  useRealtime<{ senderType: string }>('provider_message', (message) => {
    if (message.senderType === 'admin') void messagesUnread.reload()
  })

  const unread = messagesUnread.data?.count ?? 0

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
        <NavLinks collapsed={collapsed} unread={unread} onLogout={() => setConfirmLogout(true)} />
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
            <NavLinks
              collapsed={false}
              unread={unread}
              onNavigate={() => setMobileOpen(false)}
              onLogout={() => {
                setMobileOpen(false)
                setConfirmLogout(true)
              }}
            />
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
            {doctor.status === 'approved' && (
              <span className="topbar-badge">✓ Verified Doctor</span>
            )}
            <NotificationBell hrefFor={doctorNotificationHref} allPath="/doctor/notifications" />
            <div className="topbar-user">
              {photo ? (
                <img src={photo} alt="" className="avatar" />
              ) : (
                <span className="avatar">{initial(doctor.fullName)}</span>
              )}
              <div className="topbar-user-text">
                <p className="topbar-name">{doctor.fullName}</p>
                <p className="topbar-role">Doctor</p>
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
            context={{ refreshMessagesUnread: messagesUnread.reload } satisfies DoctorOutletContext}
          />
        </main>
      </div>
      <LogoutDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </div>
  )
}

/** First letter after an optional "Dr." prefix. */
export function initial(name: string) {
  return name
    .replace(/^dr\.?\s+/i, '')
    .slice(0, 1)
    .toUpperCase()
}

function NavLinks({
  collapsed,
  unread,
  onNavigate,
  onLogout,
}: {
  collapsed: boolean
  unread: number
  onNavigate?: () => void
  onLogout: () => void
}) {
  return (
    <>
      <nav className="sidebar-nav">
        {NAV.map(({ to, label, icon: Icon }) => {
          const badge = to === '/doctor/messages' ? unread : 0
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span className="nav-icon">
                <Icon size={16} />
                {collapsed && badge > 0 && <span className="nav-dot" />}
              </span>
              {!collapsed && <span className="nav-label">{label}</span>}
              {!collapsed && badge > 0 && (
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
          title={collapsed ? 'Sign out' : undefined}
          onClick={onLogout}
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  )
}

export function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useAuth()
  return (
    <Modal open={open} onClose={onClose} title="Sign out?">
      <p className="muted">You'll need to sign in again to access your account.</p>
      <div className="row-end">
        <button type="button" className="button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button-danger" onClick={signOut}>
          Sign out
        </button>
      </div>
    </Modal>
  )
}

/** Header bell with the latest notifications (shared by the doctor and hospital portals). */
export function NotificationBell({
  hrefFor,
  allPath,
}: {
  hrefFor: (n: Notification) => string
  allPath: string
}) {
  const format = useFormat()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const latest = useApi<Notification[]>('/api/notifications?limit=5')
  const unread = useApi<{ count: number }>('/api/notifications/unread-count')
  const ref = useRef<HTMLDivElement>(null)

  useRealtime<Notification>('notification', (n) => {
    void latest.reload()
    void unread.reload()
    toast({ title: n.title, body: n.message, action: { label: 'View', onClick: () => void go(n) } })
  })

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  async function go(n: Notification) {
    setOpen(false)
    if (!n.read) {
      await apiPost(`/api/notifications/${n.id}/read`).catch(() => {})
      void unread.reload()
      void latest.reload()
    }
    navigate(hrefFor(n))
  }

  async function markAll() {
    await apiPost('/api/notifications/read-all')
    void unread.reload()
    void latest.reload()
  }

  const count = unread.data?.count ?? 0
  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="ghost-button bell-button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} />
        {count > 0 && <span className="count-badge bell-count">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="bell-menu card">
          <div className="row-between">
            <strong>Notifications</strong>
            {count > 0 && (
              <button type="button" className="button-link small" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          {latest.data?.length === 0 && <p className="muted small">No notifications yet.</p>}
          <ul className="notification-list compact">
            {latest.data?.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notification-row${n.read ? '' : ' unread'}`}
                  onClick={() => go(n)}
                >
                  <span className="notification-title">{n.title}</span>
                  <span className="small muted">{n.message}</span>
                  <span className="small muted">{format.relative(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button-link small"
            onClick={() => {
              setOpen(false)
              navigate(allPath)
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}
