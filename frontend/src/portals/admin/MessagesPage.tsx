import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useOutletContext, useSearchParams } from 'react-router'
import { ErrorState, FormError, Loading } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import type { AdminOutletContext } from './AdminLayout'
import type { Thread, ThreadRow } from './types'

const ACCOUNT_LABEL: Record<string, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital: 'Hospital',
  lawyer: 'Visa lawyer',
}

/** Coordinator inbox: patient and provider support chats side by side. */
export function AdminMessagesPage() {
  const format = useFormat()
  const [params, setParams] = useSearchParams()
  const list = useApi<ThreadRow[]>('/api/admin/chats')
  const selected = params.get('thread')
  const selectedKind = params.get('kind') ?? 'patient'
  const [filter, setFilter] = useState<'all' | 'patient' | 'provider'>('all')

  // New patient/provider messages don't push to admins yet; poll the inbox.
  useEffect(() => {
    const timer = setInterval(() => void list.reload(), 20_000)
    return () => clearInterval(timer)
  }, [list.reload])

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  const rows = list.data.filter((r) => filter === 'all' || r.kind === filter)

  return (
    <div className="dr-page">
      <h1 className="dr-title">Messages</h1>
      <div className="admin-inbox">
        <section className="dr-card admin-thread-list">
          <div className="dr-pills" style={{ marginBottom: '0.75rem' }}>
            {(['all', 'patient', 'provider'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? 'dr-pill active' : 'dr-pill'}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'patient' ? 'Patients' : 'Providers'}
              </button>
            ))}
          </div>
          {rows.length === 0 && <p className="muted">No conversations.</p>}
          <ul className="admin-threads">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  type="button"
                  className={`admin-thread${selected === r.id ? ' active' : ''}`}
                  onClick={() => setParams({ kind: r.kind, thread: r.id })}
                >
                  <span className="row-between">
                    <strong>{r.name ?? 'Unknown'}</strong>
                    {r.unread > 0 && <span className="count-badge">{r.unread}</span>}
                  </span>
                  <span className="muted small">
                    {ACCOUNT_LABEL[r.accountType]} · {r.status === 'open' ? 'Open' : 'Closed'}
                    {r.status === 'closed' && r.reopenRequestedAt && (
                      <span className="badge badge-sm badge-warn" style={{ marginLeft: 6 }}>
                        Reopen requested
                      </span>
                    )}
                  </span>
                  {r.lastMessage && (
                    <span className="small muted admin-thread-preview">
                      {r.lastMessage.senderType === 'admin' ? 'You: ' : ''}
                      {r.lastMessage.body} · {format.relative(r.lastMessage.createdAt)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="dr-card admin-thread-pane">
          {selected ? (
            <ThreadPane key={selected} kind={selectedKind} id={selected} onChanged={list.reload} />
          ) : (
            <p className="muted">Choose a conversation.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function ThreadPane({ kind, id, onChanged }: { kind: string; id: string; onChanged: () => void }) {
  const format = useFormat()
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  const thread = useApi<Thread>(`/api/admin/chats/${kind}/${id}`)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  // Opening the thread marks the other side's messages read.
  useEffect(() => {
    if (thread.data) {
      onChanged()
      refreshCounts()
    }
  }, [thread.data?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [thread.data?.messages.length])

  if (thread.error) return <ErrorState error={thread.error} onRetry={thread.reload} />
  if (!thread.data) return <Loading />
  const t = thread.data

  async function act(path: string, body?: unknown) {
    setPending(true)
    setError(null)
    try {
      thread.setData(await apiPost<Thread>(`/api/admin/chats/${kind}/${id}/${path}`, body))
      onChanged()
      refreshCounts()
      return true
    } catch (err) {
      setError(err)
      return false
    } finally {
      setPending(false)
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    if (await act('messages', { body: draft })) setDraft('')
  }

  return (
    <div className="stack" style={{ height: '100%' }}>
      <div className="row-between">
        <div>
          <strong>{t.name}</strong>{' '}
          <span className="muted small">· {ACCOUNT_LABEL[t.accountType]}</span>
        </div>
        {t.status === 'open' ? (
          <button
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={() => act('close')}
          >
            Close conversation
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => act('open')}>
            Open conversation
          </button>
        )}
      </div>
      {t.status === 'closed' && t.reopenRequestedAt && (
        <div className="dr-banner">
          Asked to reopen {format.relative(t.reopenRequestedAt)}: “{t.reopenReason}”
        </div>
      )}
      <div className="chat-messages admin-chat">
        {t.messages.length === 0 && <p className="muted">No messages yet.</p>}
        {t.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.senderType === 'admin' ? 'mine' : 'theirs'}`}>
            <p className="prewrap">{m.body}</p>
            <span className="small muted">{format.dateTime(m.createdAt)}</span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="chat-compose" onSubmit={send}>
        <textarea
          rows={2}
          maxLength={5000}
          value={draft}
          placeholder={
            t.status === 'open'
              ? 'Write a reply…'
              : 'Sending a message keeps the conversation closed for them — open it so they can reply.'
          }
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={pending || !draft.trim()}>
          Send
        </button>
      </form>
      <FormError error={error} />
    </div>
  )
}
