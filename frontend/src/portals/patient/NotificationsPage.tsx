import { useNavigate } from 'react-router'
import { Empty, ErrorState, Loading } from '../../components/ui'
import { useT } from '../../i18n/I18nContext'
import { apiPost } from '../../lib/api'
import type { Notification } from '../../lib/cases'
import { useFormat } from '../../lib/format'
import { useRealtime } from '../../lib/realtime'
import { useApi } from '../../lib/useApi'
import { notificationHref } from './notificationRouting'

export function NotificationsPage() {
  const t = useT('notifications')
  const format = useFormat()
  const navigate = useNavigate()
  const list = useApi<Notification[]>('/api/notifications?limit=200')
  useRealtime('notification', () => void list.reload())

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  async function open(n: Notification) {
    if (!n.read) await apiPost(`/api/notifications/${n.id}/read`).catch(() => {})
    navigate(await notificationHref(n))
  }

  return (
    <section className="stack narrow">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        {list.data.some((n) => !n.read) && (
          <button
            type="button"
            className="button-secondary"
            onClick={async () => {
              await apiPost('/api/notifications/read-all')
              void list.reload()
            }}
          >
            {t('markAllAsRead')}
          </button>
        )}
      </div>
      {list.data.length === 0 ? (
        <Empty title={t('empty')} />
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
