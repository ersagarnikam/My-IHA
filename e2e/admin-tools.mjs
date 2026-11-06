// Drives the admin tools in headless Chrome against the dev servers: a patient's message reaches an
// open inbox live, an admin suspends and reactivates a peer doctor (whose session stops at once),
// adds staff, searches the audit log, exports payments, closes a case and opens their own account.
// No API log needed; run on a freshly started API (it closes a demo case). Usage: node admin-tools.mjs
// Set E2E_BASE when Vite isn't on :5173.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const OUT = path.join(import.meta.dirname, 'shots', 'admin-tools')
fs.mkdirSync(OUT, { recursive: true })

async function api(pathname, { method = 'GET', token, json } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  if (json) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + pathname, { method, headers, body: json ? JSON.stringify(json) : undefined })
  if (!res.ok) throw new Error(`${method} ${pathname}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const login = (email) => api('/api/auth/login', { method: 'POST', json: { email, password: 'Demo1234' } })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
})
const page = await browser.newPage()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
let n = 0
const shot = (name) =>
  page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true })
const step = (s) => console.log('▶', s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitText = (t, timeout = 10000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t)
const click = (t) =>
  page
    .locator(`::-p-xpath(//*[self::button or self::a][normalize-space()="${t}"])`)
    .setTimeout(8000)
    .map((el) => (el.click(), true))
    .wait()
const dialogClick = (t) =>
  page.locator(`::-p-xpath(//dialog//button[normalize-space()="${t}"])`).map((b) => (b.click(), true)).wait()

try {
  const admin = await login('admin@demo.local')
  const patient = await login('patient@demo.local')
  await page.goto(`${BASE}/login`)
  await page.evaluate((s) => localStorage.setItem('iha.session', JSON.stringify(s)), admin)

  step('dashboard counts every registration; lawyer alerts link to lawyers')
  await page.goto(`${BASE}/admin/dashboard`)
  await waitText('Registrations to review')
  const hospitalLinks = await page.$$eval('a[href^="/admin/hospitals/"]', (links) =>
    links.map((l) => l.textContent),
  )
  if (hospitalLinks.some((t) => /Harbourside|Whitfield/.test(t))) throw new Error('a lawyer alert links to hospitals')
  await shot('dashboard')

  step('a patient message arrives live in an open inbox')
  const threads = await api('/api/admin/chats', { token: admin.accessToken })
  const thread = threads.find((t) => t.kind === 'patient')
  await api(`/api/admin/chats/patient/${thread.id}/open`, { method: 'POST', token: admin.accessToken })
  await page.goto(`${BASE}/admin/messages?kind=patient&thread=${thread.id}`)
  await sleep(1500)
  const text = `Live test ${Date.now()}`
  await api(process.env.CHAT_PATH ?? '/api/patient/chat/messages', {
    method: 'POST',
    token: patient.accessToken,
    json: { body: text },
  })
  await waitText(text, 5000) // well inside the 60 s fallback poll, so this can only be the push
  await shot('live-message')
  // admin-journey.mjs expects to open this conversation itself.
  await api(`/api/admin/chats/patient/${thread.id}/close`, { method: 'POST', token: admin.accessToken })

  step('suspend a peer doctor: their open session stops')
  const peer = await login('peer2@demo.local')
  const users = await api('/api/admin/users', { token: admin.accessToken })
  const target = users.find((u) => u.email === 'peer2@demo.local')
  await page.goto(`${BASE}/admin/users`)
  await waitText('MTA Staff')
  await shot('users')
  await page.goto(`${BASE}/admin/users/${target.id}`)
  await waitText('Send password reset')
  await click('Suspend')
  await page.waitForSelector('dialog textarea')
  await page.locator('dialog textarea').fill('Registration under review by MTA')
  await dialogClick('Suspend')
  await waitText('Registration under review by MTA')
  await shot('suspended')
  const blocked = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${peer.accessToken}` } })
  if (blocked.status !== 401) throw new Error(`suspended token answered ${blocked.status}`)
  await click('Reactivate')
  await page.waitForFunction(() => !document.body.innerText.includes('Registration under review'), { timeout: 8000 })

  step('add MTA staff')
  await page.goto(`${BASE}/admin/users`)
  await waitText('Add MTA staff')
  const staff = `staff-${Date.now()}@example.com`
  await click('Add MTA staff')
  await page.waitForSelector('dialog input[name=email]')
  await page.locator('dialog input[name=email]').fill(staff)
  await dialogClick('Add staff')
  await waitText(staff)

  step('audit log shows and finds those actions')
  await page.goto(`${BASE}/admin/audit`)
  await waitText('user.admin_created')
  await page.locator('.dr-toolbar input').fill('user.suspended')
  await page.waitForFunction(
    () => !document.body.innerText.includes('user.admin_created') && document.body.innerText.includes('user.suspended'),
    { timeout: 8000 },
  )
  await waitText('Registration under review by MTA')
  await shot('audit')

  step('payments export')
  await page.goto(`${BASE}/admin/payments`)
  await waitText('Export CSV')
  const res = await fetch(`${BASE}/api/admin/payments/export`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  })
  const csv = await res.text()
  if (!res.ok || !res.headers.get('content-type').includes('text/csv') || !csv.startsWith('Paid at'))
    throw new Error('bad export')
  console.log(`  ${csv.trim().split('\r\n').length - 1} payments exported`)

  step('close a case')
  const cases = await api('/api/admin/cases', { token: admin.accessToken })
  const open = cases.find((c) => ['evaluation', 'under_review', 'case_submitted'].includes(c.status))
  await page.goto(`${BASE}/admin/cases/${open.id}`)
  await click('Close case')
  await page.waitForSelector('dialog textarea')
  await page.locator('dialog textarea').fill('Patient withdrew by phone')
  await dialogClick('Close case')
  await waitText('Patient withdrew by phone')
  await shot('case-closed')

  step('my account')
  await page.goto(`${BASE}/admin/dashboard`)
  await page.waitForSelector('a.topbar-user')
  await page.$eval('a.topbar-user', (a) => a.click())
  await waitText('Change Password')
  await shot('account')

  if (consoleErrors.length) {
    console.log('console errors:\n' + consoleErrors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('✔ admin tools journey complete')
  }
} catch (error) {
  await shot('failure').catch(() => {})
  console.error('✘', error.message)
  console.error(consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
