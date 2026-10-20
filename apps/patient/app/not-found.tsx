import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('errors.notFound')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t('body')}</p>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t('backToDashboard')}
      </Link>
    </div>
  )
}
