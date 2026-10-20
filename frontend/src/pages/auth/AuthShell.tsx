import type { ReactNode } from 'react'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { useT } from '../../i18n/I18nContext'

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
          <p className="brand">{t('brand')}</p>
          <LanguageSwitcher />
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </div>
  )
}
