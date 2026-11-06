// A local stand-in for Resend and Twilio, for testing without accounts. It answers the same requests
// and refuses the same mistakes as the real services (missing key, bad sender, bad phone number), keeps
// what it receives in memory and shows it at http://localhost:8025. Nothing is ever delivered.
//   POST /resend/emails                                     Resend
//   POST /twilio/2010-04-01/Accounts/{sid}/Messages.json    Twilio
//   GET  /api/messages                                      everything received, newest first
//   POST /api/fail?count=3                                  fail the next 3 sends with a 500
//   DELETE /api/messages                                    empty the mailbox
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 8025)
let messages = []
let failures = 0

const read = (req) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

const escape = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const validSender = (value) => /^([^<>]+<)?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/.test(value ?? '')

function resend(req, res, raw) {
  if (!/^Bearer \S+$/.test(req.headers.authorization ?? ''))
    return json(res, 401, { statusCode: 401, name: 'missing_api_key', message: 'Missing API key' })
  let mail
  try {
    mail = JSON.parse(raw)
  } catch {
    return json(res, 400, { statusCode: 400, name: 'invalid_json', message: 'Invalid JSON' })
  }
  const to = Array.isArray(mail.to) ? mail.to : [mail.to]
  if (!validSender(mail.from))
    return json(res, 422, { statusCode: 422, name: 'validation_error', message: 'Invalid `from` field' })
  if (!to[0] || !to.every((a) => /^[^@\s]+@[^@\s]+$/.test(a)))
    return json(res, 422, { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field' })
  if (!mail.subject || !(mail.html || mail.text))
    return json(res, 422, { statusCode: 422, name: 'validation_error', message: 'Missing subject or body' })
  const id = randomUUID()
  messages.unshift({ id, channel: 'email', from: mail.from, to, subject: mail.subject, html: mail.html, text: mail.text, at: new Date().toISOString() })
  return json(res, 200, { id })
}

function twilio(req, res, raw, sid) {
  const expected = /^Basic (.+)$/.exec(req.headers.authorization ?? '')
  const user = expected ? Buffer.from(expected[1], 'base64').toString().split(':')[0] : null
  if (user !== sid) return json(res, 401, { code: 20003, message: 'Authenticate', status: 401 })
  const form = new URLSearchParams(raw)
  if (!/^\+[1-9]\d{6,14}$/.test(form.get('To') ?? ''))
    return json(res, 400, { code: 21211, message: `The 'To' number ${form.get('To')} is not a valid phone number.`, status: 400 })
  if (!/^\+[1-9]\d{6,14}$/.test(form.get('From') ?? ''))
    return json(res, 400, { code: 21212, message: 'Invalid From number', status: 400 })
  if (!form.get('Body')) return json(res, 400, { code: 21602, message: 'Message body is required', status: 400 })
  const id = `SM${randomUUID().replaceAll('-', '')}`
  messages.unshift({ id, channel: 'sms', from: form.get('From'), to: [form.get('To')], text: form.get('Body'), at: new Date().toISOString() })
  return json(res, 201, { sid: id, status: 'queued' })
}

function page() {
  const rows = messages
    .map((m) => {
      const body = m.channel === 'email'
        ? `<iframe sandbox title="Email" srcdoc="${escape(m.html ?? escape(m.text))}"></iframe>`
        : `<p>${escape(m.text)}</p>`
      return `<details><summary><b>${m.channel === 'email' ? 'Email' : 'SMS'}</b> ${escape(m.at.slice(11, 19))} · ${escape(m.to.join(', '))} · ${escape(m.subject ?? m.text.slice(0, 70))}</summary><p class="from">From ${escape(m.from)}</p>${body}</details>`
    })
    .join('')
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local mailbox</title>
<style>body{font:15px system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#0f172a}
details{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin:8px 0}summary{cursor:pointer}.from{color:#64748b;font-size:13px}
iframe{width:100%;height:420px;border:1px solid #e2e8f0;border-radius:6px}</style>
<h1>Local mailbox</h1><p>${messages.length} messages. Nothing here was delivered to anyone. Refresh to see new ones.</p>${rows}`
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const raw = req.method === 'POST' ? await read(req) : ''
  const twilioPath = /^\/twilio\/2010-04-01\/Accounts\/([^/]+)\/Messages\.json$/.exec(url.pathname)
  if (req.method === 'POST' && (url.pathname === '/resend/emails' || twilioPath)) {
    if (failures > 0) {
      failures--
      return json(res, 500, { message: 'Simulated outage' })
    }
    return twilioPath ? twilio(req, res, raw, twilioPath[1]) : resend(req, res, raw)
  }
  if (req.method === 'GET' && url.pathname === '/api/messages') return json(res, 200, messages)
  if (req.method === 'DELETE' && url.pathname === '/api/messages') {
    messages = []
    return json(res, 200, {})
  }
  if (req.method === 'POST' && url.pathname === '/api/fail') {
    failures = Number(url.searchParams.get('count') ?? 1)
    return json(res, 200, { failures })
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(page())
  }
  json(res, 404, { message: 'Not found' })
}).listen(PORT, () => console.log(`Local mailbox on :${PORT}`))
