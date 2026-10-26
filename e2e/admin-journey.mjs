// Drives the admin portal in headless Chrome against the dev servers (API on :8080 in the dev
// profile with its demo data, Vite on :5173): approve a pending doctor, assign a new case,
// publish one treatment plan and decline another, and answer a patient chat. Usage:
//   node admin-journey.mjs
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const OUT = path.join(import.meta.dirname, 'shots', 'admin')
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
})
const page = await browser.newPage()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(`console: ${m.text()}`))

let n = 0
const shot = (name) =>
  page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true })
const step = (s) => console.log('▶', s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Element clicks: toasts can sit over buttons.
const click = async (t) => {
  const exact = page.locator(`::-p-xpath(//*[self::button or self::a][normalize-space()="${t}"])`)
  await exact.setTimeout(8000).map((el) => (el.click(), true)).wait()
}
/** Date inputs follow the OS locale; set the value natively (see journey.mjs). */
const setDate = async (selector, iso) => {
  const handle = await page.locator(selector).waitHandle()
  await handle.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, iso)
}
const waitText = (t, timeout = 10000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t)

async function api(pathname, { method = 'GET', token, json, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  let body
  if (json) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) body = form
  const res = await fetch(BASE + pathname, { method, headers, body })
  if (!res.ok) throw new Error(`${method} ${pathname}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

try {
  step('a patient submits a new case (API)')
  const patient = await api('/api/auth/login', { method: 'POST', json: { email: 'patient@demo.local', password: 'Demo1234' } })
  const form = new FormData()
  form.set('specialty', 'Cardiology')
  form.set('description', 'Palpitations and dizziness for three months; Holter monitor showed an irregular rhythm.')
  form.append('documentTypes', 'lab_report')
  form.append('files', new Blob(['%PDF-1.4\n% e2e\n'], { type: 'application/pdf' }), 'holter.pdf')
  const newCase = await api('/api/patient/cases', { method: 'POST', token: patient.accessToken, form })

  step('admin signs in')
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[name=email]')
  await sleep(300)
  await page.locator('input[name=email]').fill('admin@demo.local')
  await page.locator('input[name=password]').fill('Demo1234')
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(() => location.pathname === '/admin/dashboard', { timeout: 10000 })
  await waitText('Coordinator dashboard')
  await shot('dashboard')

  step('approve the pending doctor')
  await page.goto(`${BASE}/admin/doctors`)
  await waitText('Dr. Olivia Grant')
  await click('Review')
  await waitText('Degree certificate')
  await shot('doctor-review')
  // Approval needs a passing AHPRA register check.
  await click('Record check')
  await waitText('Record AHPRA registration check')
  await setDate('dialog input[type=date]', '2027-09-30')
  await page.locator('dialog textarea').fill('MED0001234567: general and specialist registration, no conditions')
  await click('Save check')
  await waitText('valid until')
  await shot('doctor-checked')
  await click('Approve')
  await waitText('Awaiting payment', 10000).catch(() => {})
  await waitText('Approved')

  step('assign the new case')
  await page.goto(`${BASE}/admin/cases`)
  await waitText(newCase.referenceNumber)
  await page.goto(`${BASE}/admin/cases/${newCase.id}`)
  await waitText('Invite a doctor')
  await page.waitForFunction(() => document.querySelectorAll('select[aria-label=Doctor] option').length > 1, { timeout: 10000 })
  await page.evaluate(() => {
    const select = document.querySelector('select[aria-label=Doctor]')
    const match = [...select.options].find((o) => o.textContent.includes('Dr. Amelia Chen'))
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(select, match.value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await click('Invite')
  await waitText('Invited')
  await shot('case-assigned')

  step('publish one submitted plan, decline another')
  await page.goto(`${BASE}/admin/plans`)
  await waitText('To Review')
  const reviewLinks = await page.$$eval('a', (as) =>
    as.filter((a) => a.textContent.trim() === 'Review').map((a) => a.getAttribute('href')),
  )
  if (reviewLinks.length < 2) throw new Error(`expected 2 plans to review, found ${reviewLinks.length}`)
  await page.goto(BASE + reviewLinks[0])
  await waitText('MTA service fee (AUD)')
  await shot('plan-review')
  await click('Approve and send to patient')
  await waitText('With patient')
  await page.goto(BASE + reviewLinks[1])
  await waitText('MTA service fee (AUD)')
  await click('Decline')
  await page.locator('dialog textarea').fill('Please itemise the hospital fees and add a recovery estimate.')
  await click('Decline plan')
  await waitText('Declined: Please itemise')

  step('answer the patient chat')
  await page.goto(`${BASE}/admin/messages`)
  await waitText('Demo Patient')
  await page.locator('::-p-xpath(//button[contains(@class,"admin-thread")][.//strong[normalize-space()="Demo Patient"]])').click()
  await waitText('Open conversation')
  await click('Open conversation')
  await waitText('Close conversation')
  await page.locator('.chat-compose textarea').fill('Hello from your MTA coordinator!')
  await click('Send')
  await waitText('Hello from your MTA coordinator!')
  await shot('messages')
  const chat = await api('/api/patient/chat', { token: patient.accessToken })
  if (chat.status !== 'open' || !chat.messages.some((m) => m.body === 'Hello from your MTA coordinator!'))
    throw new Error('patient did not receive the message')

  if (consoleErrors.length) {
    console.log('console errors:\n' + consoleErrors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('✔ admin journey complete')
  }
} catch (error) {
  await shot('failure').catch(() => {})
  console.error('✘', error.message)
  console.error(consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
