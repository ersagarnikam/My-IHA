import { createClient } from '@iha/db/server'
import { NextResponse } from 'next/server'
import { syncPatientProfileFromAuthUser } from '@/lib/auth/sync-patient-profile'

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url)
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await syncPatientProfileFromAuthUser(user)

    const fullName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.identities?.[0]?.identity_data?.full_name

    if (fullName && !user.user_metadata?.full_name) {
      await supabase.auth.updateUser({
        data: { full_name: fullName },
      })
    }
  }

  if (user && !user.email_confirmed_at) {
    return NextResponse.redirect(
      `${origin}/verify?email=${encodeURIComponent(user.email ?? '')}`,
    )
  }

  return NextResponse.redirect(`${origin}${next}`)
}
