import { cn } from '../lib/utils'

export type AuthLogoProps = {
  logoSrc?: string
  className?: string
}

export function AuthLogo({ logoSrc = '/logo.png', className }: AuthLogoProps) {
  return (
    <div className={cn('flex justify-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt="IHA — International Health Alliance" className="h-12 w-auto" />
    </div>
  )
}
