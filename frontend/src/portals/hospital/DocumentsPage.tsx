import { useState } from 'react'
import { Link } from 'react-router'
import { ErrorState, Loading, StatusBadge } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import { LetterControls } from './Letters'
import { LETTER_TYPES, type CaseDetail, type CaseRow, type Letter } from './types'

type Tab = 'todo' | 'all'

/**
 * Visa letters across every case whose patient chose and paid for this
 * hospital's plan (old Documents hub). Each row loads its letters on demand.
 */
export function HospitalDocumentsPage() {
  const list = useApi<CaseRow[]>('/api/hospital/letters')
  const [tab, setTab] = useState<Tab>('todo')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (r) =>
      (tab === 'all' || r.lettersSent < 2) &&
      (!q ||
        r.referenceNumber.toLowerCase().includes(q) ||
        (r.patientName ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  const waiting = list.data.filter((r) => r.lettersSent < 2).length

  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Documents</h1>
        <p className="muted" style={{ margin: 0 }}>
          Visa-support letters for patients who chose and paid for treatment at your hospital. The
          patient can apply for their visa once both letters are sent.
        </p>
      </div>
      <PillTabs
        tabs={[
          { id: 'todo', label: `Waiting for letters (${waiting})` },
          { id: 'all', label: 'All' },
        ]}
        active={tab}
        onChange={(t) => {
          setTab(t)
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search by patient or case ID" />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table hp-letters-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Patient</th>
                <th>Admission</th>
                <th>Case status</th>
                {LETTER_TYPES.map((l) => (
                  <th key={l.type}>{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="dr-empty-row">
                    {tab === 'todo' ? 'All letters have been sent.' : 'No paid treatments yet.'}
                  </td>
                </tr>
              )}
              {paged.rows.map((r) => (
                <LetterRow key={r.planId} row={r} onChanged={list.reload} />
              ))}
            </tbody>
          </table>
        </div>
        {paged.footer}
      </section>
    </div>
  )
}

function LetterRow({ row, onChanged }: { row: CaseRow; onChanged: () => void }) {
  const detail = useApi<CaseDetail>(`/api/hospital/cases/${row.planId}`)
  const letters: Letter[] =
    detail.data?.letters ??
    LETTER_TYPES.map((l) => ({
      type: l.type,
      label: l.label,
      fileName: null,
      generatedAt: null,
      sentAt: null,
    }))
  return (
    <tr>
      <td className="strong">
        <Link to={`/hospital/cases/${row.planId}`}>{row.referenceNumber}</Link>
      </td>
      <td>{row.patientName ?? '—'}</td>
      <td>{formatDate(row.admissionDate)}</td>
      <td>
        <StatusBadge status={row.caseStatus} small />
      </td>
      {letters.map((l) => (
        <td key={l.type}>
          {detail.data ? (
            <LetterControls
              compact
              planId={row.planId}
              reference={row.referenceNumber}
              letter={l}
              onChange={() => {
                void detail.reload()
                onChanged()
              }}
            />
          ) : (
            <span className="muted small">…</span>
          )}
        </td>
      ))}
    </tr>
  )
}
