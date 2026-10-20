import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

const logger = createLogger('doctor:fees-invoice')

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

const FEE_TYPE_LABEL: Record<string, string> = {
  registration: 'Registration Fee',
  annual: 'Annual Renewal Fee',
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get('paymentId')

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const { data: doctorRow } = await supabase
      .from('doctors')
      .select('id, full_name, contact_email')
      .eq('user_id', user.id)
      .maybeSingle()

    const doctor = doctorRow as { id: string; full_name: string; contact_email: string | null } | null
    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    const { data: paymentData } = await supabase
      .from('doctor_fee_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('doctor_id', doctor.id)
      .eq('status', 'completed')
      .maybeSingle()

    const payment = paymentData as {
      id: string
      fee_type: 'registration' | 'annual'
      billing_period: string | null
      amount_aud: number
      paid_at: string | null
      created_at: string
      gateway_reference: string | null
    } | null

    if (!payment) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const teal = rgb(0.05, 0.5, 0.55)
    const darkGray = rgb(0.2, 0.2, 0.2)
    const midGray = rgb(0.45, 0.45, 0.45)
    const lightGray = rgb(0.6, 0.6, 0.6)
    const bgGray = rgb(0.95, 0.96, 0.97)
    const lineColor = rgb(0.85, 0.85, 0.85)
    const green = rgb(0.1, 0.6, 0.3)

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    const contentWidth = width - margin * 2

    let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo.png')
      if (fs.existsSync(logoPath)) {
        logoImage = await pdfDoc.embedPng(fs.readFileSync(logoPath))
      }
    } catch {
      // fall back to text brand name
    }

    let y = height - margin

    const logoHeight = 40
    if (logoImage) {
      const scale = logoHeight / logoImage.height
      page.drawImage(logoImage, { x: margin, y: y - logoHeight, width: logoImage.width * scale, height: logoHeight })
    } else {
      page.drawText('Medical Tourism Australia', { x: margin, y: y - 16, size: 16, font: boldFont, color: teal })
    }

    y -= 55
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: lineColor })

    // ── META BAND: Invoice No | Date | Payment Status | Total ─────
    y -= 12
    const metaBoxH = 50
    page.drawRectangle({ x: margin, y: y - metaBoxH, width: contentWidth, height: metaBoxH, color: bgGray })

    const colW = contentWidth / 4
    const metaLabelY = y - 18
    const metaValueY = y - 34

    const invoiceNum = `#${payment.id.slice(0, 8).toUpperCase()}`

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

    // ── BILLED TO ───────────────────────────────────────────────
    page.drawText('Billed To', { x: margin, y, size: 9.5, font, color: midGray })
    y -= 16
    page.drawText(doctor.full_name, { x: margin, y, size: 10, font: boldFont, color: darkGray })
    if (doctor.contact_email) {
      y -= 14
      page.drawText(doctor.contact_email, { x: margin, y, size: 9, font, color: darkGray })
    }

    y -= 28
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: lineColor })

    // ── BILLING DETAILS TABLE ─────────────────────────────────────
    y -= 20
    page.drawText('Billing Details', { x: margin, y, size: 11, font: boldFont, color: darkGray })

    const tCol = {
      no: { x: margin },
      desc: { x: margin + 28 },
      period: { x: margin + 280 },
      amt: { x: margin + 403 },
    }

    y -= 32
    const rowH = 24
    page.drawRectangle({ x: margin, y: y - 6, width: contentWidth, height: rowH, color: bgGray })
    page.drawText('No.', { x: tCol.no.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Description', { x: tCol.desc.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Billing Period', { x: tCol.period.x + 6, y, size: 9, font: boldFont, color: darkGray })
    page.drawText('Amount', { x: tCol.amt.x + 6, y, size: 9, font: boldFont, color: darkGray })

    y -= rowH + 6
    const description = FEE_TYPE_LABEL[payment.fee_type] ?? payment.fee_type
    const periodText = payment.billing_period ? formatDate(payment.billing_period) : 'One-time'

    page.drawText('1', { x: tCol.no.x + 6, y, size: 9, font, color: darkGray })
    page.drawText(description, { x: tCol.desc.x + 6, y, size: 9, font, color: darkGray })
    page.drawText(periodText, { x: tCol.period.x + 6, y, size: 9, font, color: darkGray })
    page.drawText(formatAUD(payment.amount_aud), { x: tCol.amt.x + 6, y, size: 9, font, color: darkGray })
    y -= rowH

    y -= 22
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lineColor })

    // ── TOTALS ──────────────────────────────────────────────────
    const sumLabelX = tCol.period.x + 6
    const sumValueX = tCol.amt.x + 6

    y -= 16
    page.drawText('Subtotal', { x: sumLabelX, y, size: 9, font, color: midGray })
    page.drawText(formatAUD(payment.amount_aud), { x: sumValueX, y, size: 9, font, color: darkGray })

    y -= 16
    page.drawLine({
      start: { x: tCol.period.x, y: y + 4 },
      end: { x: width - margin, y: y + 4 },
      thickness: 0.5,
      color: lineColor,
    })

    y -= 14
    page.drawText('Total Paid', { x: sumLabelX, y, size: 10, font: boldFont, color: darkGray })
    page.drawText(formatAUD(payment.amount_aud), { x: sumValueX, y, size: 10, font: boldFont, color: teal })

    // ── FOOTER ───────────────────────────────────────────────────
    page.drawLine({ start: { x: margin, y: 72 }, end: { x: width - margin, y: 72 }, thickness: 0.8, color: lineColor })
    page.drawText('This is a computer-generated invoice and does not require a signature.', {
      x: margin,
      y: 57,
      size: 8,
      font,
      color: lightGray,
    })
    page.drawText(`Payment Method: Stripe  |  Reference: ${payment.gateway_reference ?? payment.id}`, {
      x: margin,
      y: 44,
      size: 8,
      font,
      color: lightGray,
    })

    const pdfBytes = await pdfDoc.save()

    const disposition = searchParams.get('download') ? 'attachment' : 'inline'
    const filename = `invoice-${payment.fee_type}-${payment.id.slice(0, 8)}.pdf`

    await logAuditEvent({
      app: 'doctor',
      action: 'fee.invoice_downloaded',
      entityType: 'doctor_fee_payment',
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
