import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import en from './en.json'
import zh from './zh.json'
import authMessages from './auth-messages.json'

// The patient catalogues are carried over unchanged from the Next.js app
// (apps/patient/messages); only simple {name} placeholders and <tag>…</tag>
// rich text are used, so a tiny formatter replaces next-intl.

export type Locale = 'en' | 'zh'

type Messages = Record<string, unknown>

const CATALOGUES: Record<Locale, Messages> = {
  en: { ...en, auth: authMessages.en },
  zh: { ...zh, auth: authMessages.zh },
}

const LOCALE_KEY = 'iha.locale'

type Vars = Record<string, string | number>

export type Translate = ((key: string, vars?: Vars) => string) & {
  /** Rich text: `<b>x</b>` in the message calls `tags.b('x')` (or `tags['*']` for any tag). */
  rich: (key: string, tags: Record<string, (chunk: string) => ReactNode>, vars?: Vars) => ReactNode
  has: (key: string) => boolean
}

type I18nValue = { locale: Locale; setLocale: (locale: Locale) => void }

const I18nContext = createContext<I18nValue | null>(null)

function readLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale)

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(LOCALE_KEY, next)
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useLocale() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useLocale must be used inside <I18nProvider>')
  return context
}

function lookup(messages: Messages, path: string): string | undefined {
  let node: unknown = messages
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(message: string, vars?: Vars) {
  if (!vars) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** Translator for one namespace, e.g. `useT('caseDetail')('back')`. Falls back to English, then the key. */
export function useT(namespace?: string): Translate {
  const { locale } = useLocale()
  return useMemo(() => makeTranslator(locale, namespace), [locale, namespace])
}

export function makeTranslator(locale: Locale, namespace?: string): Translate {
  const resolve = (key: string) => {
    const path = namespace ? `${namespace}.${key}` : key
    return lookup(CATALOGUES[locale], path) ?? lookup(CATALOGUES.en, path)
  }
  const t = ((key: string, vars?: Vars) => interpolate(resolve(key) ?? key, vars)) as Translate
  t.has = (key) => resolve(key) !== undefined
  t.rich = (key, tags, vars) => {
    const message = interpolate(resolve(key) ?? key, vars)
    const parts: ReactNode[] = []
    const pattern = /<(\w+)>(.*?)<\/\1>/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(message))) {
      if (match.index > last) parts.push(message.slice(last, match.index))
      const render = tags[match[1]!] ?? tags['*']
      parts.push(<Fragment key={match.index}>{render ? render(match[2]!) : match[2]}</Fragment>)
      last = match.index + match[0].length
    }
    if (last < message.length) parts.push(message.slice(last))
    return <>{parts}</>
  }
  return t
}
