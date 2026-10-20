import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations'],
}

export default nextConfig
