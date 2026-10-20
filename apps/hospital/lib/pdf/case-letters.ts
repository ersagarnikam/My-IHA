import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type CaseLetterInput = {
  case: {
    reference_number: string
    specialty: string
    specialty_other: string | null
  }
  patient: {
    full_name: string
    date_of_birth: string | null
    gender: string | null
    country_of_residence: string | null
  }
  doctor: { full_name: string } | null
  plan: {
    procedure_name: string | null
    diagnosis: string | null
    treatment_type: string | null
    treatment_start_date: string | null
    treatment_end_date: string | null
    estimated_length_of_stay: string | null
    department: string | null
  } | null
  hospital: {
    name: string
    address: string | null
    city: string
    country: string
    zip_code: string | null
    phone: string | null
    contact_email: string | null
  }
}

const teal = rgb(0.05, 0.5, 0.55)
const darkGray = rgb(0.2, 0.2, 0.2)
const midGray = rgb(0.45, 0.45, 0.45)
const lightGray = rgb(0.6, 0.6, 0.6)
const lineColor = rgb(0.85, 0.85, 0.85)

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function drawLetterhead(pdfDoc: PDFDocument, hospital: CaseLetterInput['hospital'], title: string) {
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const margin = 50

  let y = height - margin

  page.drawText(hospital.name, { x: margin, y: y - 16, size: 16, font: boldFont, color: teal })

  const contactLines = [
    hospital.address ? `${hospital.address}${hospital.zip_code ? ', ' + hospital.zip_code : ''}` : null,
    `${hospital.city}, ${hospital.country}`,
    [hospital.phone, hospital.contact_email].filter(Boolean).join('  |  ') || null,
  ].filter((line): line is string => Boolean(line))

  let contactY = y - 12
  for (const line of contactLines) {
    const textWidth = font.widthOfTextAtSize(line, 8.5)
    page.drawText(line, { x: width - margin - textWidth, y: contactY, size: 8.5, font, color: midGray })
    contactY -= 12
  }

  y -= 55
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: lineColor })

  y -= 30
  page.drawText(title, { x: margin, y, size: 15, font: boldFont, color: darkGray })

  y -= 18
  page.drawText(`Date: ${formatDate(new Date().toISOString())}`, { x: margin, y, size: 9.5, font, color: midGray })

  y -= 25 // gap before the letter body starts
  return { page, font, boldFont, margin, width, height, y }
}

function drawParagraph(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ')
  let line = ''
  let cursorY = y
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font, color: darkGray })
      cursorY -= lineHeight
      line = word
    } else {
      line = candidate
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color: darkGray })
    cursorY -= lineHeight
  }
  return cursorY
}

function drawSignatureAndFooter(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  margin: number,
  width: number,
  y: number,
  hospital: CaseLetterInput['hospital'],
  referenceNumber: string,
) {
  page.drawText('Sincerely,', { x: margin, y, size: 10, font, color: darkGray })
  y -= 34
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 200, y }, thickness: 0.6, color: lineColor })
  y -= 14
  page.drawText(hospital.name, { x: margin, y, size: 10, font: boldFont, color: darkGray })

  page.drawLine({ start: { x: margin, y: 72 }, end: { x: width - margin, y: 72 }, thickness: 0.8, color: lineColor })
  page.drawText('This is a computer-generated letter issued on behalf of the hospital.', {
    x: margin,
    y: 57,
    size: 8,
    font,
    color: lightGray,
  })
  page.drawText(`Case Reference: ${referenceNumber}`, { x: margin, y: 44, size: 8, font, color: lightGray })
}

function specialtyLabel(c: CaseLetterInput['case']) {
  return c.specialty === 'Other' && c.specialty_other ? c.specialty_other : c.specialty
}

export async function buildHospitalInvitationLetterPdf(input: CaseLetterInput): Promise<Uint8Array> {
  const { case: caseRow, patient, doctor, plan, hospital } = input

  const pdfDoc = await PDFDocument.create()
  const { page, font, boldFont, margin, width, y: letterheadY } = await drawLetterhead(
    pdfDoc,
    hospital,
    'Hospital Invitation Letter',
  )
  const contentWidth = width - margin * 2
  let y = letterheadY

  page.drawText('To Whom It May Concern,', { x: margin, y, size: 10.5, font: boldFont, color: darkGray })
  y -= 22

  const intro =
    `This letter confirms that ${patient.full_name} (Case Reference: ${caseRow.reference_number}) has been ` +
    `accepted for medical treatment at ${hospital.name}, ${hospital.city}, ${hospital.country}, for the ` +
    `condition of ${specialtyLabel(caseRow)}${plan?.procedure_name ? ` (${plan.procedure_name})` : ''}.`
  y = drawParagraph(page, font, intro, margin, y, 10, contentWidth, 15)
  y -= 10

  const rows: Array<[string, string]> = [
    ['Patient Name', patient.full_name],
    ['Date of Birth', formatDate(patient.date_of_birth)],
    ['Country of Residence', patient.country_of_residence ?? '—'],
    ['Treating Doctor', doctor?.full_name ?? '—'],
    ['Diagnosis', plan?.diagnosis ?? '—'],
    ['Planned Admission Date', formatDate(plan?.treatment_start_date ?? null)],
    ['Estimated Length of Stay', plan?.estimated_length_of_stay ?? '—'],
  ]

  for (const [label, value] of rows) {
    page.drawText(label, { x: margin, y, size: 9.5, font, color: midGray })
    page.drawText(value, { x: margin + 190, y, size: 9.5, font: boldFont, color: darkGray })
    y -= 18
  }

  y -= 10
  const closing =
    `We kindly request that the relevant visa authorities grant ${patient.full_name} the necessary visa to ` +
    `travel to ${hospital.country} for the purpose of receiving this medical treatment. Should any further ` +
    `information be required, please contact us using the details below.`
  y = drawParagraph(page, font, closing, margin, y, 10, contentWidth, 15)

  y -= 40
  drawSignatureAndFooter(page, font, boldFont, margin, width, y, hospital, caseRow.reference_number)

  return pdfDoc.save()
}

export async function buildAppointmentConfirmationLetterPdf(input: CaseLetterInput): Promise<Uint8Array> {
  const { case: caseRow, patient, doctor, plan, hospital } = input

  const pdfDoc = await PDFDocument.create()
  const { page, font, boldFont, margin, width, y: letterheadY } = await drawLetterhead(
    pdfDoc,
    hospital,
    'Appointment Confirmation Letter',
  )
  const contentWidth = width - margin * 2
  let y = letterheadY

  page.drawText(`Dear ${patient.full_name},`, { x: margin, y, size: 10.5, font: boldFont, color: darkGray })
  y -= 22

  const intro =
    `This letter confirms your upcoming appointment and treatment schedule at ${hospital.name}, ` +
    `${hospital.city}, ${hospital.country} (Case Reference: ${caseRow.reference_number}).`
  y = drawParagraph(page, font, intro, margin, y, 10, contentWidth, 15)
  y -= 10

  const rows: Array<[string, string]> = [
    ['Patient Name', patient.full_name],
    ['Treating Doctor', doctor?.full_name ?? '—'],
    ['Department', plan?.department ?? '—'],
    ['Procedure', plan?.procedure_name ?? '—'],
    ['Confirmed Admission Date', formatDate(plan?.treatment_start_date ?? null)],
    ['Expected Completion Date', formatDate(plan?.treatment_end_date ?? null)],
    ['Estimated Length of Stay', plan?.estimated_length_of_stay ?? '—'],
  ]

  for (const [label, value] of rows) {
    page.drawText(label, { x: margin, y, size: 9.5, font, color: midGray })
    page.drawText(value, { x: margin + 190, y, size: 9.5, font: boldFont, color: darkGray })
    y -= 18
  }

  y -= 10
  const closing =
    `Please arrive at least 30 minutes prior to your scheduled admission time with a valid passport, visa, ` +
    `and any prior medical records. For questions regarding this appointment, please contact the hospital ` +
    `directly using the details below.`
  y = drawParagraph(page, font, closing, margin, y, 10, contentWidth, 15)

  y -= 40
  drawSignatureAndFooter(page, font, boldFont, margin, width, y, hospital, caseRow.reference_number)

  return pdfDoc.save()
}
