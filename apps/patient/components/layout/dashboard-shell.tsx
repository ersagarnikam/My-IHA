'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
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
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@iha/ui'
import type { Notification } from '@iha/db/types'
import { signOut } from '@/lib/actions/auth'
import { clearAllDrafts } from '@/lib/draft-storage'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationsChannelProvider } from '@/hooks/use-notifications-channel'
import { LinkProgressReporter } from './navigation-progress'

const NAV_KEYS = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/cases', key: 'caseManagement', icon: BriefcaseMedical },
  { href: '/messages', key: 'messages', icon: MessageSquare },
  { href: '/documents', key: 'documents', icon: FileText },
  { href: '/treatments', key: 'treatment', icon: CalendarDays },
  { href: '/visa-travel', key: 'visaTravel', icon: Plane },
  { href: '/payments', key: 'payments', icon: CreditCard },
  { href: '/profile', key: 'accountSettings', icon: Settings },
] as const

const CASE_VISA_SUBROUTE = /^\/cases\/[^/]+\/visa/

function useActiveHref() {
  const pathname = usePathname()
  return (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/visa-travel') return pathname.startsWith('/visa-travel') || CASE_VISA_SUBROUTE.test(pathname)
    if (href === '/cases') return pathname.startsWith('/cases') && !CASE_VISA_SUBROUTE.test(pathname)
    return pathname.startsWith(href)
  }
}

type NavLinksProps = {
  collapsed: boolean
  onLinkClick?: () => void
  onLogout: () => void
  unreadChatCount: number
}

function NavLinks({ collapsed, onLinkClick, onLogout, unreadChatCount }: NavLinksProps) {
  const isActive = useActiveHref()
  const t = useTranslations('nav')

  return (
    <>
      <nav className="flex-1 space-y-0.5 px-2 py-4">
        {NAV_KEYS.map((item) => {
          const Icon = item.icon
          const label = t(item.key)
          const active = isActive(item.href)
          const badgeCount = item.key === 'messages' ? unreadChatCount : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              title={collapsed ? label : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-cyan-50 text-cyan-800'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <LinkProgressReporter />
              <span className="relative shrink-0">
                <Icon className="h-4 w-4" />
                {collapsed && badgeCount > 0 && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                )}
              </span>
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badgeCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-100 px-2 py-3">
        <button
          onClick={onLogout}
          title={collapsed ? t('signOut') : undefined}
          className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t('signOut')}</span>}
        </button>
      </div>
    </>
  )
}

type Props = {
  children: React.ReactNode
  userName: string
  userInitial: string
  avatarUrl?: string | null
  userId: string
  initialNotifications: Notification[]
  initialUnreadCount: number
  initialUnreadChatCount: number
  locale: string
}

export function DashboardShell({
  children,
  userName,
  userInitial,
  avatarUrl,
  userId,
  initialNotifications,
  initialUnreadCount,
  initialUnreadChatCount,
  locale,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const tLogout = useTranslations('logout')
  const tCommon = useTranslations('common')

  function toggleCollapsed() {
    setCollapsed((prev) => !prev)
  }

  return (
    <NotificationsChannelProvider userId={userId}>
      <div className="min-h-screen bg-[#f6f9fa] text-slate-900">
        {/* Desktop sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-in-out lg:flex ${
            collapsed ? 'w-14' : 'w-52'
          }`}
        >
          <div
            className={`flex h-16 shrink-0 items-center border-b border-slate-100 px-3 ${
              collapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {!collapsed && (
              <Image src="/logo.png" alt="MTA" width={82} height={34} className="h-auto w-24" priority />
            )}
            <button
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <NavLinks
            collapsed={collapsed}
            onLogout={() => setShowLogout(true)}
            unreadChatCount={initialUnreadChatCount}
          />
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-56 flex-col border-r border-slate-200 bg-white shadow-xl">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
                <Image src="/logo.png" alt="MTA" width={82} height={34} className="h-auto w-24" priority />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <NavLinks
                collapsed={false}
                onLinkClick={() => setMobileOpen(false)}
                onLogout={() => { setMobileOpen(false); setShowLogout(true) }}
                unreadChatCount={initialUnreadChatCount}
              />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div
          className={`transition-[padding-left] duration-200 ease-in-out ${
            collapsed ? 'lg:pl-14' : 'lg:pl-52'
          }`}
        >
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="hidden h-6 w-px bg-slate-200 lg:block" />
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher currentLocale={locale} />
              <NotificationBell
                initialNotifications={initialNotifications}
                initialUnreadCount={initialUnreadCount}
              />
              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={userName}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-100 text-sm font-semibold text-cyan-800">
                    {userInitial}
                  </div>
                )}
                <div className="hidden leading-tight sm:block">
                  <p className="text-sm font-semibold text-slate-900">{userName}</p>
                  <p className="text-[11px] text-slate-500">{tCommon('patient')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowLogout(true)}
                aria-label={tLogout('confirm')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>

        {/* Logout confirmation */}
        {showLogout && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLogout(false) }}
          >
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-base font-semibold text-slate-900">{tLogout('title')}</h2>
              <p className="mt-1.5 text-sm text-slate-500">{tLogout('body')}</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogout(false)}
                >
                  {tLogout('cancel')}
                </Button>
                <form action={signOut} onSubmit={() => clearAllDrafts()}>
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {tLogout('confirm')}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </NotificationsChannelProvider>
  )
}
