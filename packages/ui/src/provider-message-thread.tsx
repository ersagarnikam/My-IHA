'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@iha/db/client'
import type { ProviderMessage, ProviderMessageThread as ProviderMessageThreadRow } from '@iha/db/types'
import type { Result } from '@iha/validations'
import { Button } from './button'
import { formatRelativeTime } from './lib/format-relative-time'
import { RequestReopenModal } from './request-reopen-modal'

type Props = {
  thread: ProviderMessageThreadRow
  initialMessages: ProviderMessage[]
  accountRole: string
  sendMessageAction: (threadId: string, body: string) => Promise<Result<{ success: true }>>
  markMessagesReadAction: (threadId: string) => Promise<void>
  requestReopenAction: (threadId: string, reason: string) => Promise<Result<{ success: true }>>
}

export function ProviderMessageThread({
  thread,
  initialMessages,
  accountRole,
  sendMessageAction,
  markMessagesReadAction,
  requestReopenAction,
}: Props) {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reopenRequestedAt, setReopenRequestedAt] = useState(thread.reopen_requested_at ?? null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isOpen = thread.status === 'open'

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`provider-messages:${thread.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'provider_messages', filter: `thread_id=eq.${thread.id}` },
          (payload) => {
            const row = payload.new as ProviderMessage
            setMessages((prev) => [...prev, row])
            if (row.sender_type === 'admin') void markMessagesReadAction(thread.id)
          },
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [thread.id, markMessagesReadAction])

  useEffect(() => {
    if (messages.some((m) => m.sender_type === 'admin' && !m.read)) {
      void markMessagesReadAction(thread.id)
    }
  }, [thread.id, messages, markMessagesReadAction])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!draft.trim() || sending) return
    setSending(true)
    setError(null)
    const { error: sendError } = await sendMessageAction(thread.id, draft)
    if (sendError) {
      setError(typeof sendError === 'string' ? sendError : 'Failed to send message.')
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
              <p className="text-sm text-slate-400">No messages yet. Say hello to MTA Admin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const isOwn = message.sender_type === accountRole
                return (
                  <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        isOwn ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p className={`mt-1 text-[11px] ${isOwn ? 'text-cyan-100' : 'text-slate-400'}`}>
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
              <p>
                {reopenRequestedAt
                  ? 'Your request to reopen this conversation is pending review by MTA Admin.'
                  : 'This conversation has been closed by MTA Admin.'}
              </p>
              {!reopenRequestedAt && (
                <button
                  type="button"
                  onClick={() => setShowRequestModal(true)}
                  className="shrink-0 font-medium text-cyan-600 hover:text-cyan-700"
                >
                  Request chat with admin
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
              placeholder="Type a message..."
              rows={2}
              className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
            <Button onClick={handleSend} disabled={!isOpen || sending || !draft.trim()} size="sm">
              Send
            </Button>
          </div>
        </div>
      </div>

      {showRequestModal && (
        <RequestReopenModal
          threadId={thread.id}
          requestReopenAction={requestReopenAction}
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
