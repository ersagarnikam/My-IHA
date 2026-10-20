import { Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import type { HospitalGeneratedDocument, HospitalLetterType } from '@iha/db/visa'
import { LetterCard } from './letter-card'

const LETTER_TYPES: Array<{ type: HospitalLetterType; label: string }> = [
  { type: 'hospital_invitation', label: 'Hospital Invitation Letter' },
  { type: 'appointment_confirmation', label: 'Appointment Confirmation Letter' },
]

type Props = {
  caseId: string
  documents: HospitalGeneratedDocument[]
}

export function VisaLettersSection({ caseId, documents }: Props) {
  const byType = new Map(documents.map((d) => [d.category, d]))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Visa Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {LETTER_TYPES.map(({ type, label }) => (
          <LetterCard
            key={type}
            caseId={caseId}
            documentType={type}
            label={label}
            initialDocument={byType.get(type) ?? null}
          />
        ))}
      </CardContent>
    </Card>
  )
}
