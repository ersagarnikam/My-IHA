import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { fetchChatThreadForPatient, fetchChatMessages } from '@iha/db/chat'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { getTranslations } from 'next-intl/server'
import { ChatThread } from '@/components/chat/chat-thread'

export default async function MessagesPage() {
  const user = await getAuthUser()

  if (!user) redirect('/login')

  const patient = await fetchPatientByUserId(user.id)

  const t = await getTranslations('messages')

  if (!patient) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
      </div>
    )
  }

  const { data: thread } = await fetchChatThreadForPatient(patient.id)
  const { data: messages } = thread ? await fetchChatMessages(thread.id) : { data: [] }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <ChatThread thread={thread} initialMessages={messages} />
    </div>
  )
}
