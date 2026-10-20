import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchProviderThread, fetchProviderMessages } from '@iha/db/provider-messages'
import { getAccountForUser } from '@/lib/auth/account'
import { ProviderMessageThread } from '@iha/ui'
import {
  sendProviderMessageAction,
  markProviderMessagesReadAction,
  requestProviderThreadReopenAction,
} from '@/lib/actions/messages'

export default async function MessagesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const { data: thread } = await fetchProviderThread(account.role, account.id)
  const { data: messages } = thread ? await fetchProviderMessages(thread.id) : { data: [] }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
        <p className="mt-0.5 text-sm text-slate-500">Your conversation with MTA Admin.</p>
      </div>

      {thread && (
        <ProviderMessageThread
          thread={thread}
          initialMessages={messages}
          accountRole={account.role}
          sendMessageAction={sendProviderMessageAction}
          markMessagesReadAction={markProviderMessagesReadAction}
          requestReopenAction={requestProviderThreadReopenAction}
        />
      )}
    </div>
  )
}
