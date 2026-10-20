import { AuthSidebar } from '@iha/ui/auth'

export default function ProfileSetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <AuthSidebar />
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 lg:px-12">
        <div className="w-full max-w-[520px]">{children}</div>
      </div>
    </div>
  )
}
