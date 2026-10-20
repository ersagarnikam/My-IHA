import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Database } from '@iha/db/types'
import fs from 'fs'
import path from 'path'

const logger = createLogger('patient:payments-invoice')

type PaymentRow = Database['public']['Tables']['payments']['Row']

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const intentId = searchParams.get('intentId')

    if (!intentId) {
      return NextResponse.json({ error: 'intentId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const { data: paymentData } = await supabase
      .from('payments')
      .select(
        `*, cases(reference_number), patients(full_name, address),
         treatment_options(
           mta_commission_aud,
           treatment_plans(procedure_name, doctor_fees_aud, hospital_fees_aud, cost_breakdown, hospitals(name, city, country))
         )`,
      )
      .eq('stripe_payment_intent_id', intentId)
      .eq('status', 'completed')
      .maybeSingle()

    if (!paymentData) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const payment = paymentData as unknown as PaymentRow & {
      cases: { reference_number: string } | null
      patients: { full_name: string; address: string | null } | null
      treatment_options: {
        mta_commission_aud: number
        treatment_plans: {
          procedure_name: string | null
          doctor_fees_aud: number | null
          hospital_fees_aud: number | null
          cost_breakdown: { items: Array<{ label: string; amount: number }>; total: number } | null
          hospitals: { name: string; city: string; country: string } | null
        } | null
      } | null
    }

    const { data: patientData } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const patient = patientData as unknown as { id: string } | null

    if (!patient || patient.id !== payment.patient_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const cases = payment.cases as { reference_number: string } | null
    const patientInfo = payment.patients as { full_name: string; address: string | null } | null
    const treatmentOption = payment.treatment_options
    const treatmentPlan = treatmentOption?.treatment_plans ?? null

    const costItems: Array<{ label: string; amount: number }> = []
    if (treatmentPlan?.doctor_fees_aud) {
      costItems.push({ label: 'Doctor Fees', amount: treatmentPlan.doctor_fees_aud })
    }
    if (treatmentPlan?.hospital_fees_aud) {
      costItems.push({ label: 'Hospital Fees', amount: treatmentPlan.hospital_fees_aud })
    }
    costItems.push(...(treatmentPlan?.cost_breakdown?.items ?? []))
    if (treatmentOption?.mta_commission_aud) {
      costItems.push({ label: 'IHA Service Fee', amount: treatmentOption.mta_commission_aud })
    }

    // ── Colors ────────────────────────────────────────────────────
    const teal = rgb(0.05, 0.5, 0.55)
    const darkGray = rgb(0.2, 0.2, 0.2)
    const midGray = rgb(0.45, 0.45, 0.45)
    const lightGray = rgb(0.6, 0.6, 0.6)
    const bgGray = rgb(0.95, 0.96, 0.97)
    const lineColor = rgb(0.85, 0.85, 0.85)
    const green = rgb(0.1, 0.6, 0.3)

    // ── Document setup ────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    const contentWidth = width - margin * 2 // 495.28

    // ── Embed logo ────────────────────────────────────────────────
    let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo.png')
      if (fs.existsSync(logoPath)) {
        logoImage = await pdfDoc.embedPng(fs.readFileSync(logoPath))
      }
    } catch {
      // fall back to text brand name
    }

    let y = height - margin // 791

    // ── HEADER: logo left, contact right ─────────────────────────
    const logoHeight = 40
    if (logoImage) {
      const scale = logoHeight / logoImage.height
      page.drawImage(logoImage, {
        x: margin,
        y: y - logoHeight,
        width: logoImage.width * scale,
        height: logoHeight,
      })
    } else {
      page.drawText('Medical Tourism Australia', {
        x: margin,
        y: y - 16,
        size: 16,
        font: boldFont,
        color: teal,
      })
    }

    y -= 55

    // Divider
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: lineColor })

    // ── META BAND: Invoice No | Date | Payment Status | Total ─────
    y -= 12
    const metaBoxH = 50
    page.drawRectangle({ x: margin, y: y - metaBoxH, width: contentWidth, height: metaBoxH, color: bgGray })

    const colW = contentWidth / 4 // ~123.8
    const metaLabelY = y - 18
    const metaValueY = y - 34

    const invoiceNum = cases?.reference_number
      ? `#${cases.reference_number}`
      : `#${payment.id.slice(0, 8).toUpperCase()}`

    page.drawText('Invoice No', { x: margin + 10, y: metaLabelY, size: 9.5, font, color: midGray })
    page.drawText(invoiceNum, { x: margin + 10, y: metaValueY, size: 9, font: boldFont, color: darkGray })

    const dateStr = payment.paid_at ? formatDate(payment.paid_at) : formatDate(payment.created_at)
    page.drawText('Date', { x: margin + colW + 10, y: metaLabelY, size: 9.5, font, color: midGray })
    page.drawText(dateStr, { x: margin + colW + 10, y: metaValueY, size: 9, font: boldFont, color: darkGray })

    page.drawText('Payment Status', { x: margin + colW * 2 + 10, y: metaLabelY, size: 9.5, font, color: midGray })
    page.drawText('Paid', { x: margin + colW * 2 + 10, y: metaValueY, size: 9, font: boldFont, color: green })

    page.drawText('Total Amount', { x: margin + colW * 3 + 10, y: metaLabelY, size: 9.5, font, color: midGray })
    page.drawText(formatAUD(payment.amount_aud), {
      x: margin + colW * 3 + 10,
      y: metaValueY,
      size: 9,
      font: boldFont,
      color: darkGray,
    })

    y -= metaBoxH + 24

    // ── HOSPITAL NAME (left) & BILLING ADDRESS (right) ────────────
    const hospital = treatmentPlan?.hospitals
    const halfW = contentWidth / 2

    page.drawText('Hospital Name', { x: margin, y, size: 9.5, font, color: midGray })
    page.drawText('Billing Address', { x: margin + halfW, y, size: 9.5, font, color: midGray })

    y -= 16
    page.drawText(hospital?.name ?? '—', { x: margin, y, size: 10, font: boldFont, color: darkGray })
    page.drawText(patientInfo?.full_name ?? '—', {
      x: margin + halfW,
      y,
      size: 10,
      font: boldFont,
      color: darkGray,
    })

    y -= 14
    if (hospital) {
      page.drawText(`${hospital.city}, ${hospital.country}`, { x: margin, y, size: 9, font, color: darkGray })
    }
    if (patientInfo?.address) {
      const addr =
        patientInfo.address.length > 45 ? patientInfo.address.slice(0, 45) + '…' : patientInfo.address
      page.drawText(addr, { x: margin + halfW, y, size: 9, font, color: darkGray })
    }

    y -= 28

    // Divider
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: lineColor })

    // ── BILLING DETAILS TABLE ─────────────────────────────────────
    y -= 20
    page.drawText('Billing Details', { x: margin, y, size: 11, font: boldFont, color: darkGray })

    // Column positions (total = 495)
    const tCol = {
      no:   { x: margin },
      desc: { x: margin + 28 },
      qty:  { x: margin + 243 },
      rate: { x: margin + 303 },
      amt:  { x: margin + 403 },
    }

    // Table header row
    y -= 32
    const rowH = 24
    page.drawRectangle({ x: margin, y: y - 6, width: contentWidth, height: rowH, color: bgGray })
    page.drawText('No.', { x: tCol.no.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Description', { x: tCol.desc.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Qty', { x: tCol.qty.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Rate', { x: tCol.rate.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Amount', { x: tCol.amt.x + 6, y, size: 9, font: boldFont, color: darkGray })

    // Table data rows
    y -= rowH + 6
    const amount = payment.amount_aud

    if (costItems.length > 0) {
      costItems.forEach((item, idx) => {
        const labelText = item.label.length > 38 ? item.label.slice(0, 38) + '…' : item.label
        page.drawText(`${idx + 1}`, { x: tCol.no.x + 6, y, size: 9, font, color: darkGray })
        page.drawText(labelText, { x: tCol.desc.x + 6, y, size: 9, font, color: darkGray })
        page.drawText('1', { x: tCol.qty.x + 6, y, size: 9, font, color: darkGray })
        page.drawText(formatAUD(item.amount), { x: tCol.rate.x + 6, y, size: 9, font, color: darkGray })
        page.drawText(formatAUD(item.amount), { x: tCol.amt.x + 6, y, size: 9, font, color: darkGray })
        y -= rowH
      })
    } else {
      const procedureName = treatmentPlan?.procedure_name ?? 'Treatment Payment'
      const descText = procedureName.length > 38 ? procedureName.slice(0, 38) + '…' : procedureName
      page.drawText('1', { x: tCol.no.x + 6, y, size: 9, font, color: darkGray })
      page.drawText(descText, { x: tCol.desc.x + 6, y, size: 9, font, color: darkGray })
      page.drawText('1', { x: tCol.qty.x + 6, y, size: 9, font, color: darkGray })
      page.drawText(formatAUD(amount), { x: tCol.rate.x + 6, y, size: 9, font, color: darkGray })
      page.drawText(formatAUD(amount), { x: tCol.amt.x + 6, y, size: 9, font, color: darkGray })
      y -= rowH
    }

    // Row separator
    y -= 22
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lineColor })

    // ── TOTALS (right-aligned to table) ──────────────────────────
    const sumLabelX = tCol.rate.x + 6
    const sumValueX = tCol.amt.x + 6

    y -= 16
    page.drawText('Subtotal', { x: sumLabelX, y, size: 9, font, color: midGray })
    page.drawText(formatAUD(amount), { x: sumValueX, y, size: 9, font, color: darkGray })

    y -= 14
    page.drawText('Discount', { x: sumLabelX, y, size: 9, font, color: midGray })
    page.drawText('—', { x: sumValueX, y, size: 9, font, color: darkGray })

    y -= 16
    page.drawLine({
      start: { x: tCol.rate.x, y: y + 4 },
      end: { x: width - margin, y: y + 4 },
      thickness: 0.5,
      color: lineColor,
    })

    y -= 14
    page.drawText('Total Paid', { x: sumLabelX, y, size: 10, font: boldFont, color: darkGray })
    page.drawText(formatAUD(amount), { x: sumValueX, y, size: 10, font: boldFont, color: teal })

    // ── FOOTER ───────────────────────────────────────────────────
    page.drawLine({ start: { x: margin, y: 72 }, end: { x: width - margin, y: 72 }, thickness: 0.8, color: lineColor })
    page.drawText('This is a computer-generated invoice and does not require a signature.', {
      x: margin,
      y: 57,
      size: 8,
      font,
      color: lightGray,
    })
    page.drawText(`Payment Method: Stripe  |  Case Reference: ${cases?.reference_number ?? '—'}`, {
      x: margin,
      y: 44,
      size: 8,
      font,
      color: lightGray,
    })

    const pdfBytes = await pdfDoc.save()

    const disposition = searchParams.get('download') ? 'attachment' : 'inline'
    const filename = `invoice-${cases?.reference_number ?? payment.id}.pdf`

    await logAuditEvent({
      app: 'patient',
      action: 'payment.invoice_downloaded',
      entityType: 'payment',
      entityId: payment.id,
    })

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
      },
    })
  } catch (err) {
    logger.error({ err }, 'invoice generation failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
