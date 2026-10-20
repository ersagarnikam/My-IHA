import { redirect } from 'next/navigation'
import { VerifyOtpPageClient } from '@/components/auth/verify-otp-page-client'

type VerifyPageProps = {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { email } = await searchParams

  if (!email) {
    redirect('/register')
  }

  return <VerifyOtpPageClient email={decodeURIComponent(email)} />
}
