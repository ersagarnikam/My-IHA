import { createClient } from './server'
import type { ProviderMessage, ProviderMessageThread } from '../types'

export type ProviderAccountType = 'doctor' | 'hospital' | 'lawyer'

// Supabase TypeScript generics resolve .insert()/.update() params as `never`
// for these tables in strict TS projects. Bypass with a manually-typed
// SimpleClient — same pattern used in chat.ts/cases.ts.
type SimpleClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      then: Promise<{ error: { message: string } | null }>['then']
    }
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: string | boolean) => {
        eq: (col: string, val: string | boolean) => Promise<{ error: { message: string } | null }>
      }
    }
  }
}

function accountColumn(accountType: ProviderAccountType): 'doctor_id' | 'hospital_id' | 'lawyer_id' {
  if (accountType === 'doctor') return 'doctor_id'
  if (accountType === 'hospital') return 'hospital_id'
  return 'lawyer_id'
}

export async function fetchProviderThread(
  accountType: ProviderAccountType,
  accountId: string,
): Promise<{ data: ProviderMessageThread | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('provider_message_threads')
    .select('*')
    .eq(accountColumn(accountType), accountId)
    .maybeSingle()
  return { data: (data as ProviderMessageThread | null) ?? null, error: error?.message ?? null }
}

export async function fetchProviderMessages(
  threadId: string,
): Promise<{ data: ProviderMessage[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('provider_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  return { data: (data as ProviderMessage[] | null) ?? [], error: error?.message ?? null }
}

export async function fetchUnreadProviderMessageCount(
  threadId: string,
): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('provider_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('sender_type', 'admin')
    .eq('read', false)
  return { count: count ?? 0, error: error?.message ?? null }
}

export async function sendProviderMessage(
  threadId: string,
  senderType: ProviderAccountType,
  senderId: string,
  body: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const builder = supabase
    .from('provider_messages')
    .insert({ thread_id: threadId, sender_type: senderType, sender_id: senderId, body })
  const result = await (builder as unknown as Promise<{ error: { message: string } | null }>)
  return { error: result.error?.message ?? null }
}

export async function markProviderMessagesRead(threadId: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { error } = await supabase
    .from('provider_messages')
    .update({ read: true })
    .eq('thread_id', threadId)
    .eq('sender_type', 'admin')
  return { error: error?.message ?? null }
}

export async function requestProviderThreadReopen(
  threadId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { error } = await supabase
    .from('provider_message_threads')
    .update({ reopen_requested_at: new Date().toISOString(), reopen_reason: reason })
    .eq('id', threadId)
    .eq('status', 'closed')
  return { error: error?.message ?? null }
}
