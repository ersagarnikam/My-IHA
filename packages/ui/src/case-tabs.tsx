'use client'

import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from './tabs'

export type CaseTabOption = { key: string; label: string; href: string }

export function CaseTabs({ tabs, activeKey }: { tabs: CaseTabOption[]; activeKey: string }) {
  const router = useRouter()

  return (
    <Tabs
      value={activeKey}
      onValueChange={(key) => {
        const tab = tabs.find((t) => t.key === key)
        if (tab) router.push(tab.href)
      }}
    >
      <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="rounded-full border border-cyan-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-none data-[state=active]:border-transparent data-[state=active]:bg-cyan-700 data-[state=active]:text-white data-[state=active]:shadow-none"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
