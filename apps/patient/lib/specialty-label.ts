import type { SpecialtyLabelMap } from '@iha/db/specialties'

export function getSpecialtyLabel(name: string, locale: string, map: SpecialtyLabelMap): string {
  const entry = map[name]
  if (!entry) return name
  return locale === 'zh' ? entry.label_zh : entry.label_en
}
