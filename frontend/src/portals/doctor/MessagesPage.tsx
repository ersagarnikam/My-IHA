import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { useToast } from '../../components/Toasts'
import { Empty, ErrorState, Field, FormError, fieldError, Loading, Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import type { Notification } from '../../lib/cases'
import { useFormat } from '../../lib/format'
import { useRealtime } from '../../lib/realtime'
import { useApi } from '../../lib/useApi'
import { DevDoctorPanel } from './DevPanel'
import { doctorNotificationHref, type DoctorOutletContext } from './DoctorLayout'

type Message = { id: string; senderType: string; body: string; read: boolean; createdAt: string }

type Thread = {
  id: string
  status: 'open' | 'closed'
  reopenRequestedAt: string | null
  unread: number
  messages: Message[]
}

/** The doctor's support thread with MTA (old provider messages page). */
export function MessagesPage() {
  const format = useFormat()
  const { refreshMessagesUnread } = useOutletContext<DoctorOutletContext>()
  const thread = useApi<Thread>('/api/doctor/messages')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [reopenOpen, setReopenOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useRealtime<Message>('provider_message', (message) => {
    if (!thread.data || thread.data.messages.some((m) => m.id === message.id)) return
    thread.setData({ ...thread.data, messages: [...thread.data.messages, message] })
  })

  const unread = thread.data?.messages.some((m) => m.senderType === 'admin' && !m.read)
  useEffect(() => {
    if (unread) void apiPost('/api/doctor/messages/read').then(refreshMessagesUnread)
  }, [unread, thread.data?.messages.length, refreshMessagesUnread])

  // Block body on purpose: newer browsers return a Promise from scrollIntoView.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [thread.data?.messages.length])

  if (thread.error) return <ErrorState error={thread.error} onRetry={thread.reload} />
  if (!thread.data) return <Loading />
  const data = thread.data
  const closed = data.status === 'closed'

  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    setError(null)
    try {
      const message = await apiPost<Message>('/api/doctor/messages', { body: draft })
      thread.setData({ ...data, messages: [...data.messages.filter((m) => m.id !== message.id), message] })
      setDraft('')
    } catch (err) {
      setError(err)
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <section className="dr-page chat-page">
      <div>
        <h1 className="dr-title">Messages</h1>
        <p className="muted">Chat with your MTA coordinator</p>
      </div>
      <div className="card chat">
        <div className="chat-messages">
          {data.messages.length === 0 && <p className="muted">No messages yet.</p>}
          {data.messages.map((m) => (
            <div key={m.id} className={`bubble ${m.senderType === 'admin' ? 'theirs' : 'mine'}`}>
              <p className="prewrap">{m.body}</p>
              <span className="small muted">{format.dateTime(m.createdAt)}</span>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {closed ? (
          <div className="notice row-between">
            <span>
              {data.reopenRequestedAt
                ? 'Your request to reopen this conversation has been sent. MTA will get back to you shortly.'
                : 'This conversation is closed. MTA opens it when they need to reach you, or you can ask to reopen it.'}
            </span>
            {!data.reopenRequestedAt && (
              <button type="button" className="button-secondary" onClick={() => setReopenOpen(true)}>
                Request to reopen
              </button>
            )}
          </div>
        ) : (
          <form className="chat-compose" onSubmit={send}>
            <textarea
              rows={2}
              value={draft}
              maxLength={5000}
              placeholder="Type your message…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              Send
            </button>
          </form>
        )}
        <FormError error={error} />
      </div>
      {closed && (
        <DevDoctorPanel
          actions={[{ label: 'Open chat as MTA coordinator (admin)', path: '/api/dev/doctor/chat/open' }]}
          onChanged={thread.reload}
        />
      )}
      <ReopenModal open={reopenOpen} onClose={() => setReopenOpen(false)} onSent={thread.reload} />
    </section>
  )
}

function ReopenModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const tooShort = reason.trim().length < 10

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await apiPost('/api/doctor/messages/reopen-request', { reason })
      toast({ title: 'Request sent.', tone: 'good' })
      onClose()
      onSent()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request to reopen">
      <form className="stack" onSubmit={submit}>
        <p className="muted">Tell MTA what you'd like to discuss.</p>
        <Field
          label="Reason"
          error={fieldError(error, 'reason') ?? (reason && tooShort ? 'Please write at least 10 characters.' : undefined)}
        >
          <textarea rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={tooShort || pending}>
            {pending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function NotificationsPage() {
  const format = useFormat()
  const navigate = useNavigate()
  const list = useApi<Notification[]>('/api/notifications?limit=200')
  useRealtime('notification', () => void list.reload())

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  async function open(n: Notification) {
    if (!n.read) await apiPost(`/api/notifications/${n.id}/read`).catch(() => {})
    navigate(doctorNotificationHref(n))
  }

  return (
    <section className="dr-page narrow">
      <div className="row-between">
        <h1 className="dr-title">Notifications</h1>
        {list.data.some((n) => !n.read) && (
          <button
            type="button"
            className="button-secondary"
            onClick={async () => {
              await apiPost('/api/notifications/read-all')
              void list.reload()
            }}
          >
            Mark all as read
          </button>
        )}
      </div>
      {list.data.length === 0 ? (
        <Empty title="No notifications yet." />
      ) : (
        <ul className="notification-list card">
          {list.data.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`notification-row${n.read ? '' : ' unread'}`}
                onClick={() => open(n)}
              >
                <span className="notification-title">{n.title}</span>
                <span className="small">{n.message}</span>
                <span className="small muted">{format.relative(n.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
