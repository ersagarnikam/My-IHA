import { useLocale } from '../i18n/I18nContext'

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button
        type="button"
        className={locale === 'en' ? 'active' : ''}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={locale === 'zh' ? 'active' : ''}
        onClick={() => setLocale('zh')}
      >
        中文
      </button>
    </div>
  )
}
