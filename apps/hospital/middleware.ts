import { handleAuthMiddleware } from '@iha/db/middleware'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return handleAuthMiddleware(request, {
    publicPrefixes: ['/login', '/forgot-password', '/reset-password', '/verify', '/register', '/auth', '/api'],
    postAuthPath: '/dashboard',
    requireEmailVerification: true,
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
