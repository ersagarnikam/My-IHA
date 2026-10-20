'use client'

import type { OAuthProvider } from '@iha/validations/auth'
import { cn } from '../lib/utils'

export type SocialAuthButtonsProps = {
  onOAuthClick: (provider: OAuthProvider) => void | Promise<void>
  disabled?: boolean
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#00a4ef" d="M13 1h10v10H13z" />
      <path fill="#7fba00" d="M1 13h10v10H1z" />
      <path fill="#ffb900" d="M13 13h10v10H13z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05 1.88-3.51 1.9-1.46.02-1.93-.86-3.6-.86-1.67 0-2.19.84-3.57.88-1.38.04-2.43-.92-3.41-1.87C2.29 17.25 1.01 12.45 2.62 8.72c.8-1.72 2.24-2.81 4.01-2.84 1.57-.03 3.05 1.05 3.6 1.05.55 0 2.38-1.3 4.01-1.11.68.03 2.6.28 3.83 2.1-3.28 1.79-2.76 5.76.96 7.08-.66 1.6-1.52 3.18-2.97 4.28zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

const socialButtonClass =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-colors hover:bg-muted disabled:opacity-50'

export function SocialAuthButtons({ onOAuthClick, disabled }: SocialAuthButtonsProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        className={socialButtonClass}
        disabled={disabled}
        onClick={() => onOAuthClick('google')}
        aria-label="Continue with Google"
      >
        <GoogleIcon />
      </button>
      <button
        type="button"
        className={socialButtonClass}
        disabled={disabled}
        onClick={() => onOAuthClick('azure')}
        aria-label="Continue with Microsoft"
      >
        <MicrosoftIcon />
      </button>
      <button
        type="button"
        className={cn(
          socialButtonClass,
        )}
        disabled={disabled}
        onClick={() => onOAuthClick('apple')}
        aria-label="Continue with Apple"
      >
        <AppleIcon />
      </button>
    </div>
  )
}
