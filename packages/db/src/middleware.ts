import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export type AuthMiddlewareOptions = {
  /**
   * Paths that do NOT require an authenticated session — auth pages, the OAuth
   * callback, public API routes. Every other path is protected by default, so a
   * new route under `(dashboard)` is automatically protected without needing an
   * update here.
   */
  publicPrefixes: string[]
  /** Where to send users after login when they hit an auth page while signed in */
  postAuthPath: string
  /** Require email verification before protected routes */
  requireEmailVerification?: boolean
  /**
   * Sign the user out and redirect to /login if their `patients` row has
   * `is_deleted = true`. Patient-portal-specific — only the patient app sets
   * this; other portals don't have a `patients` row for their own users, so
   * leave it unset there rather than paying for a lookup that can never match.
   */
  checkPatientSoftDelete?: boolean
}

/**
 * Auth pages that signed-in users should leave (not reset-password or OAuth callback).
 * `register` is excluded: signed-in users without a hospitals/doctors row are meant to land
 * there, and the register pages redirect away themselves once an account exists.
 */
const REDIRECT_WHEN_AUTHENTICATED = new Set(['login', 'verify', 'forgot-password'])

function shouldRedirectAuthenticated(pathname: string): boolean {
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment !== undefined && REDIRECT_WHEN_AUTHENTICATED.has(segment)
}

function isPublicPath(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function handleAuthMiddleware(
  request: NextRequest,
  options: AuthMiddlewareOptions,
): Promise<NextResponse> {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
            response.cookies.set(name, value, cookieOptions),
          )
        },
      },
    },
  )

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    // A stale/invalid refresh token cookie (e.g. left over from an expired session)
    // makes the underlying token refresh throw instead of returning an error result.
    // Treat it as unauthenticated rather than letting it crash the request.
    // Middleware runs on the Edge Runtime by default — no pino/node:stream here, plain console only.
    console.error('middleware: auth.getUser failed', error)
  }

  const { pathname } = request.nextUrl

  if (user && options.checkPatientSoftDelete) {
    const { data: patient } = await supabase
      .from('patients')
      .select('is_deleted')
      .eq('user_id', user.id)
      .maybeSingle()

    if (patient?.is_deleted) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? options.postAuthPath : '/login'
    return NextResponse.redirect(url)
  }

  const onProtectedRoute = !isPublicPath(pathname, options.publicPrefixes)

  if (!user && onProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (
    user &&
    options.requireEmailVerification &&
    !user.email_confirmed_at &&
    onProtectedRoute
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/verify'
    url.searchParams.set('email', user.email ?? '')
    return NextResponse.redirect(url)
  }

  if (user && shouldRedirectAuthenticated(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = options.postAuthPath
    return NextResponse.redirect(url)
  }

  return response
}
