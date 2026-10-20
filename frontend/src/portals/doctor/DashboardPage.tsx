import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarPlus, Star } from 'lucide-react'
import { ErrorState, Loading } from '../../components/ui'
import { browserTimeZone, DOCTOR_TIME_ZONE } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { DevDoctorPanel } from './DevPanel'
import { useDoctor } from './DoctorContext'
import { brisbaneToday, CaseBadge, formatDate } from './shared'
import { specialtyLabel, type CaseRow, type DoctorConsultation } from './types'

type Insights = {
  money: {
    earnedYearAud: number
    awaitingTreatmentAud: number
    treatedAud: number
    feesPaidAud: number
    returnMultiple: number | null
    monthly: { month: string; amountAud: number }[]
  }
  patientsTreated: number
  mainSpecialty: string | null
  specialtyTopPercent: number | null
  casesReceived: number
  casesReceivedChangePct: number | null
  planAcceptancePct: number | null
  platformPlanAcceptancePct: number | null
  avgResponseHours: number | null
  profileStrengthPct: number
  funnel: { label: string; count: number }[]
  declineReasons: { label: string; count: number }[]
  benchmark: {
    specialty: string
    yourPlans: number
    yourMedianAud: number
    platformMedianAud: number | null
    differencePct: number | null
  }[]
  benchmarkInsight: string | null
  recentUploads: { caseId: string; referenceNumber: string; count: number }[]
  verification: { label: string; state: 'verified' | 'pending' | 'not_provided' }[]
}

const RESPONSE_TARGET_HOURS = 48

const wholeDollars = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

/** Dashboard amounts are whole dollars ("$48,600"). */
function money(amount: number | null | undefined) {
  return wholeDollars.format(amount ?? 0)
}

export function DashboardPage() {
  const doctor = useDoctor()
  const insights = useApi<Insights>('/api/doctor/insights')
  const cases = useApi<CaseRow[]>('/api/doctor/cases')
  const consultations = useApi<DoctorConsultation[]>('/api/doctor/consultations')

  const error = insights.error ?? cases.error ?? consultations.error
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void insights.reload()
          void cases.reload()
          void consultations.reload()
        }}
      />
    )
  if (!insights.data || !cases.data || !consultations.data) return <Loading />
  const i = insights.data
  const m = i.money
  const reload = () => {
    void insights.reload()
    void cases.reload()
    void consultations.reload()
  }

  return (
    <div className="dash">
      <div className="dash-welcome">
        <div>
          <h1>Welcome back, {doctor.fullName}</h1>
          <p className="muted">Here's how MTA is working for you this year</p>
        </div>
        <p className="muted small">
          {doctor.annualFeeNextDueAt ? `Membership renews ${formatDate(doctor.annualFeeNextDueAt)} · ` : ''}Last 12
          months
        </p>
      </div>

      <section className="dash-hero">
        <div>
          <p className="dash-hero-label">Your return on MTA membership</p>
          <p className="dash-hero-value">
            {money(m.earnedYearAud)} earned
            {m.returnMultiple && (
              <>
                <span className="dash-hero-dot">·</span>
                {m.returnMultiple}× your {money(m.feesPaidAud)} fees
              </>
            )}
          </p>
          {!m.returnMultiple && (
            <p className="dash-hero-note">
              Doctor fees from treatments your patients have paid for will show here.
            </p>
          )}
        </div>
        <div className="dash-hero-stats">
          <HeroStat label="Patients treated" value={i.patientsTreated} />
          <HeroStat
            label={`Rank in ${i.mainSpecialty ?? 'your specialty'}`}
            value={i.specialtyTopPercent ? `Top ${i.specialtyTopPercent}%` : '—'}
          />
          <HeroStat label="Awaiting treatment" value={money(m.awaitingTreatmentAud)} />
        </div>
      </section>

      <div className="dash-stats">
        <Stat label="Cases received" value={i.casesReceived}>
          {i.casesReceivedChangePct !== null && (
            <Trend up={i.casesReceivedChangePct >= 0}>
              {Math.abs(i.casesReceivedChangePct)}% vs last quarter
            </Trend>
          )}
        </Stat>
        <Stat label="Plan acceptance rate" value={i.planAcceptancePct === null ? '—' : `${i.planAcceptancePct}%`}>
          {i.platformPlanAcceptancePct !== null && (
            <Trend up={(i.planAcceptancePct ?? 0) >= i.platformPlanAcceptancePct}>
              Platform avg {i.platformPlanAcceptancePct}%
            </Trend>
          )}
        </Stat>
        <Stat label="Avg response time" value={i.avgResponseHours === null ? '—' : `${formatHours(i.avgResponseHours)}`}>
          <span className={i.avgResponseHours !== null && i.avgResponseHours <= RESPONSE_TARGET_HOURS ? 'dash-good' : 'muted'}>
            Target ≤ {RESPONSE_TARGET_HOURS} h{i.avgResponseHours !== null && i.avgResponseHours <= RESPONSE_TARGET_HOURS && ' ✓'}
          </span>
        </Stat>
        <Stat label="Patient rating" soon value={<Star size={22} className="dash-faint" />}>
          <span className="muted">Patient reviews are coming soon</span>
        </Stat>
        <Stat label="Profile strength" value={`${i.profileStrengthPct}%`}>
          <Link to="/doctor/account-settings" className="dash-bar" aria-label="Complete your profile">
            <span style={{ width: `${i.profileStrengthPct}%` }} />
          </Link>
        </Stat>
      </div>

      <div className="dash-row three">
        <ActionsCard insights={i} cases={cases.data} consultations={consultations.data} />
        <FunnelCard funnel={i.funnel} />
        <DeclinesCard reasons={i.declineReasons} insight={i.benchmarkInsight} />
      </div>

      <div className="dash-row three">
        <BenchmarkCard rows={i.benchmark} />
        <EarningsCard money={m} />
        <MembershipCard insights={i} />
      </div>

      <div className="dash-row four">
        <SoonCard
          title="Patient follow-ups"
          text="Post-treatment check-ins at 7, 30 and 90 days. Outcomes will feed your rating."
        />
        <SoonCard
          title="Hospital packages"
          text="Pre-negotiated packages with your affiliated hospitals, so a plan takes minutes."
        />
        <SoonCard title="Plan templates" text="Reuse costs, aftercare and instructions for common procedures." />
        <SoonCard
          title="Public profile"
          text="A profile page patients can see, with photos and outcome stories."
          action={
            <Link className="button-secondary dash-small-button" to="/doctor/account-settings">
              Edit profile
            </Link>
          }
        />
      </div>

      <DevDoctorPanel
        actions={[{ label: 'Assign me a new case (patient + admin)', path: '/api/dev/doctor/assign-case' }]}
        onChanged={reload}
      />
    </div>
  )
}

function formatHours(hours: number) {
  return hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : `${Math.round(hours)} h`
}

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="dash-hero-stat-label">{label}</p>
      <p className="dash-hero-stat-value">{value}</p>
    </div>
  )
}

function Soon() {
  return <span className="dash-chip">Soon</span>
}

function Stat({
  label,
  value,
  soon,
  children,
}: {
  label: string
  value: ReactNode
  soon?: boolean
  children?: ReactNode
}) {
  return (
    <section className="dash-card dash-stat">
      <p className="dash-stat-label">
        {label} {soon && <Soon />}
      </p>
      <p className="dash-stat-value">{value}</p>
      <div className="dash-stat-foot small">{children}</div>
    </section>
  )
}

function Trend({ up, children }: { up: boolean; children: ReactNode }) {
  return <span className={up ? 'dash-good' : 'dash-bad'}>{up ? '▲' : '▼'} {children}</span>
}

function Card({ title, soon, children }: { title: string; soon?: boolean; children: ReactNode }) {
  return (
    <section className="dash-card">
      <h2 className="dash-card-title">
        {title} {soon && <Soon />}
      </h2>
      {children}
    </section>
  )
}

// ── Action needed today ──────────────────────────────────────────────────

type Action = {
  key: string
  tone: 'red' | 'orange' | 'blue' | 'green'
  title: ReactNode
  detail?: ReactNode
  button: ReactNode
  sort: number
}

function ActionsCard({
  insights,
  cases,
  consultations,
}: {
  insights: Insights
  cases: CaseRow[]
  consultations: DoctorConsultation[]
}) {
  const now = Date.now()
  const today = brisbaneToday()
  const actions: Action[] = []

  for (const c of cases) {
    const ref = <strong>{c.referenceNumber}</strong>
    if (c.assignment.status === 'invited') {
      const hoursLeft = Math.round(
        (new Date(c.assignment.invitedAt).getTime() + RESPONSE_TARGET_HOURS * 3_600_000 - now) / 3_600_000,
      )
      actions.push({
        key: `invite-${c.caseId}`,
        tone: 'red',
        title: (
          <>
            {ref} · {specialtyLabel(c)} · New case
          </>
        ),
        detail:
          hoursLeft > 0
            ? `Respond within ${hoursLeft} h to keep your response time on target`
            : 'Response target passed — reply as soon as you can',
        button: <ActionLink to={`/doctor/cases/${c.caseId}`} primary>Review</ActionLink>,
        sort: 0,
      })
    } else if (c.assignment.status === 'accepted') {
      if (c.planStatus === 'rejected_by_iha')
        actions.push({
          key: `rejected-${c.caseId}`,
          tone: 'orange',
          title: <>{ref} · MTA declined your treatment plan</>,
          detail: 'See the case for details or message MTA',
          button: <ActionLink to={`/doctor/cases/${c.caseId}`} primary>View case</ActionLink>,
          sort: 1,
        })
      else if (
        (c.caseStatus === 'evaluation' || c.caseStatus === 'doctor_assigned') &&
        !c.assignment.evaluationStartedAt
      )
        actions.push({
          key: `start-${c.caseId}`,
          tone: 'orange',
          title: <>{ref} · {specialtyLabel(c)} · Start your evaluation</>,
          detail: 'Review the documents, then book the initial Zoom consultation',
          button: <ActionLink to={`/doctor/cases/${c.caseId}`} primary>Open case</ActionLink>,
          sort: 2,
        })
      else if (!c.assignment.planSubmittedAt && c.initialConsultation === 'none')
        actions.push({
          key: `consult-needed-${c.caseId}`,
          tone: 'blue',
          title: <>{ref} · {specialtyLabel(c)} · Book the initial Zoom consultation</>,
          detail: 'Talk with the patient before preparing the treatment plan',
          button: <ActionLink to={`/doctor/cases/${c.caseId}#initial-consultation`} primary>Propose times</ActionLink>,
          sort: 1,
        })
      else if (
        !c.assignment.planSubmittedAt &&
        (c.initialConsultation === 'held' || c.initialConsultation === 'skipped')
      )
        actions.push({
          key: `plan-${c.caseId}`,
          tone: 'orange',
          title: <>{ref} · {specialtyLabel(c)} · Treatment plan due</>,
          detail: c.initialConsultation === 'held' ? 'Initial consultation held' : 'Consultation skipped',
          button: <ActionLink to={`/doctor/cases/${c.caseId}/treatment-plan`} primary>Build plan</ActionLink>,
          sort: 2,
        })
      else if (
        ['payment_confirmed', 'visa_processing', 'travel_ready'].includes(c.caseStatus) &&
        c.treatmentEndDate &&
        c.treatmentEndDate <= today
      )
        actions.push({
          key: `complete-${c.caseId}`,
          tone: 'green',
          title: <>{ref} · Treatment finished {formatDate(c.treatmentEndDate)}</>,
          detail: 'Confirm the treatment took place to close the case',
          button: <ActionLink to={`/doctor/cases/${c.caseId}`}>Mark completed</ActionLink>,
          sort: 5,
        })
    }
  }

  for (const u of insights.recentUploads)
    actions.push({
      key: `upload-${u.caseId}`,
      tone: 'orange',
      title: (
        <>
          <strong>{u.referenceNumber}</strong> · Patient uploaded {u.count} requested document{u.count === 1 ? '' : 's'}
        </>
      ),
      button: <ActionLink to={`/doctor/cases/${u.caseId}`}>View</ActionLink>,
      sort: 3,
    })

  for (const c of consultations) {
    if (c.status === 'requested')
      actions.push({
        key: `slots-${c.id}`,
        tone: 'blue',
        title: (
          <>
            <strong>Follow-up consultation request</strong> · {c.patientName} · {c.caseReference}
          </>
        ),
        detail: 'The patient wants to discuss your plan — propose up to three times',
        button: <ActionLink to={`/doctor/consultations/${c.id}`} primary>Propose times</ActionLink>,
        sort: 1,
      })
    const slot = c.status === 'scheduled' ? c.slots.find((s) => s.id === c.selectedSlotId) : undefined
    if (slot && new Date(slot.slotEndTime).getTime() > now && new Date(slot.slotTime).getTime() - now < 7 * 86_400_000)
      actions.push({
        key: `consult-${c.id}`,
        tone: 'blue',
        title: (
          <>
            <strong>{c.kind === 'initial' ? 'Initial consultation' : 'Consultation'}</strong> ·{' '}
            {slotLabel(slot.slotTime)}
          </>
        ),
        detail: `${c.patientName} · ${c.caseReference}`,
        button: (
          <button type="button" className="button-secondary dash-small-button" onClick={() => downloadIcs(c, slot)}>
            <CalendarPlus size={14} /> Add to calendar
          </button>
        ),
        sort: 4,
      })
  }

  actions.sort((a, b) => a.sort - b.sort)
  return (
    <Card title="Action needed today">
      {actions.length === 0 ? (
        <p className="muted">You're all caught up.</p>
      ) : (
        <ul className="dash-actions">
          {actions.slice(0, 6).map((a) => (
            <li key={a.key}>
              <span className={`dash-dot ${a.tone}`} />
              <div className="dash-action-text">
                <p>{a.title}</p>
                {a.detail && <p className="muted small">{a.detail}</p>}
              </div>
              {a.button}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ActionLink({ to, primary, children }: { to: string; primary?: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={`dash-small-button ${primary ? 'button' : 'button-secondary'}`}>
      {children}
    </Link>
  )
}

/** "Tue 3 Nov, 1:30 pm (Brisbane) · 12:30 pm your time" */
function slotLabel(iso: string) {
  const fmt = (tz: string, withDay: boolean) =>
    new Date(iso).toLocaleString('en-AU', {
      ...(withDay ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    })
  const local = browserTimeZone()
  const brisbane = `${fmt(DOCTOR_TIME_ZONE, true)} (Brisbane)`
  return local === DOCTOR_TIME_ZONE ? brisbane : `${brisbane} · ${fmt(local, false)} your time`
}

function downloadIcs(c: DoctorConsultation, slot: { slotTime: string; slotEndTime: string }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MTA//Doctor Portal//EN',
    'BEGIN:VEVENT',
    `UID:${c.id}@medicaltourismaustralia.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(slot.slotTime)}`,
    `DTEND:${stamp(slot.slotEndTime)}`,
    `SUMMARY:MTA consultation — ${c.caseReference ?? ''}`,
    `DESCRIPTION:${c.zoomLink ? `Join: ${c.zoomLink}` : 'Zoom link in the MTA doctor portal'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `mta-consultation-${c.caseReference ?? c.id}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ── Funnel, declines ────────────────────────────────────────────────────

function FunnelCard({ funnel }: { funnel: Insights['funnel'] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count))
  return (
    <Card title="Your conversion funnel">
      <div className="dash-funnel">
        {funnel.map((f, idx) => (
          <div key={f.label} className="dash-funnel-row">
            <span>{f.label}</span>
            <div className="dash-funnel-track">
              <span
                className={idx === funnel.length - 1 ? 'last' : `step-${idx}`}
                style={{ width: `${Math.max(f.count / max, 0.06) * 100}%` }}
              >
                {f.count}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small dash-foot">Tip: patients who have a consultation with you are more likely to choose your plan.</p>
    </Card>
  )
}

function DeclinesCard({ reasons, insight }: { reasons: Insights['declineReasons']; insight: string | null }) {
  const max = Math.max(1, ...reasons.map((r) => r.count))
  const total = reasons.reduce((s, r) => s + r.count, 0)
  return (
    <Card title="Why cases didn't proceed">
      {total === 0 ? (
        <p className="muted">Nothing yet — every case you worked on is still going.</p>
      ) : (
        <div className="dash-reasons">
          {reasons.map((r, idx) => (
            <div key={r.label} className="dash-reason">
              <span>{r.label}</span>
              <div className="dash-reason-track">
                <span className={`r${idx}`} style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <strong>{r.count}</strong>
            </div>
          ))}
        </div>
      )}
      {insight && (
        <p className="dash-insight small">
          <strong>Insight:</strong> {insight}
        </p>
      )}
    </Card>
  )
}

// ── Benchmark, earnings, membership ─────────────────────────────────────

function BenchmarkCard({ rows }: { rows: Insights['benchmark'] }) {
  return (
    <Card title="Price benchmark (anonymised)">
      {rows.length === 0 ? (
        <p className="muted">Submit treatment plans to compare your prices with other MTA doctors.</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Specialty</th>
              <th>Your median</th>
              <th>Platform median</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.specialty}>
                <td>{r.specialty}</td>
                <td>{money(r.yourMedianAud)}</td>
                <td>{r.platformMedianAud === null ? <span className="muted small">Not enough data</span> : money(r.platformMedianAud)}</td>
                <td>
                  {r.differencePct !== null && (
                    <span className={`dash-diff ${r.differencePct > 0 ? 'up' : 'down'}`}>
                      {r.differencePct > 0 ? '+' : ''}
                      {r.differencePct}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small dash-foot">Whole-plan totals (doctor, hospital, itemised costs, specialists), before MTA's fee.</p>
    </Card>
  )
}

function EarningsCard({ money: m }: { money: Insights['money'] }) {
  const max = Math.max(1, ...m.monthly.map((x) => x.amountAud))
  const month = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short' })
  return (
    <Card title="Earnings">
      <div className="dash-earn-figures">
        <div>
          <p className="muted small">This year</p>
          <p className="dash-earn">{money(m.earnedYearAud)}</p>
        </div>
        <div>
          <p className="muted small">Awaiting treatment</p>
          <p className="dash-earn orange">{money(m.awaitingTreatmentAud)}</p>
        </div>
        <div>
          <p className="muted small">Treated</p>
          <p className="dash-earn green">{money(m.treatedAud)}</p>
        </div>
      </div>
      <div className="dash-bars" aria-label="Doctor fees by month">
        {m.monthly.map((x, idx) => (
          <span
            key={x.month}
            title={`${month(x.month)}: ${money(x.amountAud)}`}
            className={idx === m.monthly.length - 1 ? 'current' : ''}
            style={{ height: `${Math.max(x.amountAud / max, 0.04) * 100}%` }}
          />
        ))}
      </div>
      <div className="row-between muted small">
        <span>{month(m.monthly[0]?.month ?? "")}</span>
        <span>{month(m.monthly.at(-1)?.month ?? "")}</span>
      </div>
      <p className="muted small dash-foot">
        Doctor fees on treatment plans your patients have paid for. Payouts <Soon />
      </p>
    </Card>
  )
}

function MembershipCard({ insights }: { insights: Insights }) {
  const doctor = useDoctor()
  return (
    <Card title="Membership & growth">
      <div className="dash-box highlight">
        <div>
          <strong>Annual membership</strong>
          <p className="muted small">
            {doctor.annualFeeNextDueAt ? `Renews ${formatDate(doctor.annualFeeNextDueAt)}` : 'Renewal date not set'} ·{' '}
            {money(insights.money.feesPaidAud)} paid to date
          </p>
        </div>
        <Link className="button-secondary dash-small-button" to="/doctor/account-settings?tab=billing">
          Billing
        </Link>
      </div>
      <div className="dash-box">
        <div>
          <strong>Refer a colleague</strong> <Soon />
          <p className="muted small">Invite doctors you trust to join MTA.</p>
        </div>
      </div>
      <p className="dash-subhead">Verification</p>
      <div className="dash-checks">
        {insights.verification.map((v) => (
          <span key={v.label} className={`dash-check ${v.state}`}>
            {v.state === 'verified' ? '✓' : v.state === 'pending' ? '⏳' : '–'} {v.label}
          </span>
        ))}
      </div>
    </Card>
  )
}

function SoonCard({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <Card title={title} soon>
      <p className="muted small">{text}</p>
      {action}
    </Card>
  )
}

// Used by My Cases.
export function CasesTable({ rows, empty }: { rows: CaseRow[]; empty: string }) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Patient Name</th>
            <th>Condition</th>
            <th>Status</th>
            <th>Action</th>
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
          {rows.map((c) => (
            <tr key={c.assignment.id}>
              <td className="strong">{c.referenceNumber}</td>
              <td>{c.patientName}</td>
              <td>{specialtyLabel(c)}</td>
              <td>
                <CaseBadge assignment={c.assignment} caseStatus={c.caseStatus} planStatus={c.planStatus} />
              </td>
              <td>
                <Link className="button dr-view" to={`/doctor/cases/${c.caseId}`}>
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
