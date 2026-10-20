import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

const TABS = [
  { key: 'travel', labelKey: 'travelGuide', href: '/visa-travel' },
  { key: 'visa',   labelKey: 'visaManagement', href: '/visa-travel?tab=visa' },
] as const

export async function TabBar({ activeTab }: { activeTab: string }) {
  const t = await getTranslations('visaTravel')

  return (
    <div className="flex border-b border-slate-200">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? 'border-cyan-600 text-cyan-700'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </div>
  )
}
