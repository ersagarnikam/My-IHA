import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toasts'
import { ErrorState, Field, FormError, fieldError, Loading } from '../../components/ui'
import { ApiError, apiPut } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'

type Charge = 'MTA_SERVICE_FEE' | 'DOCTOR_FEES' | 'CONSULTATION_FEE' | 'TREATMENT_COSTS'

type Business = {
  legalName: string
  abn: string
  address: string
  email: string
  gstRegistered: boolean
  taxInvoices: boolean
  charges: { charge: Charge; label: string; taxable: boolean }[]
  updatedAt: string | null
  updatedBy: string | null
}

/** "51 824 753 556". */
function formatAbn(abn: string) {
  return abn.length === 11
    ? `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`
    : abn
}

/** MTA's details on invoices and how GST applies (admin → Settings). */
export function BusinessSettingsCard() {
  const data = useApi<Business>('/api/admin/settings/business')
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading />
  return (
    <BusinessForm
      key={data.data.updatedAt ?? 'initial'}
      business={data.data}
      onSaved={data.setData}
    />
  )
}

function BusinessForm({
  business,
  onSaved,
}: {
  business: Business
  onSaved: (b: Business) => void
}) {
  const toast = useToast()
  const format = useFormat()
  const [registered, setRegistered] = useState(business.gstRegistered)
  const [taxable, setTaxable] = useState<Record<Charge, boolean>>(
    Object.fromEntries(business.charges.map((c) => [c.charge, c.taxable])) as Record<
      Charge,
      boolean
    >,
  )
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const codeError = (code: string) =>
    error instanceof ApiError && error.code === code ? error.message : undefined

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      onSaved(
        await apiPut<Business>('/api/admin/settings/business', {
          legalName: String(f.get('legalName') ?? '').trim(),
          abn: String(f.get('abn') ?? '').trim(),
          address: String(f.get('address') ?? '').trim(),
          email: String(f.get('email') ?? '').trim(),
          gstRegistered: registered,
          taxable,
        }),
      )
      toast({ title: 'Business details saved.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">Business details &amp; GST</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Shown on every invoice and credit note. Invoices become <strong>tax invoices</strong> once
          MTA is registered for GST and has an ABN. Have MTA's accountant confirm which charges
          carry GST.
        </p>
      </div>
      <div className={`dr-banner${business.taxInvoices ? '' : ' info'}`}>
        {business.taxInvoices
          ? `Issuing tax invoices with ABN ${formatAbn(business.abn)}.`
          : 'Issuing plain invoices: "No GST has been charged."'}
        {business.updatedBy && (
          <span className="muted small">
            {' '}
            Last changed {format.relative(business.updatedAt!)} by {business.updatedBy}.
          </span>
        )}
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="dr-grid-2">
          <Field
            label="Legal or business name"
            error={fieldError(error, 'legalName') ?? codeError('legal_name_required')}
          >
            <input name="legalName" defaultValue={business.legalName} required />
          </Field>
          <Field
            label="ABN"
            error={
              fieldError(error, 'abn') ?? codeError('invalid_abn') ?? codeError('abn_required')
            }
            hint="11 digits"
          >
            <input name="abn" defaultValue={formatAbn(business.abn)} inputMode="numeric" />
          </Field>
          <Field label="Address" error={fieldError(error, 'address')}>
            <input name="address" defaultValue={business.address} />
          </Field>
          <Field label="Billing email" error={fieldError(error, 'email')}>
            <input name="email" type="email" defaultValue={business.email} />
          </Field>
        </div>
        <label className="toggle-row">
          <span>
            <strong className="block">Registered for GST</strong>
            <span className="muted small">
              Turn on once MTA is registered. Prices already include GST; taxable charges show the
              GST they contain.
            </span>
          </span>
          <input
            type="checkbox"
            checked={registered}
            onChange={(e) => setRegistered(e.target.checked)}
          />
        </label>
        {registered && (
          <div className="stack" style={{ gap: '0.5rem' }}>
            <p className="field-label" style={{ margin: 0 }}>
              Which charges carry GST
            </p>
            {business.charges.map((c) => (
              <label key={c.charge} className="admin-gst-row">
                <span>{c.label}</span>
                <select
                  value={taxable[c.charge] ? 'taxable' : 'free'}
                  onChange={(e) =>
                    setTaxable((t) => ({ ...t, [c.charge]: e.target.value === 'taxable' }))
                  }
                >
                  <option value="taxable">Taxable (10% GST)</option>
                  <option value="free">GST-free</option>
                </select>
              </label>
            ))}
          </div>
        )}
        <FormError error={error} />
        <div className="row-end">
          <button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save business details'}
          </button>
        </div>
      </form>
    </section>
  )
}

type Privacy = {
  privacyPolicyUrl: string
  termsUrl: string
  consentVersion: string
  retentionYears: number
}

/**
 * Links shown at sign-up, the consent version recorded with each consent, and
 * how long a closed patient account's records are kept (admin → Settings).
 */
export function PrivacySettingsCard() {
  const data = useApi<Privacy>('/api/admin/settings/privacy')
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading />
  return <PrivacyForm key={JSON.stringify(data.data)} privacy={data.data} onSaved={data.setData} />
}

function PrivacyForm({ privacy, onSaved }: { privacy: Privacy; onSaved: (p: Privacy) => void }) {
  const toast = useToast()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const codeError = (code: string) =>
    error instanceof ApiError && error.code === code ? error.message : undefined

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      onSaved(
        await apiPut<Privacy>('/api/admin/settings/privacy', {
          privacyPolicyUrl: String(f.get('privacyPolicyUrl') ?? '').trim(),
          termsUrl: String(f.get('termsUrl') ?? '').trim(),
          consentVersion: String(f.get('consentVersion') ?? '').trim(),
          retentionYears: Number(f.get('retentionYears')),
        }),
      )
      toast({ title: 'Privacy settings saved.', tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="dr-card stack">
      <div>
        <h2 className="dr-subtitle">Privacy, consent &amp; record retention</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Everyone accepts the terms and privacy policy at sign-up; patients also consent to MTA
          collecting their health information and sharing it with providers. Each consent is stored
          with the version below — change it when the wording or policy changes. When a patient
          deletes their account, the login and contact details are erased after 30 days and the
          medical and payment records are kept for the retention period, then purged. Have
          MTA&apos;s lawyer confirm the wording and the period.
        </p>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="dr-grid-2">
          <Field label="Privacy policy link" error={codeError('invalid_url')}>
            <input name="privacyPolicyUrl" type="url" defaultValue={privacy.privacyPolicyUrl} />
          </Field>
          <Field label="Terms of use link">
            <input name="termsUrl" type="url" defaultValue={privacy.termsUrl} />
          </Field>
          <Field
            label="Consent version"
            error={codeError('invalid_consent_version')}
            hint="e.g. 2026-10"
          >
            <input name="consentVersion" defaultValue={privacy.consentVersion} maxLength={40} />
          </Field>
          <Field
            label="Keep records of closed accounts (years)"
            error={codeError('invalid_retention_years')}
          >
            <input
              name="retentionYears"
              type="number"
              min={1}
              max={50}
              defaultValue={privacy.retentionYears}
            />
          </Field>
        </div>
        <FormError error={error} />
        <div className="row-end">
          <button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save privacy settings'}
          </button>
        </div>
      </form>
    </section>
  )
}
