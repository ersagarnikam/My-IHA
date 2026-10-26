// Drives the visa lawyer portal in headless Chrome against the dev servers: a new lawyer signs up and
// registers with a MARN, MTA checks the OMARA register and approves, assigns the demo visa
// application to them in the admin portal, and the lawyer reviews it, requests a document, keeps a
// note, moves it to Processing and Approved and uploads the visa grant. The demo case goes back to
// the demo lawyer at the end. Usage:
//   API_LOG=<path to the API's stdout log> node lawyer-journey.mjs
// The verification code is read from that log. Set E2E_BASE when Vite isn't on :5173.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const LOG = process.env.API_LOG
const OUT = path.join(import.meta.dirname, 'shots', 'lawyer')
fs.mkdirSync(OUT, { recursive: true })
const email = `lawyer-${Date.now()}@example.com`
const pdf = path.join(import.meta.dirname, 'scan.pdf')
fs.writeFileSync(pdf, '%PDF-1.4\n% e2e test file\n')

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
const waitText = (t, timeout = 10000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t)
/** The input, select or textarea inside the field labelled `label`. */
const byLabel = (label) =>
  `::-p-xpath(//label[contains(@class,"field")][.//*[normalize-space()="${label}"]]//*[self::input or self::select or self::textarea])`
const fill = (selector, value) => page.locator(selector).fill(value)
/** Date inputs follow the OS locale; set the value natively (see journey.mjs). */
const setValue = async (selector, value) => {
  const handle = await page.locator(selector).waitHandle()
  await handle.evaluate((el, v) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  }, value)
}
const radio = (label) =>
  page.locator(`::-p-xpath(//label[normalize-space()="${label}"]/input)`).map((el) => (el.click(), true)).wait()
const code = () => {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`Verification code for ${email}`))
  return lines.at(-1).trim().slice(-6)
}

async function api(pathname, { method = 'GET', token, json } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  if (json) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + pathname, { method, headers, body: json ? JSON.stringify(json) : undefined })
  if (!res.ok) throw new Error(`${method} ${pathname}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const login = (address) => api('/api/auth/login', { method: 'POST', json: { email: address, password: 'Demo1234' } })

let admin
let demoCase
try {
  step('sign up + verify')
  await page.goto(`${BASE}/login`)
  await click('Register as a visa lawyer')
  await page.waitForSelector('input[name=email]')
  await fill('input[name=email]', email)
  await fill('input[name=password]', 'Secret123')
  await fill('input[name=confirmPassword]', 'Secret123')
  for (const box of await page.$$('.consent-check input')) await box.click()
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('input[name=code]')
  await sleep(500)
  await fill('input[name=code]', code())
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(() => location.pathname === '/lawyer/register', { timeout: 10000 })

  step('registration wizard')
  await waitText('Visa Lawyer Registration')
  await fill(byLabel('Full name'), 'Grace Okafor')
  await fill(byLabel('ABN'), '51 824 753 556')
  await fill(byLabel('Phone number'), '+61 2 9000 7788')
  await fill(byLabel('Office address'), '10 Bridge Street')
  await fill(byLabel('City / State'), 'Sydney NSW')
  await fill(byLabel('Postcode'), '2000')
  await shot('wizard-practice')
  await click('Continue')
  await waitText('I am a')
  await radio('Registered migration agent (MARN)')
  await fill(byLabel('MARN (Migration Agent Registration Number)'), '12345')
  await setValue(byLabel('Registration expires on'), '2027-09-30')
  await click('Continue')
  await waitText('A MARN is 7 digits')
  await fill(byLabel('MARN (Migration Agent Registration Number)'), '1799001')
  await shot('wizard-registration')
  await click('Continue')
  await waitText('Agreement')
  const files = await page.$$('input[type=file]')
  await files[0].uploadFile(pdf)
  await page.locator('::-p-xpath(//div[@role="group"][.//*[normalize-space()="Agreement"]]//input[@type="checkbox"])').click()
  await click('Submit Registration')
  await page.waitForFunction(() => location.pathname === '/lawyer/pending-approval', { timeout: 10000 })
  await waitText('MARN on the OMARA register')
  await shot('pending')

  step('MTA checks the OMARA register and approves (admin portal)')
  admin = await login('admin@demo.local')
  const lawyers = await api('/api/admin/lawyers', { token: admin.accessToken })
  const mine = lawyers.find((l) => l.email === email)
  const lawyerSession = await page.evaluate(() => localStorage.getItem('iha.session'))
  const adminPage = await browser.newPage()
  adminPage.on('pageerror', (e) => consoleErrors.push(`admin pageerror: ${e.message}`))
  await adminPage.goto(`${BASE}/login`)
  await adminPage.evaluate((s) => localStorage.setItem('iha.session', JSON.stringify(s)), admin)
  await adminPage.goto(`${BASE}/admin/lawyers/${mine.id}`)
  await adminPage.waitForFunction(() => document.body.innerText.includes('OMARA register of migration agents'), { timeout: 10000 })
  await adminPage.locator('::-p-xpath(//button[normalize-space()="Record check"])').map((b) => (b.click(), true)).wait()
  await adminPage.waitForSelector('dialog input[type=date]')
  await adminPage.$eval('dialog input[type=date]', (el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2027-09-30')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await adminPage.locator('dialog textarea').fill('MARN 1799001 current, no sanctions')
  await adminPage.locator('::-p-xpath(//button[normalize-space()="Save check"])').map((b) => (b.click(), true)).wait()
  await adminPage.waitForFunction(() => document.body.innerText.includes('valid until'), { timeout: 10000 })
  await adminPage.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-admin-review.png`), fullPage: true })
  await adminPage.locator('::-p-xpath(//button[normalize-space()="Approve"])').map((b) => (b.click(), true)).wait()
  await adminPage.waitForFunction(() => document.body.innerText.includes('Approved'), { timeout: 10000 })

  step('MTA assigns the demo visa application (admin Visa Cases)')
  const visaCases = await api('/api/admin/visa-cases', { token: admin.accessToken })
  demoCase = visaCases.find((v) => v.lawyerName === 'James Whitfield')
  if (!demoCase) throw new Error('no demo visa case assigned to the demo lawyer')
  await adminPage.goto(`${BASE}/admin/visa-cases`)
  await adminPage.waitForFunction(() => document.body.innerText.includes('Visa Cases'), { timeout: 10000 })
  const select = `select[aria-label="Visa lawyer for ${demoCase.referenceNumber}"]`
  await adminPage.waitForSelector(select)
  await adminPage.select(select, mine.id)
  await adminPage.waitForFunction(() => document.body.innerText.includes('Lawyer assigned'), { timeout: 10000 })
  await adminPage.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-admin-visa-cases.png`), fullPage: true })
  await adminPage.close()

  step('dashboard and case list')
  await page.evaluate((v) => localStorage.setItem('iha.session', v), lawyerSession)
  await page.goto(`${BASE}/lawyer/dashboard`)
  await waitText('Welcome, Grace Okafor')
  await waitText('waiting for review')
  await shot('dashboard')
  await page.goto(`${BASE}/lawyer/cases`)
  await waitText(demoCase.referenceNumber)
  await page.locator('::-p-xpath(//a[normalize-space()="View"])').map((a) => (a.click(), true)).wait()
  await waitText('Visa Application (Subclass 602)')
  await waitText('Hospital Invitation Letter')
  await shot('case-new')

  step('review: under review, request a document, note')
  await click('Update Status')
  await page.waitForSelector('dialog select')
  await page.select('dialog select', 'under_review')
  await page.locator('::-p-xpath(//dialog//button[normalize-space()="Update Status"])').map((b) => (b.click(), true)).wait()
  await waitText('Request Document')
  await click('Request Document')
  await page.waitForSelector('dialog select')
  await page.select('dialog select', 'bank_statement')
  await page.locator('dialog input').fill('Last three months of statements')
  await click('Send Request')
  await waitText('Requested from the patient')
  await page.locator('textarea[placeholder="Add a note…"]').fill('Asked for recent statements; balance looks fine.')
  await click('Add Note')
  await waitText('balance looks fine')
  await shot('case-review')

  step('processing, then approved')
  for (const status of ['processing', 'approved']) {
    await click('Update Status')
    await page.waitForSelector('dialog select')
    await page.select('dialog select', status)
    await page.locator('::-p-xpath(//dialog//button[normalize-space()="Update Status"])').map((b) => (b.click(), true)).wait()
    await page.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 10000 })
  }
  await waitText('Approved')
  await shot('case-approved')

  step('upload the visa grant')
  await page.goto(`${BASE}/lawyer/documents`)
  await waitText(demoCase.referenceNumber)
  const input = await page.$('input[type=file]')
  await input.uploadFile(pdf)
  await waitText('Uploaded')
  await shot('documents')

  step('the other pages render')
  for (const p of ['/lawyer/messages', '/lawyer/notifications', '/lawyer/account-settings']) {
    await page.goto(BASE + p)
    await page.waitForSelector('h1')
  }
  await shot('settings')

  if (consoleErrors.length) {
    console.log('console errors:\n' + consoleErrors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('✔ lawyer journey complete')
  }
} catch (error) {
  await shot('failure').catch(() => {})
  console.error('✘', error.message)
  console.error(consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  // Give the demo case back to the demo lawyer so the smoke run and demos still find it.
  if (admin && demoCase) {
    await api(`/api/admin/visa-cases/${demoCase.caseId}/lawyer`, {
      method: 'POST',
      token: admin.accessToken,
      json: { lawyerId: demoCase.lawyerId },
    }).catch(() => {})
  }
  await browser.close()
}
