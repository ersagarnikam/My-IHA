'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@iha/db/server'
import type { Result } from '@iha/validations'
import { getTranslations } from 'next-intl/server'

export async function setLocale(locale: 'en' | 'zh'): Promise<Result<{ success: true }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const t = await getTranslations('actionErrors')
    return { data: null, error: t('common.unauthenticated') }
  }

  const cookieStore = await cookies()
  cookieStore.set('locale', locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  revalidatePath('/', 'layout')
  return { data: { success: true }, error: null }
}
