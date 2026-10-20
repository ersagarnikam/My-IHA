'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@iha/db/client'
import type { ChatMessage, ChatThread as ChatThreadRow } from '@iha/db/types'
import { Button } from '@iha/ui'
import { sendChatMessage, markChatMessagesAsRead } from '@/lib/actions/chat'
import { formatRelativeTime } from '@/lib/format-relative-time'
import { RequestReopenModal } from './request-reopen-modal'

type Props = {
  thread: ChatThreadRow | null
  initialMessages: ChatMessage[]
}

export function ChatThread({ thread, initialMessages }: Props) {
  const t = useTranslations('messages')
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reopenRequestedAt, setReopenRequestedAt] = useState(thread?.reopen_requested_at ?? null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isOpen = thread?.status === 'open'

  useEffect(() => {
    if (!thread) return
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`chat-messages:${thread.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${thread.id}` },
          (payload) => {
            const row = payload.new as ChatMessage
            setMessages((prev) => [...prev, row])
            if (row.sender_type === 'admin') void markChatMessagesAsRead(thread.id)
          },
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [thread])

  useEffect(() => {
    if (thread && messages.some((m) => m.sender_type === 'admin' && !m.read)) {
      void markChatMessagesAsRead(thread.id)
    }
  }, [thread, messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!thread || !draft.trim() || sending) return
    setSending(true)
    setError(null)
    const { error: sendError } = await sendChatMessage(thread.id, draft)
    if (sendError) {
      setError(sendError)
    } else {
      setDraft('')
    }
    setSending(false)
  }

  return (
    <>
      <div className="flex h-[60vh] flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-slate-400">{t('empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const isPatient = message.sender_type === 'patient'
                return (
                  <div key={message.id} className={`flex ${isPatient ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        isPatient ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p className={`mt-1 text-[11px] ${isPatient ? 'text-cyan-100' : 'text-slate-400'}`}>
                        {formatRelativeTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-3">
          {!isOpen && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <p>{reopenRequestedAt ? t('reopenRequestedBanner') : t('closedBanner')}</p>
              {!reopenRequestedAt && (
                <button
                  type="button"
                  onClick={() => setShowRequestModal(true)}
                  className="shrink-0 font-medium text-cyan-600 hover:text-cyan-700"
                >
                  {t('requestReopen')}
                </button>
              )}
            </div>
          )}
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              disabled={!isOpen || sending}
              placeholder={t('placeholder')}
              rows={2}
              className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
            <Button onClick={handleSend} disabled={!isOpen || sending || !draft.trim()} size="sm">
              {t('send')}
            </Button>
          </div>
        </div>
      </div>

      {showRequestModal && thread && (
        <RequestReopenModal
          threadId={thread.id}
          onClose={() => setShowRequestModal(false)}
          onSuccess={() => {
            setReopenRequestedAt(new Date().toISOString())
            setShowRequestModal(false)
          }}
        />
      )}
    </>
  )
}
