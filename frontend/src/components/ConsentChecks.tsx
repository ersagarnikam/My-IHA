import { useT } from '../i18n/I18nContext'
import { useApi } from '../lib/useApi'

type PrivacyLinks = { privacyPolicyUrl: string; termsUrl: string; consentVersion: string }

/**
 * Sign-up consent (recorded by the API with the current consent version).
 * Everyone accepts the terms and privacy policy; patients also agree to MTA
 * collecting their health information and sharing it with the doctors,
 * hospitals and visa lawyers arranging their treatment, some of whom may be
 * outside Australia. Wording for MTA's lawyer to confirm.
 */
export function ConsentChecks({ patient }: { patient?: boolean }) {
  const t = useT('auth')
  const links = useApi<PrivacyLinks>('/api/auth/privacy')
  const link = (href: string | undefined) => (chunk: string) => (
    <a href={href} target="_blank" rel="noreferrer">
      {chunk}
    </a>
  )
  return (
    <div className="consent-checks">
      <label className="consent-check">
        <input type="checkbox" name="acceptTerms" required />
        <span>
          {t.rich('consentTerms', {
            terms: link(links.data?.termsUrl),
            privacy: link(links.data?.privacyPolicyUrl),
          })}
        </span>
      </label>
      {patient && (
        <label className="consent-check">
          <input type="checkbox" name="consentHealthInfo" required />
          <span>{t('consentHealthInfo')}</span>
        </label>
      )}
    </div>
  )
}

/** The consent fields of a sign-up form, for the request body. */
export function consentValues(form: FormData) {
  return {
    acceptTerms: form.get('acceptTerms') === 'on',
    consentHealthInfo: form.get('consentHealthInfo') === 'on',
  }
}
