// Drives the doctor portal end to end in headless Chrome: sign-up, registration
// wizard, approval and fee (dev simulation), then a case from invitation to a
// scheduled consultation. Needs the API on :8080 (dev profile, so the demo
// patient exists and /api/dev/* is on) and Vite on :5173. Usage:
//   API_LOG=<path to the API's stdout log> node doctor-journey.mjs
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const LOG = process.env.API_LOG
const OUT = path.join(import.meta.dirname, 'shots', 'doctor')
fs.mkdirSync(OUT, { recursive: true })
const email = `dr-${Date.now()}@example.com`
const pdf = path.join(import.meta.dirname, 'scan.pdf')
fs.writeFileSync(pdf, '%PDF-1.4\n% e2e test file\n')

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 900 },
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
const click = async (t) => {
  const exact = page.locator(`::-p-xpath(//*[self::button or self::a][normalize-space()="${t}"])`)
  try {
    // element.click(): toasts can overlap buttons near the bottom right.
    await exact.setTimeout(5000).map((el) => (el.click(), true)).wait()
  } catch {
    await page.locator(`::-p-text(${t})`).setTimeout(8000).click()
  }
}
const waitText = (t, timeout = 10000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t)
const waitPath = (p) => page.waitForFunction((s) => location.pathname === s, { timeout: 10000 }, p)
/** The input/textarea/select inside the field whose label starts with `label`. */
const field = (label, tag = '*[self::input or self::textarea or self::select]') =>
  page.locator(
    `::-p-xpath(//*[contains(@class,"field")][.//*[contains(@class,"field-label")][starts-with(normalize-space(),"${label}")]]//${tag})`,
  )
const fill = (label, value) => field(label).fill(value)
const check = (text) => page.locator(`::-p-xpath(//label[normalize-space()="${text}"]/input)`).click()
const code = () => {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`Verification code for ${email}`))
  return lines.at(-1).trim().slice(-6)
}
const uploadTo = async (label, file) => {
  const input = await page.$(
    `::-p-xpath(//*[@role="group"][.//*[contains(@class,"field-label")][starts-with(normalize-space(),"${label}")]]//input[@type="file"])`,
  )
  await input.uploadFile(file)
}
const isoDate = (days) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}
/** Date inputs: type in the locale's order (en-AU dd/mm/yyyy in this Chrome). */
const setDate = async (locator, iso) => {
  const handle = await locator.waitHandle()
  await handle.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, iso)
}

try {
  step('sign up + verify')
  await page.goto(`${BASE}/login`)
  await click('Register as a doctor')
  await waitPath('/register/doctor')
  await waitText('Register as a doctor')
  await sleep(300)
  await page.locator('input[name=email]').fill(email)
  await page.locator('input[name=password]').fill('Secret123')
  await page.locator('input[name=confirmPassword]').fill('Secret123')
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('input[name=code]')
  await sleep(500)
  await page.locator('input[name=code]').fill(code())
  await page.locator('button[type=submit]').click()
  await waitPath('/doctor/register')

  step('registration wizard')
  await fill('Full name', 'Dr. Priya Raman')
  await fill('Phone number', '+61412345678')
  await shot('wizard-basic')
  await click('Continue')
  await waitText('Specialties')
  await sleep(500)
  await check('Cardiology')
  await fill('Qualifications', 'MBBS, FRACP')
  await fill('Years of experience', '11')
  await fill('AHPRA registration number', 'MED0009876543')
  await check('Hindi')
  await fill('Professional bio', 'Interventional cardiologist.')
  await click('Continue')
  await waitText('Hospital affiliations')
  await fill('Department', 'Cardiology')
  await check('Consultant')
  await check("St Vincent's Hospital Sydney — Sydney")
  await click('Continue')
  await waitText('Degree certificate')
  await uploadTo('Medical license', pdf)
  await uploadTo('Degree certificate', pdf)
  await shot('wizard-documents')
  await click('Submit Registration')
  await waitPath('/doctor/pending-approval')
  await waitText('under review')
  await shot('pending-approval')

  step('admin approves (dev) → registration fee')
  await click('Approve my registration (admin)')
  await waitPath('/doctor/registration-fee')
  await waitText('$5,000.00')
  await shot('registration-fee')
  await click('Pay Now')
  await waitPath('/doctor/dashboard')
  await waitText('Welcome back, Dr. Priya Raman')
  await waitText('Your conversion funnel')

  step('admin assigns a case (dev)')
  await click('Assign me a new case (patient + admin)')
  await waitText('New case')
  await shot('dashboard')
  await page.goto(`${BASE}/doctor/cases`)
  await waitText('Dermatology')
  await page.locator('::-p-xpath(//a[normalize-space()="View"])').map((a) => (a.click(), true)).wait()
  await waitText('Case Details')

  step('accept + start evaluation')
  await click('Accept')
  await waitText('Start Evaluation')
  await click('Start Evaluation')
  await waitText('Build Treatment Plan')

  step('request more documents; patient uploads (dev)')
  // A success toast can sit over this button; click the element itself.
  await page.locator('::-p-xpath(//button[normalize-space()="Request More Documents"])').map((b) => b.click()).wait()
  await waitText('Select Required Documents')
  await sleep(300)
  await page.locator('dialog input[type=checkbox]').click()
  await page.locator('dialog textarea').fill('Recent blood work please.')
  await click('Send Request')
  await waitText('Document Requests')
  await waitText('Pending')
  await click('Upload the requested documents (patient)')
  await waitText('Received')
  await shot('case-detail')

  step('initial Zoom consultation: propose, patient pays (dev), it takes place (dev)')
  await waitText('Initial Zoom Consultation')
  await setDate(page.locator('#initial-consultation input[type=date]'), isoDate(3))
  await click('Send times to patient')
  await waitText('Waiting for the patient to choose')
  await click('Choose the first time and pay (patient)')
  await waitText('Booked and paid')
  await click('Fast-forward: the consultation has taken place')
  await waitText('Consultation held')
  await shot('initial-consultation')

  step('treatment plan: draft, then submit')
  await click('Build Treatment Plan')
  await waitText('Primary Diagnosis')
  await fill('Primary Diagnosis', 'Chronic eczema with secondary infection')
  await click('Save Draft')
  await waitText('Draft saved.')
  await check('Therapy')
  await fill('Procedure / Recommended Treatment', 'Phototherapy course')
  await setDate(field('Treatment Start Date'), isoDate(30))
  await setDate(field('Treatment End Date'), isoDate(44))
  await waitText('Duration: 15 days')
  await fill('Estimated Hospital Stay', 'Day patient')
  await (await field('Select Hospital').waitHandle()).evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(el, el.options[1].value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await check('Private')
  await fill('Doctor Fees (AUD)', '4500')
  await fill('Hospital Fees (AUD)', '2500')
  await click('+ Diagnostics & Lab')
  await page.locator('input[aria-label=Amount]').fill('600')
  await waitText('$7,600.00')
  await check('I confirm this treatment plan is accurate')
  await shot('treatment-plan')
  await click('Submit Plan')
  await waitText('Treatment Plan Sent — View')
  await waitText('Treatment Plan Submitted')

  step('admin publishes (dev); patient requests a consultation (dev)')
  await click('Approve plan and send it to the patient (admin)')
  await waitText('Awaiting Patient')
  await click('Request an online consultation (patient)')
  await click('View Consultation')
  await waitText('Propose Consultation Times')

  step('propose a time; patient picks it and pays (dev)')
  await setDate(page.locator('input[type=date]'), isoDate(10))
  await click('Send to Patient')
  await waitText('Proposed Times')
  await click('Choose the first time and pay (patient)')
  await waitText('Scheduled Meeting')
  await waitText('(Brisbane Time)')
  await shot('consultation')
  await page.goto(`${BASE}/doctor/consultations`)
  await waitText('Scheduled')

  step('support chat (dev opens it)')
  await page.goto(`${BASE}/doctor/messages`)
  await click('Open chat as MTA coordinator (admin)')
  await waitText('MTA provider team')
  await page.locator('.chat-compose textarea').fill('Thanks, all good.')
  await click('Send')
  await waitText('Thanks, all good.')

  step('settings: availability, billing, invoices')
  await page.goto(`${BASE}/doctor/account-settings?tab=availability`)
  await page.locator('input[aria-label="Working on saturday"]').click()
  await click('Save Availability')
  await waitText('Availability updated.')
  await page.goto(`${BASE}/doctor/account-settings?tab=invoices`)
  await waitText('Registration Fee')
  await shot('invoices')
  await page.goto(`${BASE}/doctor/account-settings`)
  await waitText('MED0009876543')
  await shot('settings-profile')

  if (consoleErrors.length) {
    console.log('console errors:\n' + consoleErrors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('✔ doctor journey complete')
  }
} catch (error) {
  await shot('failure').catch(() => {})
  console.error('✘', error.message)
  console.error(consoleErrors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
