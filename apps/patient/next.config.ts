import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations'],
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  // Document uploads go through a Server Action (lib/actions/upload.ts) and
  // allow files up to 10 MB — Next's default Server Action body limit is 1 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default withNextIntl(nextConfig)
