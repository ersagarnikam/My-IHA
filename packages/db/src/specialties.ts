import { createClient } from './server'

export type SpecialtyOption = {
  name: string
  label_en: string
  label_zh: string
}

export type SpecialtyLabelMap = Record<string, { label_en: string; label_zh: string }>

/** Active specialties for populating the case-condition dropdown, in display order. */
export async function fetchActiveSpecialties(): Promise<{ data: SpecialtyOption[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('specialties')
    .select('name, label_en, label_zh')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return { data: (data as SpecialtyOption[] | null) ?? [], error: error?.message ?? null }
}

/**
 * All specialties (including inactive) keyed by `name`, for resolving display
 * labels on existing cases/doctors — inactive rows must still resolve so
 * historical records don't lose their label once a specialty is deactivated.
 */
export async function fetchSpecialtyLabelMap(): Promise<SpecialtyLabelMap> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('specialties')
    .select('name, label_en, label_zh')

  const map: SpecialtyLabelMap = {}
  for (const row of (data as SpecialtyOption[] | null) ?? []) {
    map[row.name] = { label_en: row.label_en, label_zh: row.label_zh }
  }
  return map
}
