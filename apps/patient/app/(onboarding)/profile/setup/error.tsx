'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function ProfileSetupError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error('[patient:ProfileSetupError]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('body')}</p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t('tryAgain')}
      </button>
    </div>
  )
}
