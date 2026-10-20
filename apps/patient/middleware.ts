import { handleAuthMiddleware } from '@iha/db/middleware'
import type { NextRequest } from 'next/server'

// Every path is protected by default — only auth pages, the OAuth callback,
// and API routes (which validate their own session) are listed here as
// public. This means every route folder under app/(dashboard)/ and
// app/(onboarding)/ is protected automatically, with nothing to keep in sync
// when adding a new one.
const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/auth',
  '/api',
]

export async function middleware(request: NextRequest) {
  return handleAuthMiddleware(request, {
    publicPrefixes: PUBLIC_PREFIXES,
    postAuthPath: '/cases',
    requireEmailVerification: true,
    checkPatientSoftDelete: true,
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
