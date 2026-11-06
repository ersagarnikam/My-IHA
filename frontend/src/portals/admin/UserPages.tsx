import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { UserPlus } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { ErrorState, Field, FormError, Loading, Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { fieldError } from '../../components/ui'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../auth/AuthContext'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import { AuditTable } from './AuditPage'
import { Fact } from './DoctorPages'
import type { AdminUser, AdminUserDetail, UserRole } from './types'

type Tab = 'all' | UserRole | 'suspended'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'PATIENT', label: 'Patients' },
  { id: 'DOCTOR', label: 'Doctors' },
  { id: 'HOSPITAL', label: 'Hospitals' },
  { id: 'LAWYER', label: 'Lawyers' },
  { id: 'ADMIN', label: 'MTA Staff' },
  { id: 'suspended', label: 'Suspended' },
]

const ROLE_LABEL: Record<UserRole, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  HOSPITAL: 'Hospital',
  LAWYER: 'Visa lawyer',
  ADMIN: 'MTA staff',
}

const STATUS: Record<AdminUser['status'], [string, string]> = {
  active: ['Active', 'badge-good'],
  unverified: ['Email not verified', 'badge-warn'],
  suspended: ['Suspended', 'badge-bad'],
  closed: ['Closed', 'badge-muted'],
}

const PROVIDER_PAGE: Partial<Record<UserRole, string>> = {
  DOCTOR: 'doctors',
  HOSPITAL: 'hospitals',
  LAWYER: 'lawyers',
}

function UserStatus({ status }: { status: AdminUser['status'] }) {
  const [label, tone] = STATUS[status]
  return <span className={`badge badge-sm ${tone}`}>{label}</span>
}

export function AdminUsersPage() {
  const list = useApi<AdminUser[]>('/api/admin/users')
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (u) =>
      (tab === 'all' || (tab === 'suspended' ? u.status === 'suspended' : u.role === tab)) &&
      (!q || (u.name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="dr-page">
      <div className="row-between">
        <h1 className="dr-title">Users</h1>
        <button type="button" onClick={() => setAdding(true)}>
          <UserPlus size={16} /> Add MTA staff
        </button>
      </div>
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={(id) => {
          setTab(id)
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Search by name or email" />
        </div>
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="dr-empty-row">
                    No users here.
                  </td>
                </tr>
              )}
              {paged.rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="strong">{u.name ?? u.email ?? 'Closed account'}</span>
                    {u.name && u.email && (
                      <>
                        <br />
                        <span className="muted small">{u.email}</span>
                      </>
                    )}
                  </td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <UserStatus status={u.status} />
                  </td>
                  <td>
                    <Link className="button dr-view" to={`/admin/users/${u.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged.footer}
      </section>
      <AddStaffDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => void list.reload()}
      />
    </div>
  )
}

function AddStaffDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const toast = useToast()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setPending(true)
    setError(null)
    try {
      await apiPost('/api/admin/users/admins', {
        email: new FormData(form).get('email'),
      })
      form.reset()
      toast({ title: 'Staff account created. A code to set a password was emailed.', tone: 'good' })
      onAdded()
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add MTA staff">
      <form className="stack" onSubmit={submit}>
        <p className="muted small" style={{ margin: 0 }}>
          They get full admin access. A code valid for 15 minutes is emailed so they can set their
          own password; they can request a new one from the sign-in page.
        </p>
        <Field label="Work email" error={fieldError(error, 'email')}>
          <input name="email" type="email" required />
        </Field>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add staff'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function AdminUserDetailPage() {
  const { userId } = useParams()
  const { user: me } = useAuth()
  const toast = useToast()
  const detail = useApi<AdminUserDetail>(`/api/admin/users/${userId}`)
  const [suspending, setSuspending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const format = useFormat()
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const { user, suspendedReason, cases, activity } = detail.data
  const open = user.status !== 'closed'
  const providerPage = PROVIDER_PAGE[user.role]

  async function act(path: string, done: string) {
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/admin/users/${user.id}/${path}`, {})
      toast({ title: done, tone: 'good' })
      await detail.reload()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="dr-page">
      <BackHeader
        to="/admin/users"
        title={user.name ?? user.email ?? 'Closed account'}
        subtitle={`${ROLE_LABEL[user.role]} · joined ${formatDate(user.createdAt)}`}
      />

      {user.status === 'suspended' && (
        <section className="dr-card">
          <strong>Suspended.</strong> <span className="muted">{suspendedReason}</span>
        </section>
      )}

      <section className="dr-card stack">
        <div className="row-between">
          <h2 className="dr-subtitle">Account</h2>
          <UserStatus status={user.status} />
        </div>
        <div className="dr-kv">
          <Fact label="Email" value={user.email ?? 'Erased'} />
          <Fact label="Type" value={ROLE_LABEL[user.role]} />
        </div>
        {providerPage && user.providerId && (
          <Link to={`/admin/${providerPage}/${user.providerId}`}>
            Open registration and checks →
          </Link>
        )}
        <FormError error={error} />
        {open && (
          <div className="row-end" style={{ flexWrap: 'wrap' }}>
            {user.status === 'unverified' && (
              <button
                type="button"
                className="ghost-button"
                disabled={pending}
                onClick={() => void act('resend-verification', 'Verification code sent.')}
              >
                Resend verification
              </button>
            )}
            <button
              type="button"
              className="ghost-button"
              disabled={pending}
              onClick={() => void act('password-reset', 'Password reset code sent.')}
            >
              Send password reset
            </button>
            {user.status === 'suspended' ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void act('reactivate', 'Account reactivated.')}
              >
                Reactivate
              </button>
            ) : (
              me?.id !== user.id && (
                <button type="button" disabled={pending} onClick={() => setSuspending(true)}>
                  Suspend
                </button>
              )
            )}
          </div>
        )}
      </section>

      {user.role === 'PATIENT' && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Cases</h2>
          {cases.length === 0 && <p className="muted">No cases yet.</p>}
          {cases.map((c) => (
            <Link key={c.id} to={`/admin/cases/${c.id}`}>
              {c.referenceNumber}
            </Link>
          ))}
        </section>
      )}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Recent activity</h2>
        <AuditTable rows={activity} format={format} empty="No recorded activity." />
      </section>

      <SuspendDialog
        userId={user.id}
        open={suspending}
        onClose={() => setSuspending(false)}
        onDone={() => void detail.reload()}
      />
    </div>
  )
}

function SuspendDialog({
  userId,
  open,
  onClose,
  onDone,
}: {
  userId: string
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/admin/users/${userId}/suspend`, {
        reason: new FormData(event.currentTarget).get('reason'),
      })
      toast({ title: 'Account suspended.', tone: 'good' })
      onDone()
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Suspend account">
      <form className="stack" onSubmit={submit}>
        <p className="muted small" style={{ margin: 0 }}>
          They are signed out at once and can't sign in until reactivated. Their cases and records
          stay as they are.
        </p>
        <Field
          label="Reason"
          hint="At least 10 characters. Staff only; the user doesn't see it."
          error={fieldError(error, 'reason')}
        >
          <textarea name="reason" rows={3} required minLength={10} maxLength={500} />
        </Field>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={pending}>
            {pending ? 'Suspending…' : 'Suspend'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
