import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  Bell,
  BriefcaseMedical,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plane,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { useToast } from '../../components/Toasts'
import { Modal } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { apiPost } from '../../lib/api'
import type { Notification } from '../../lib/cases'
import { useFormat } from '../../lib/format'
import { RealtimeProvider, useRealtime } from '../../lib/realtime'
import type { ChatMessage } from '../../lib/types'
import { useApi } from '../../lib/useApi'
import { notificationHref } from './notificationRouting'
import { usePatient } from './PatientContext'
import { useAvatarUrl } from './profile/ProfileForms'

const NAV: { to: string; key: string; icon: LucideIcon }[] = [
  { to: '/patient/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { to: '/patient/cases', key: 'caseManagement', icon: BriefcaseMedical },
  { to: '/patient/messages', key: 'messages', icon: MessageSquare },
  { to: '/patient/documents', key: 'documents', icon: FileText },
  { to: '/patient/treatments', key: 'treatment', icon: CalendarDays },
  { to: '/patient/visa-travel', key: 'visaTravel', icon: Plane },
  { to: '/patient/payments', key: 'payments', icon: CreditCard },
  { to: '/patient/profile', key: 'accountSettings', icon: Settings },
]

const CASE_VISA = /^\/patient\/cases\/[^/]+\/visa/

/** Same highlighting rules as the old shell: a case's visa page belongs to "Visa & Travel". */
function useIsActive() {
  const { pathname } = useLocation()
  return (to: string) => {
    if (to === '/patient/visa-travel') return pathname.startsWith(to) || CASE_VISA.test(pathname)
    if (to === '/patient/cases') return pathname.startsWith(to) && !CASE_VISA.test(pathname)
    return pathname.startsWith(to)
  }
}

export function PatientLayout() {
  return (
    <RealtimeProvider>
      <Shell />
    </RealtimeProvider>
  )
}

function Shell() {
  const tCommon = useT('common')
  const tLogout = useT('logout')
  const { profile } = usePatient()
  const avatar = useAvatarUrl(profile.hasAvatar)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const chatUnread = useApi<{ count: number }>('/api/patient/chat/unread-count')

  useRealtime<ChatMessage>('chat_message', (message) => {
    if (message.senderType === 'admin') void chatUnread.reload()
  })

  const unreadChat = chatUnread.data?.count ?? 0

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
        <NavLinks
          collapsed={collapsed}
          unreadChat={unreadChat}
          onLogout={() => setConfirmLogout(true)}
        />
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
              unreadChat={unreadChat}
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
            <LanguageSwitcher />
            <NotificationBell />
            <div className="topbar-user">
              {avatar ? (
                <img src={avatar} alt="" className="avatar" />
              ) : (
                <span className="avatar">{profile.fullName.slice(0, 1).toUpperCase()}</span>
              )}
              <div className="topbar-user-text">
                <p className="topbar-name">{profile.fullName}</p>
                <p className="topbar-role">{tCommon('patient')}</p>
              </div>
            </div>
            <button
              type="button"
              className="ghost-button"
              aria-label={tLogout('confirm')}
              onClick={() => setConfirmLogout(true)}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="portal-main">
          <Outlet context={{ refreshChatUnread: chatUnread.reload }} />
        </main>
      </div>
      <LogoutDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </div>
  )
}

function NavLinks({
  collapsed,
  unreadChat,
  onNavigate,
  onLogout,
}: {
  collapsed: boolean
  unreadChat: number
  onNavigate?: () => void
  onLogout: () => void
}) {
  const t = useT('nav')
  const isActive = useIsActive()
  return (
    <>
      <nav className="sidebar-nav">
        {NAV.map(({ to, key, icon: Icon }) => {
          const label = t(key)
          const badge = key === 'messages' ? unreadChat : 0
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={isActive(to) ? 'nav-item active' : 'nav-item'}
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
          title={collapsed ? t('signOut') : undefined}
          onClick={onLogout}
        >
          <LogOut size={16} />
          {!collapsed && <span>{t('signOut')}</span>}
        </button>
      </div>
    </>
  )
}

function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT('logout')
  const { signOut } = useAuth()
  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      <p className="muted">{t('body')}</p>
      <div className="row-end">
        <button type="button" className="button-secondary" onClick={onClose}>
          {t('cancel')}
        </button>
        <button type="button" className="button-danger" onClick={signOut}>
          {t('confirm')}
        </button>
      </div>
    </Modal>
  )
}

function NotificationBell() {
  const t = useT('notifications')
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
    toast({
      title: n.title,
      body: n.message,
      action: { label: t('view'), onClick: () => void go(n) },
    })
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
    navigate(await notificationHref(n))
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
        aria-label={t('title')}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} />
        {count > 0 && <span className="count-badge bell-count">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="bell-menu card">
          <div className="row-between">
            <strong>{t('title')}</strong>
            {count > 0 && (
              <button type="button" className="button-link small" onClick={markAll}>
                {t('markAllAsRead')}
              </button>
            )}
          </div>
          {latest.data?.length === 0 && <p className="muted small">{t('empty')}</p>}
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
              navigate('/patient/notifications')
            }}
          >
            {t('viewAll')}
          </button>
        </div>
      )}
    </div>
  )
}
