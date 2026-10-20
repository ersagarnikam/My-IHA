'use client'

import { useTransition } from 'react'
import { setLocale } from '@/lib/actions/locale'

type Props = {
  currentLocale: string
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const [isPending, startTransition] = useTransition()

  function switchLocale(locale: 'en' | 'zh') {
    startTransition(() => {
      setLocale(locale)
    })
  }

  return (
    <div
      className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold"
      aria-label="Language switcher"
    >
      <button
        onClick={() => switchLocale('en')}
        disabled={isPending}
        className={`rounded px-2 py-1 transition-colors ${
          currentLocale === 'en'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => switchLocale('zh')}
        disabled={isPending}
        className={`rounded px-2 py-1 transition-colors ${
          currentLocale === 'zh'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        中文
      </button>
    </div>
  )
}
