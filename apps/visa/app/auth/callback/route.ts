import { createClient } from '@iha/db/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
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
