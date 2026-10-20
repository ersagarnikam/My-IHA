import { AuthSidebar, type AuthSidebarProps } from './auth-sidebar'

export type AuthShellProps = {
  children: React.ReactNode
  sidebarProps?: AuthSidebarProps
  /** Overrides the default 400px content cap — wider forms (e.g. a multi-step wizard) need more room. */
  contentClassName?: string
}

export function AuthShell({ children, sidebarProps, contentClassName }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-white">
      <AuthSidebar {...sidebarProps} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 lg:px-12">
        <div className={contentClassName ?? 'w-full max-w-[400px]'}>{children}</div>
      </div>
    </div>
  )
}
