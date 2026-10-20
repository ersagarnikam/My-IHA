import { AuthShell } from '@iha/ui/auth'

export default function RegistrationFeeLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell contentClassName="w-full max-w-2xl">{children}</AuthShell>
}
