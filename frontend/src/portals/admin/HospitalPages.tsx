import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Download, Eye, FileText } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, Loading } from '../../components/ui'
import { ApiError, apiPost, openFile } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import type { AdminOutletContext } from './AdminLayout'
import { VerificationCard, type Verifications } from './Verification'
import { Fact, ReasonDialog } from './DoctorPages'
import { DOCTOR_STATUS, Pill } from './types'

type HospitalRow = {
  id: string
  name: string
  email: string | null
  city: string
  country: string
  specialties: string[]
  status: 'pending' | 'approved' | 'rejected' | 'more_info_requested'
  createdAt: string
  doctors: number
  plans: number
}

type HospitalDetail = {
  hospital: HospitalRow
  registrationNumber: string | null
  abnNumber: string | null
  phone: string | null
  address: string | null
  zipCode: string | null
  registrationType: string | null
  bedCount: number | null
  roomTypes: string[]
  licenseNumber: string | null
  accreditationBody: string | null
  accreditationExpiresOn: string | null
  licenceExpiresOn: string | null
  rejectionReason: string | null
  moreInfoMessage: string | null
  documents: {
    index: number
    fileName: string
    category: string
    mimeType: string
    fileSizeBytes: number
  }[]
}

type Tab = 'pending' | 'more_info_requested' | 'approved' | 'rejected' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'more_info_requested', label: 'More Info Requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

const CATEGORY: Record<string, string> = {
  license: 'Hospital license',
  registration_certificate: 'Registration certificate',
  other: 'Other document',
}

const TYPES: Record<string, string> = {
  multi_specialty: 'Multi-specialty',
  single_specialty: 'Single specialty',
}

/** Hospitals that registered through the hospital portal (old admin hospital approvals). */
export function AdminHospitalsPage() {
  const list = useApi<HospitalRow[]>('/api/admin/hospitals')
  const [tab, setTab] = useState<Tab>('pending')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (h) =>
      (tab === 'all' || h.status === tab) &&
      (!q ||
        h.name.toLowerCase().includes(q) ||
        (h.email ?? '').toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <h1 className="dr-title">Hospital Approvals</h1>
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={(t) => {
          setTab(t)
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search by name, email or city"
          />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Hospital</th>
                <th>Location</th>
                <th>Specialties</th>
                <th>Registered</th>
                <th>Doctors</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="dr-empty-row">
                    No hospitals here.
                  </td>
                </tr>
              )}
              {paged.rows.map((h) => (
                <tr key={h.id}>
                  <td>
                    <span className="strong">{h.name}</span>
                    <br />
                    <span className="muted small">{h.email}</span>
                  </td>
                  <td>
                    {h.city}, {h.country}
                  </td>
                  <td className="small">{h.specialties.join(', ')}</td>
                  <td>{formatDate(h.createdAt)}</td>
                  <td>{h.doctors}</td>
                  <td>
                    <Pill map={DOCTOR_STATUS} value={h.status} />
                  </td>
                  <td>
                    <Link className="button dr-view" to={`/admin/hospitals/${h.id}`}>
                      {h.status === 'pending' ? 'Review' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged.footer}
      </section>
    </div>
  )
}

export function AdminHospitalDetailPage() {
  const { hospitalId } = useParams()
  const format = useFormat()
  const toast = useToast()
  const detail = useApi<HospitalDetail>(`/api/admin/hospitals/${hospitalId}`)
  const checks = useApi<Verifications>(`/api/admin/verifications/hospital/${hospitalId}`)
  const [dialog, setDialog] = useState<'rejected' | 'more_info_requested' | null>(null)
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const d = detail.data
  const h = d.hospital
  const docPath = (i: number) => `/api/admin/hospitals/${h.id}/documents/${i}`

  async function approve() {
    try {
      await apiPost(`/api/admin/hospitals/${h.id}/review`, { outcome: 'approved' })
      toast({
        title: `${h.name} approved. Doctors can now pick it as an affiliation.`,
        tone: 'good',
      })
      void detail.reload()
      refreshCounts()
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not approve this registration.',
        tone: 'bad',
      })
    }
  }

  return (
    <div className="dr-page">
      <BackHeader to="/admin/hospitals" title={h.name} subtitle={h.email ?? undefined} />

      <section className="dr-card row-between">
        <div>
          <Pill map={DOCTOR_STATUS} value={h.status} />{' '}
          <span className="muted small">
            Registered {formatDate(h.createdAt)} · {h.doctors} affiliated doctors · {h.plans}{' '}
            treatment plans
          </span>
        </div>
        {h.status === 'pending' && (
          <div className="dr-actions">
            <button
              type="button"
              onClick={approve}
              disabled={!checks.data?.allPassing}
              title={
                checks.data?.allPassing
                  ? undefined
                  : 'Record passing accreditation and licence checks first'
              }
            >
              Approve
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setDialog('more_info_requested')}
            >
              Request more info
            </button>
            <button type="button" className="button-danger" onClick={() => setDialog('rejected')}>
              Reject
            </button>
          </div>
        )}
      </section>

      {(d.moreInfoMessage || d.rejectionReason) && (
        <div className={`dr-banner${d.rejectionReason ? ' bad' : ''}`}>
          {d.rejectionReason
            ? `Rejected: ${d.rejectionReason}`
            : `More information requested: ${d.moreInfoMessage}`}
        </div>
      )}

      {checks.data && (
        <VerificationCard
          providerType="hospital"
          providerId={h.id}
          data={checks.data}
          onChange={() => void checks.reload()}
        />
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Hospital details</h2>
        <div className="dr-kv">
          <Fact
            label="Hospital type"
            value={d.registrationType ? (TYPES[d.registrationType] ?? d.registrationType) : null}
          />
          <Fact label="Registration number" value={d.registrationNumber} />
          <Fact label="ABN" value={d.abnNumber} />
          <Fact label="License number" value={d.licenseNumber} />
          <Fact label="Accreditation body" value={d.accreditationBody} />
          <Fact
            label="Accreditation expires (declared)"
            value={d.accreditationExpiresOn ? formatDate(d.accreditationExpiresOn) : null}
          />
          <Fact
            label="Licence expires (declared)"
            value={d.licenceExpiresOn ? formatDate(d.licenceExpiresOn) : null}
          />
          <Fact label="Number of beds" value={d.bedCount} />
          <Fact label="Phone" value={d.phone} />
          <Fact
            label="Address"
            value={[d.address, h.city, d.zipCode, h.country].filter(Boolean).join(', ')}
            className="full"
          />
          <Fact label="Specialties" value={h.specialties.join(', ')} className="full" />
          <Fact label="Room types" value={d.roomTypes.join(', ')} className="full" />
        </div>
      </section>

      <section className="dr-card">
        <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
          Documents
        </h2>
        <ul className="dr-files">
          {d.documents.map((f) => (
            <li key={f.index} className="dr-file">
              <span className="dr-file-icon pdf">
                <FileText size={16} />
              </span>
              <div className="dr-file-body">
                <p className="dr-file-name">{f.fileName}</p>
                <p className="muted small" style={{ margin: 0 }}>
                  {CATEGORY[f.category] ?? f.category} · {format.bytes(f.fileSizeBytes)}
                </p>
              </div>
              <button
                type="button"
                className="dr-icon-button"
                aria-label={`View ${f.fileName}`}
                onClick={() => openFile(docPath(f.index))}
              >
                <Eye size={16} />
              </button>
              <button
                type="button"
                className="dr-icon-button"
                aria-label={`Download ${f.fileName}`}
                onClick={() => openFile(`${docPath(f.index)}?download=true`, f.fileName)}
              >
                <Download size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ReasonDialog
        open={dialog !== null}
        title={dialog === 'rejected' ? 'Reject registration' : 'Request more information'}
        description={
          dialog === 'rejected'
            ? 'The hospital sees this reason and can update and resubmit its registration.'
            : 'Tell the hospital exactly what to change or upload. It can update and resubmit.'
        }
        confirmLabel={dialog === 'rejected' ? 'Reject' : 'Send request'}
        danger={dialog === 'rejected'}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await apiPost(`/api/admin/hospitals/${h.id}/review`, { outcome: dialog, reason })
          toast({
            title:
              dialog === 'rejected' ? 'Registration rejected.' : 'Request sent to the hospital.',
            tone: 'good',
          })
          setDialog(null)
          void detail.reload()
          refreshCounts()
        }}
      />
    </div>
  )
}
