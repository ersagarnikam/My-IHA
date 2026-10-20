import { createClient } from '@iha/db/server'
import { getAccountForUser } from '@/lib/auth/account'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url)
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin
  const code = searchParams.get('code')
  const explicitNext = searchParams.get('next')

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

  if (explicitNext) {
    return NextResponse.redirect(`${origin}${explicitNext}`)
  }

  if (user) {
    const account = await getAccountForUser(user.id)
    if (account && account.role !== 'doctor') {
      // This app only serves doctors — sign out before redirecting so the
      // middleware's "authenticated user on /login" rule doesn't bounce them
      // straight back here.
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login`)
    }
    const next = !account ? '/register' : account.status === 'approved' ? '/dashboard' : '/pending-approval'
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login`)
}
