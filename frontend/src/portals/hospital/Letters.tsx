import { useState } from 'react'
import { Download, Eye, FileText, RefreshCw, Send } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { FormError, Modal } from '../../components/ui'
import { apiPost, openFile } from '../../lib/api'
import { formatDate } from '../doctor/shared'
import type { Letter, LetterType } from './types'

const path = (planId: string, type: LetterType) => `/api/hospital/cases/${planId}/letters/${type}`

/**
 * One visa letter's controls (old LetterCard / DocumentStatusCell): generate (or
 * regenerate), preview, download and send to the patient after a confirmation.
 * `compact` renders the table-cell version used on the Documents page.
 */
export function LetterControls({
  planId,
  reference,
  letter,
  compact,
  onChange,
}: {
  planId: string
  reference: string
  letter: Letter
  compact?: boolean
  onChange: (letter: Letter) => void
}) {
  const toast = useToast()
  const [pending, setPending] = useState<'generate' | 'send' | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const generated = !!letter.generatedAt
  const fileName = letter.fileName ?? `${reference}-${letter.type}.pdf`

  async function generate() {
    setPending('generate')
    setError(null)
    try {
      onChange(await apiPost<Letter>(path(planId, letter.type)))
      toast({ title: `${letter.label} ${generated ? 'regenerated' : 'generated'}.`, tone: 'good' })
    } catch (err) {
      setError(err)
      toast({ title: `Could not generate the ${letter.label.toLowerCase()}.`, tone: 'bad' })
    } finally {
      setPending(null)
    }
  }

  async function send() {
    setPending('send')
    setError(null)
    try {
      onChange(await apiPost<Letter>(`${path(planId, letter.type)}/send`))
      setConfirmSend(false)
      toast({ title: `${letter.label} sent to the patient.`, tone: 'good' })
    } catch (err) {
      setError(err)
    } finally {
      setPending(null)
    }
  }

  const view = () => openFile(path(planId, letter.type)).catch(setError)
  const download = () =>
    openFile(`${path(planId, letter.type)}?download=true`, fileName).catch(setError)

  const state = letter.sentAt ? (
    <span className="badge badge-sm badge-good">Sent {formatDate(letter.sentAt)}</span>
  ) : generated ? (
    <span className="badge badge-sm badge-info">Generated {formatDate(letter.generatedAt)}</span>
  ) : (
    <span className="badge badge-sm badge-muted">Not generated</span>
  )

  const confirm = (
    <Modal
      open={confirmSend}
      onClose={() => pending !== 'send' && setConfirmSend(false)}
      title="Send to patient?"
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          The patient will be notified that the {letter.label.toLowerCase()} is ready and can
          download it from their Visa &amp; Travel section. Once both letters are sent, they can
          start their visa application.
        </p>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={() => setConfirmSend(false)}>
            Cancel
          </button>
          <button type="button" disabled={pending === 'send'} onClick={send}>
            {pending === 'send' ? 'Sending…' : 'Send to patient'}
          </button>
        </div>
      </div>
    </Modal>
  )

  if (compact)
    return (
      <div className="hp-letter-cell">
        {state}
        <div className="row-start" style={{ gap: '0.25rem' }}>
          {!generated ? (
            <button
              type="button"
              className="hp-btn button-secondary"
              disabled={!!pending}
              onClick={generate}
            >
              {pending === 'generate' ? 'Generating…' : 'Generate'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="dr-icon-button"
                aria-label={`View ${letter.label}`}
                onClick={view}
              >
                <Eye size={15} />
              </button>
              <button
                type="button"
                className="dr-icon-button"
                aria-label={`Download ${letter.label}`}
                onClick={download}
              >
                <Download size={15} />
              </button>
              {!letter.sentAt && (
                <button
                  type="button"
                  className="dr-icon-button"
                  aria-label={`Send ${letter.label} to patient`}
                  onClick={() => setConfirmSend(true)}
                >
                  <Send size={15} />
                </button>
              )}
            </>
          )}
        </div>
        {confirm}
      </div>
    )

  return (
    <div className="hp-letter">
      <span className="dr-file-icon pdf">
        <FileText size={18} />
      </span>
      <div className="hp-letter-body">
        <p className="strong" style={{ margin: 0 }}>
          {letter.label}
        </p>
        {state}
        <FormError error={error} />
      </div>
      <div className="hp-letter-actions">
        {generated && (
          <>
            <button type="button" className="button-secondary hp-btn" onClick={view}>
              <Eye size={14} /> View
            </button>
            <button type="button" className="button-secondary hp-btn" onClick={download}>
              <Download size={14} /> Download
            </button>
          </>
        )}
        <button
          type="button"
          className={`${generated ? 'button-secondary ' : ''}hp-btn`}
          disabled={!!pending}
          onClick={generate}
        >
          {generated ? <RefreshCw size={14} /> : null}
          {pending === 'generate' ? 'Generating…' : generated ? 'Regenerate' : 'Generate'}
        </button>
        {generated && !letter.sentAt && (
          <button type="button" className="hp-btn" onClick={() => setConfirmSend(true)}>
            <Send size={14} /> Send to patient
          </button>
        )}
      </div>
      {confirm}
    </div>
  )
}
