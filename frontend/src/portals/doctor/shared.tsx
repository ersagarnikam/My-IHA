import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
import { Badge } from '../../components/ui'
import { DOCTOR_TIME_ZONE } from '../../lib/format'
import { CONSULTATION_LABELS, caseBadge, consultationStage, type DoctorConsultation } from './types'

export function BackHeader({ to, title, subtitle }: { to: string; title: string; subtitle?: ReactNode }) {
  return (
    <div className="dr-back">
      <Link to={to} aria-label="Back">
        <ArrowLeft size={16} />
      </Link>
      <div>
        <h1 className="dr-title">{title}</h1>
        {subtitle && <p className="muted small">{subtitle}</p>}
      </div>
    </div>
  )
}

export function CaseBadge(props: Parameters<typeof caseBadge>[0]) {
  const [label, tone] = caseBadge(props)
  return (
    <Badge tone={tone} small>
      {label}
    </Badge>
  )
}

export function ConsultationBadge({ consultation }: { consultation: DoctorConsultation }) {
  const [label, tone] = CONSULTATION_LABELS[consultationStage(consultation)] ?? [consultation.status, 'muted']
  return (
    <Badge tone={tone} small>
      {label}
    </Badge>
  )
}

export function PillTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="dr-pills" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? 'dr-pill active' : 'dr-pill'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="dr-search">
      <Search size={14} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Client-side paging with the live portal's "Showing 1–15 of 22 Results" footer. */
export function usePaged<T>(rows: T[], pageSize = 15) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const start = (current - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    footer:
      rows.length === 0 ? null : (
        <div className="dr-pager">
          <span className="muted small">
            Showing {start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length} Results
          </span>
          {pages > 1 && (
            <div className="pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === current ? 'active' : ''}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      ),
    reset: () => setPage(1),
  }
}

const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

/** "21 Oct 2026". Accepts ISO instants and plain yyyy-mm-dd dates (read as calendar dates). */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return dateFormat.format(date)
}

/** "3 November 2026" in Brisbane. */
export function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: DOCTOR_TIME_ZONE,
  })
}

/** "12:30 pm - 1:30 pm (Brisbane Time)". */
export function formatSlotTime(start: string, end: string) {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: DOCTOR_TIME_ZONE,
    })
  return `${time(start)} - ${time(end)} (Brisbane Time)`
}

/** "Tue, 3 Nov 2026, 12:30 pm - 1:30 pm (Brisbane Time)". */
export function formatSlot(start: string, end: string) {
  const day = new Date(start).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: DOCTOR_TIME_ZONE,
  })
  return `${day}, ${formatSlotTime(start, end)}`
}

/** Today's date in Brisbane as yyyy-mm-dd (for date inputs). */
export function brisbaneToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DOCTOR_TIME_ZONE }).format(new Date())
}

export function money(amount: number | null | undefined) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount ?? 0)
}
