import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:payments-cards')

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error({ err: error }, 'fetch payment methods failed')
    return NextResponse.json({ error: 'Failed to load payment methods.' }, { status: 500 })
  }

  return NextResponse.json(data)
}
