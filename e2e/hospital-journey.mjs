// Drives the hospital portal in headless Chrome against the dev servers (API in the dev profile
// with its demo data, Vite in front of it): a new hospital signs up and registers through the
// wizard, MTA asks for more information and then approves (admin portal), and the demo hospital
// issues and sends both visa letters for a paid case. Usage:
//   API_LOG=<path to the API's stdout log> node hospital-journey.mjs
// The verification code is read from that log. Set E2E_BASE when Vite isn't on :5173.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const LOG = process.env.API_LOG
const OUT = path.join(import.meta.dirname, 'shots', 'hospital')
fs.mkdirSync(OUT, { recursive: true })
const email = `hospital-${Date.now()}@example.com`
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
const fill = (selector, value) => page.locator(selector).fill(value)
const code = () => {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`Verification code for ${email}`))
  return lines.at(-1).trim().slice(-6)
}
const byLabel = (label) =>
  `::-p-xpath(//label[contains(@class,"field")][.//*[normalize-space()="${label}"]]//input)`

async function api(pathname, { method = 'GET', token, json } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  if (json) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + pathname, { method, headers, body: json ? JSON.stringify(json) : undefined })
  if (!res.ok) throw new Error(`${method} ${pathname}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const login = (address) => api('/api/auth/login', { method: 'POST', json: { email: address, password: 'Demo1234' } })

try {
  step('sign up + verify')
  await page.goto(`${BASE}/login`)
  await click('Register your hospital')
  await page.waitForSelector('input[name=email]')
  await fill('input[name=email]', email)
  await fill('input[name=password]', 'Secret123')
  await fill('input[name=confirmPassword]', 'Secret123')
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('input[name=code]')
  await sleep(500)
  await fill('input[name=code]', code())
  await page.locator('button[type=submit]').click()
  await page.waitForFunction(() => location.pathname === '/hospital/register', { timeout: 10000 })

  step('registration wizard')
  await waitText('Hospital Registration')
  await fill(byLabel('Hospital name'), 'Harbour Private Hospital')
  await fill(byLabel('Registration number'), 'HOSP-E2E-1')
  await fill(byLabel('ABN'), '12345678901')
  await fill(byLabel('Phone number'), '+61 2 9000 1234')
  await click('Continue')
  await waitText('Enter a valid ABN')
  await fill(byLabel('ABN'), '51 824 753 556')
  await shot('wizard-basic')
  await click('Continue')
  await waitText('Full address')
  await fill(byLabel('State / City'), 'Sydney')
  await fill(byLabel('Full address'), '1 Harbour Road, Sydney NSW')
  await fill(byLabel('Zip / postcode'), '2000')
  await click('Continue')
  await waitText('Hospital type')
  await page.locator('::-p-xpath(//label[normalize-space()="Multi-specialty"]/input)').click()
  await page.locator('::-p-xpath(//label[normalize-space()="Cardiology"]/input)').click()
  await fill(byLabel('Number of beds'), '150')
  await fill(byLabel('License number'), 'LIC-E2E-1')
  await fill('input[placeholder="e.g. Private room, ICU"]', 'Private')
  await click('Add')
  await fill(byLabel('Accreditation body'), 'ACHS')
  await shot('wizard-details')
  await click('Continue')
  await waitText('Agreement')
  const files = await page.$$('input[type=file]')
  await files[0].uploadFile(pdf)
  await files[1].uploadFile(pdf)
  await page.locator('::-p-xpath(//div[@role="group"][.//*[normalize-space()="Agreement"]]//input[@type="checkbox"])').click()
  await click('Submit Registration')
  await page.waitForFunction(() => location.pathname === '/hospital/pending-approval', { timeout: 10000 })
  await waitText('Your registration is under review')
  await shot('pending')

  step('MTA asks for more information, the hospital resubmits, MTA approves')
  const admin = await login('admin@demo.local')
  const hospitals = await api('/api/admin/hospitals', { token: admin.accessToken })
  const mine = hospitals.find((h) => h.email === email)
  await api(`/api/admin/hospitals/${mine.id}/review`, {
    method: 'POST',
    token: admin.accessToken,
    json: { outcome: 'more_info_requested', reason: 'Please add your current accreditation certificate.' },
  })
  await page.reload()
  await waitText('Please add your current accreditation certificate.')
  await click('Update and resubmit')
  await waitText('Update your registration')
  for (let i = 0; i < 3; i++) await click('Continue')
  await waitText('Agreement')
  await page.locator('::-p-xpath(//div[@role="group"][.//*[normalize-space()="Agreement"]]//input[@type="checkbox"])').click()
  await click('Resubmit Registration')
  await waitText('Your registration is under review')

  // Approve through the admin portal UI (same browser storage: keep the hospital's session to restore).
  const hospitalSession = await page.evaluate(() => localStorage.getItem('iha.session'))
  const adminPage = await browser.newPage()
  adminPage.on('pageerror', (e) => consoleErrors.push(`admin pageerror: ${e.message}`))
  await adminPage.goto(`${BASE}/login`)
  await adminPage.evaluate((s) => localStorage.setItem('iha.session', JSON.stringify(s)), admin)
  await adminPage.goto(`${BASE}/admin/hospitals/${mine.id}`)
  await adminPage.waitForFunction(() => document.body.innerText.includes('Harbour Private Hospital'), { timeout: 10000 })
  await adminPage.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-admin-review.png`), fullPage: true })
  await adminPage.locator('::-p-xpath(//button[normalize-space()="Approve"])').click()
  await adminPage.waitForFunction(() => document.body.innerText.includes('Approved'), { timeout: 10000 })
  await adminPage.close()

  await page.evaluate((v) => localStorage.setItem('iha.session', v), hospitalSession)
  await page.reload()
  await page.waitForFunction(() => location.pathname === '/hospital/dashboard', { timeout: 10000 })
  await waitText('Welcome, Harbour Private Hospital')
  await shot('new-hospital-dashboard')

  step('demo hospital issues and sends the visa letters')
  const hospital = await login('hospital@demo.local')
  await page.evaluate((s) => localStorage.setItem('iha.session', JSON.stringify(s)), hospital)
  await page.goto(`${BASE}/hospital/dashboard`)
  await waitText('Welcome, St Vincent')
  await shot('dashboard')
  await page.goto(`${BASE}/hospital/documents`)
  await waitText('Waiting for letters')
  const cases = await api('/api/hospital/letters', { token: hospital.accessToken })
  const target = cases.find((c) => c.lettersSent === 0 && c.caseStatus === 'payment_confirmed')
  if (!target) throw new Error('no paid case waiting for letters in the demo data')
  await page.goto(`${BASE}/hospital/cases/${target.planId}`)
  await waitText('Visa letters')
  for (const label of ['Hospital Invitation Letter', 'Appointment Confirmation Letter']) {
    await page
      .locator(`::-p-xpath(//div[contains(@class,"hp-letter")][.//*[normalize-space()="${label}"]]//button[normalize-space()="Generate"])`)
      .click()
    await page.waitForFunction(
      (l) =>
        [...document.querySelectorAll('.hp-letter')].some(
          (el) => el.textContent.includes(l) && el.textContent.includes('Generated'),
        ),
      { timeout: 10000 },
      label,
    )
    await page
      .locator(`::-p-xpath(//div[contains(@class,"hp-letter")][.//*[normalize-space()="${label}"]]//button[normalize-space()="Send to patient"])`)
      .map((el) => (el.click(), true))
      .wait()
    await page.waitForSelector('dialog')
    await page.locator('::-p-xpath(//dialog//button[normalize-space()="Send to patient"])').map((el) => (el.click(), true)).wait()
    await page.waitForFunction(
      (l) =>
        [...document.querySelectorAll('.hp-letter')].some((el) => el.textContent.includes(l) && el.textContent.includes('Sent')),
      { timeout: 10000 },
      label,
    )
  }
  await shot('letters-sent')

  // The patient can now start the visa application for that case.
  const patient = await login('patient@demo.local')
  const visa = await api('/api/patient/visa-submissions', { token: patient.accessToken })
  const eligible = visa.eligibleCases.find((c) => c.caseId === target.caseId)
  if (!eligible?.lettersReady) throw new Error('letters did not reach the patient')

  step('the other pages render')
  for (const p of ['/hospital/cases', '/hospital/patients', '/hospital/doctors', '/hospital/messages', '/hospital/account-settings']) {
    await page.goto(BASE + p)
    await page.waitForSelector('h1')
  }
  await shot('settings')

  if (consoleErrors.length) {
    console.log('console errors:\n' + consoleErrors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('✔ hospital journey complete')
  }
} catch (error) {
  await shot('failure').catch(() => {})
  console.error('✘', error.message)
  console.error(consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
