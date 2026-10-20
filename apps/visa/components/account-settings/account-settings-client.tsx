'use client'

import { useState } from 'react'
import { useQueryState, parseAsStringLiteral } from 'nuqs'
import { User, Shield, Bell, ChevronDown, ChevronUp } from 'lucide-react'
import { SecurityTab } from '@iha/ui'
import type { LawyerAccountSettings } from '@/lib/data/account-settings'
import { LawyerBasicInfoCard } from './lawyer-basic-info-card'
import { LawyerProfessionalDetailsCard } from './lawyer-professional-details-card'
import { NotificationsTab } from './notifications-tab'

const TAB_VALUES = ['personal-info', 'security', 'notifications'] as const
type Tab = typeof TAB_VALUES[number]

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'personal-info', label: 'Personal Info', icon: <User className="h-4 w-4" /> },
  { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
]

type Props = {
  lawyer: LawyerAccountSettings
  email: string
}

export function AccountSettingsClient({ lawyer, email }: Props) {
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(TAB_VALUES).withDefault('personal-info').withOptions({ scroll: false, shallow: true }),
  )
  const activeTabConfig = TABS.find((tab) => tab.id === activeTab)!
  const [navOpen, setNavOpen] = useState(false)

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    setNavOpen(false)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Account &amp; Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">Manage your profile and preferences.</p>
      </div>

      <div className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:flex-row">
        {/* Mobile: dropdown tab selector */}
        <div className="relative border-b border-slate-200 p-2 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen((p) => !p)}
            className="flex w-full items-center justify-between gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <span className="flex items-center gap-2.5">
              <span className="text-cyan-600">{activeTabConfig.icon}</span>
              {activeTabConfig.label}
            </span>
            {navOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {navOpen && (
            <div className="absolute inset-x-2 top-full z-10 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md">
              {TABS.filter((tab) => tab.id !== activeTab).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <span className="text-slate-400">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Left sidebar (lg and up) */}
        <nav className="hidden shrink-0 lg:flex lg:w-56 lg:flex-col lg:border-r lg:border-slate-200 lg:py-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={[
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors border-l-2',
                activeTab === tab.id
                  ? 'border-cyan-600 bg-cyan-50 font-medium text-cyan-700'
                  : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              ].join(' ')}
            >
              <span className={activeTab === tab.id ? 'text-cyan-600' : 'text-slate-400'}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {activeTab === 'personal-info' && (
            <div className="space-y-5">
              <LawyerBasicInfoCard lawyer={lawyer} email={email} />
              <LawyerProfessionalDetailsCard lawyer={lawyer} />
            </div>
          )}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'notifications' && (
            <NotificationsTab
              emailEnabled={lawyer.emailNotificationsEnabled}
              smsEnabled={lawyer.smsNotificationsEnabled}
            />
          )}
        </div>
      </div>
    </div>
  )
}
