import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useOutletContext } from 'react-router'
import { useToast } from '../../components/Toasts'
import { ErrorState, Field, FormError, fieldError, Loading, Modal } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { apiPost } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useRealtime } from '../../lib/realtime'
import type { ChatMessage, ChatThread } from '../../lib/types'
import { useApi } from '../../lib/useApi'
import { DevChatPanel } from './DevPanel'

/** The single support thread with MTA (old ChatThread). */
export function MessagesPage() {
  const t = useT('messages')
  const format = useFormat()
  const { refreshChatUnread } = useOutletContext<{ refreshChatUnread: () => void }>()
  const thread = useApi<ChatThread>('/api/patient/chat')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [reopenOpen, setReopenOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useRealtime<ChatMessage>('chat_message', (message) => {
    if (!thread.data || thread.data.messages.some((m) => m.id === message.id)) return
    thread.setData({ ...thread.data, messages: [...thread.data.messages, message] })
  })

  // Reading the page marks coordinator messages read.
  const unread = thread.data?.messages.some((m) => m.senderType === 'admin' && !m.read)
  useEffect(() => {
    if (unread) void apiPost('/api/patient/chat/read').then(refreshChatUnread)
  }, [unread, thread.data?.messages.length, refreshChatUnread])

  // Block body on purpose: newer browsers return a Promise from scrollIntoView, which an effect must not return.
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
      const message = await apiPost<ChatMessage>('/api/patient/chat/messages', { body: draft })
      thread.setData({
        ...data,
        messages: [...data.messages.filter((m) => m.id !== message.id), message],
      })
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
    <section className="stack chat-page">
      <div>
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
      </div>
      <div className="card chat">
        <div className="chat-messages">
          {data.messages.length === 0 && <p className="muted">{t('empty')}</p>}
          {data.messages.map((m) => (
            <div key={m.id} className={`bubble ${m.senderType === 'patient' ? 'mine' : 'theirs'}`}>
              <p className="prewrap">{m.body}</p>
              <span className="small muted">{format.dateTime(m.createdAt)}</span>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {closed ? (
          <div className="notice row-between">
            <span>{data.reopenRequestedAt ? t('reopenRequestedBanner') : t('closedBanner')}</span>
            {!data.reopenRequestedAt && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setReopenOpen(true)}
              >
                {t('requestReopen')}
              </button>
            )}
          </div>
        ) : (
          <form className="chat-compose" onSubmit={send}>
            <textarea
              rows={2}
              value={draft}
              maxLength={5000}
              placeholder={t('placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              {t('send')}
            </button>
          </form>
        )}
        <FormError error={error} />
      </div>
      <DevChatPanel closed={closed} onChanged={thread.reload} />
      <ReopenModal open={reopenOpen} onClose={() => setReopenOpen(false)} onSent={thread.reload} />
    </section>
  )
}

function ReopenModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean
  onClose: () => void
  onSent: () => void
}) {
  const t = useT('messages.reopenModal')
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
      await apiPost('/api/patient/chat/reopen-request', { reason })
      toast({ title: t('successToast'), tone: 'good' })
      onClose()
      onSent()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">{t('description')}</p>
        <Field
          label={t('reasonLabel')}
          error={
            fieldError(error, 'reason') ??
            (reason && tooShort ? t('validation.reasonMinLength') : undefined)
          }
        >
          <textarea
            rows={4}
            maxLength={500}
            value={reason}
            placeholder={t('reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" disabled={tooShort || pending}>
            {pending ? t('submitting') : t('submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
