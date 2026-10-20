import { useLocale, type Locale } from '../i18n/I18nContext'
import type { Specialty } from './cases'

/** Doctors propose consultation times in Sydney time. */
export const DOCTOR_TIME_ZONE = 'Australia/Sydney'

function tag(locale: Locale) {
  return locale === 'zh' ? 'zh-CN' : 'en-AU'
}

export function useFormat() {
  const { locale } = useLocale()
  const lang = tag(locale)
  return {
    date: (iso: string | null | undefined) =>
      iso
        ? new Date(iso).toLocaleDateString(lang, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '—',
    dateTime: (iso: string, timeZone?: string) =>
      new Date(iso).toLocaleString(lang, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
      }),
    time: (iso: string, timeZone?: string) =>
      new Date(iso).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit', timeZone }),
    money: (amount: number | null | undefined) =>
      amount == null
        ? '—'
        : new Intl.NumberFormat(lang, {
            style: 'currency',
            currency: 'AUD',
            maximumFractionDigits: 2,
          }).format(amount),
    relative: (iso: string) => relativeTime(iso, lang),
    bytes: (bytes: number | null | undefined) =>
      bytes == null
        ? ''
        : bytes < 1024 * 1024
          ? `${Math.ceil(bytes / 1024)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`,
  }
}

function relativeTime(iso: string, lang: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return format.format(0, 'second')
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86400) return format.format(Math.round(seconds / 86400), 'day')
  return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Specialty display name in the current language (cases store the English `name`). */
export function useSpecialtyLabel(specialties: Specialty[] | null) {
  const { locale } = useLocale()
  return (c: { specialty: string; specialtyOther: string | null }) => {
    if (c.specialty === 'Other' && c.specialtyOther) return c.specialtyOther
    const match = specialties?.find((s) => s.name === c.specialty)
    return match ? (locale === 'zh' ? match.labelZh : match.labelEn) : c.specialty
  }
}

/** Session-scoped wizard drafts (cleared on sign-out) so PII never lingers on shared devices. */
export const drafts = {
  load<T>(name: string): T | null {
    try {
      const raw = sessionStorage.getItem(`patient-draft:${name}`)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  },
  save(name: string, value: unknown) {
    try {
      sessionStorage.setItem(`patient-draft:${name}`, JSON.stringify(value))
    } catch {
      // Drafts are a convenience.
    }
  },
  clear(name: string) {
    try {
      sessionStorage.removeItem(`patient-draft:${name}`)
    } catch {
      // ignore
    }
  },
  clearAll() {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('patient-draft:'))
        .forEach((k) => sessionStorage.removeItem(k))
    } catch {
      // ignore
    }
  },
}
