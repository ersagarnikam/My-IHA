import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  if (!user.email_confirmed_at) {
    redirect(`/verify?email=${encodeURIComponent(user.email ?? '')}`)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        <p className="text-sm font-medium text-muted-foreground">MTA Admin Portal</p>
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
