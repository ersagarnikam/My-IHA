import type { ReactNode } from 'react'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { useT } from '../../i18n/I18nContext'
import { HOME_HOST, HOME_URL } from '../../lib/site'

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const t = useT('auth')
  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <div className="auth-top">
          <a href={HOME_URL} aria-label={t('backToWebsite', { site: HOME_HOST })}>
            <img src="/logo.png" alt="MTA" className="auth-logo" />
          </a>
          <LanguageSwitcher />
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
      <a href={HOME_URL} className="back-to-site">
        ← {t('backToWebsite', { site: HOME_HOST })}
      </a>
    </div>
  )
}
