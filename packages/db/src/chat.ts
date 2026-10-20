import { createClient } from './server'
import type { Database } from '../types'

type ChatThreadRow = Database['public']['Tables']['chat_threads']['Row']
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']

// Supabase TypeScript generics resolve .insert()/.update() params as `never` for this table
// in strict TS projects. Bypass with a manually-typed SimpleClient — same pattern used in cases.ts.
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

export async function fetchChatThreadForPatient(
  patientId: string,
): Promise<{ data: ChatThreadRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle()
  return { data: (data as ChatThreadRow | null) ?? null, error: error?.message ?? null }
}

export async function fetchChatMessages(
  threadId: string,
): Promise<{ data: ChatMessageRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  return { data: (data as ChatMessageRow[] | null) ?? [], error: error?.message ?? null }
}

export async function fetchUnreadChatMessageCount(
  threadId: string,
): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('sender_type', 'admin')
    .eq('read', false)
  return { count: count ?? 0, error: error?.message ?? null }
}

export async function sendPatientChatMessage(
  threadId: string,
  senderId: string,
  body: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const builder = supabase
    .from('chat_messages')
    .insert({ thread_id: threadId, sender_type: 'patient', sender_id: senderId, body })
  const result = await (builder as unknown as Promise<{ error: { message: string } | null }>)
  return { error: result.error?.message ?? null }
}

export async function markChatMessagesRead(threadId: string): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { error } = await supabase
    .from('chat_messages')
    .update({ read: true })
    .eq('thread_id', threadId)
    .eq('sender_type', 'admin')
  return { error: error?.message ?? null }
}

export async function requestChatThreadReopen(
  threadId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const supabase = (await createClient()) as unknown as SimpleClient
  const { error } = await supabase
    .from('chat_threads')
    .update({ reopen_requested_at: new Date().toISOString(), reopen_reason: reason })
    .eq('id', threadId)
    .eq('status', 'closed')
  return { error: error?.message ?? null }
}
