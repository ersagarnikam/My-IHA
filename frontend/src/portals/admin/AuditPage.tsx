import { useEffect, useState } from 'react'
import { ErrorState, Loading } from '../../components/ui'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { SearchBox } from '../doctor/shared'
import type { AuditEntry, AuditPage } from './types'

/** Who did what. Read-only: the log can't be changed from the portal. */
export function AdminAuditPage() {
  const format = useFormat()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const data = useApi<AuditPage>(`/api/admin/audit?q=${encodeURIComponent(search)}&page=${page}`)
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Audit Log</h1>
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search by action, email or record"
          />
        </div>
        {data.data ? (
          <>
            <AuditTable rows={data.data.rows} format={format} empty="Nothing found." />
            <div className="dr-pager">
              <span className="muted small">{data.data.total} entries</span>
              {data.data.pages > 1 && (
                <div className="row-end">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Newer
                  </button>
                  <span className="muted small">
                    Page {data.data.page + 1} of {data.data.pages}
                  </span>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={page + 1 >= data.data.pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Older
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Loading />
        )}
      </section>
    </div>
  )
}

export function AuditTable({
  rows,
  format,
  empty,
}: {
  rows: AuditEntry[]
  format: ReturnType<typeof useFormat>
  empty: string
}) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Record</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="dr-empty-row">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{format.dateTime(a.createdAt)}</td>
              <td>
                {a.actorEmail ?? 'System'}
                <br />
                <span className="muted small">{a.app}</span>
              </td>
              <td>{a.action}</td>
              <td>
                {a.entityType ?? '—'}
                {a.entityId && (
                  <>
                    <br />
                    <span className="muted small">{a.entityId.slice(0, 8)}</span>
                  </>
                )}
              </td>
              <td className="small muted">{details(a.metadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function details(metadata: string) {
  try {
    return Object.entries(JSON.parse(metadata) as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' · ')
  } catch {
    return metadata
  }
}
