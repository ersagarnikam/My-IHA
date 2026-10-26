// Drives the real patient UI end to end in headless Chrome (needs the API on :8080
// in the dev profile and Vite on :5173). Usage:
//   API_LOG=<path to the API's stdout log> node journey.mjs
// The verification code is read from that log. Screenshots go to ./shots.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const LOG = process.env.API_LOG
const OUT = path.join(import.meta.dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
const email = `ui-${Date.now()}@example.com`
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
const shot = async (name) => page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true })
const text = (t) => page.locator(`::-p-text(${t})`)
const click = async (t) => {
  // Exact-text buttons/links first; fall back to any element containing the text.
  const exact = page.locator(`::-p-xpath(//*[self::button or self::a][normalize-space()=\"${t}\"])`)
  try {
    await exact.setTimeout(4000).click()
  } catch {
    await text(t).setTimeout(8000).click()
  }
}
const waitText = (t) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout: 10000 }, t)
const step = (s) => console.log('▶', s)
const code = (purpose = 'Verification') => {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`${purpose} code for ${email}`))
  return lines.at(-1).trim().slice(-6)
}
const type = async (selector, value) => {
  await page.locator(selector).fill(value)
}

try {
  step('register + verify')
  await page.goto(`${BASE}/register`)
  await type('input[name=fullName]', 'Wei Zhang')
  await type('input[name=email]', email)
  await type('input[name=password]', 'Secret123')
  await type('input[name=confirmPassword]', 'Secret123')
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('input[name=code]')
  await new Promise((r) => setTimeout(r, 500))
  await type('input[name=code]', code())
  await page.locator('button[type=submit]').click()

  step('onboarding wizard')
  await page.waitForFunction(() => location.pathname === '/patient/profile/setup', { timeout: 10000 })
  await shot('profile-setup')
  await type('input[name=dateOfBirth]', '1970-05-01')
  await page.select('select[name=gender]', 'male')
  await page.select('select[name=nationality]', 'China')
  await page.select('select[name=countryOfResidence]', 'China')
  await type('input[name=phone]', '+8613812345678')
  await click('Next')
  await page.waitForSelector('textarea[name=medicalHistory]')
  await type('textarea[name=medicalHistory]', 'Hypertension, controlled')
  await page.locator('.tag-input input').fill('Penicillin')
  await page.keyboard.press('Enter')
  await click('Next')
  await page.waitForSelector('input[name=name]')
  await type('input[name=name]', 'Li Wei')
  await page.select('select[name=relationship]', 'Spouse')
  await type('input[name=phone]', '+8613912345678')
  await click('Submit')
  await page.waitForFunction(() => location.pathname === '/patient/dashboard', { timeout: 10000 })
  await waitText('Welcome back, Wei')
  await shot('dashboard-empty')

  step('new case wizard')
  await page.goto(`${BASE}/patient/cases/new`)
  await page.waitForSelector('select')
  await page.select('select', 'Cardiology')
  await page.type('textarea', 'Shortness of breath and chest tightness on exertion for six months; echocardiogram shows moderate aortic stenosis.')
  await click('Next')
  const input = await page.waitForSelector('input[type=file]')
  await input.uploadFile(pdf)
  await waitText('scan.pdf')
  await click('Next')
  await waitText('Review')
  await shot('case-review')
  await click('Submit')
  await waitText('securely submitted')
  await shot('case-submitted')
  await click('Track Status')
  await waitText('Uploaded Documents')
  const caseUrl = page.url()

  step('options published (dev) → request consultation')
  await click('Publish two treatment options')
  await waitText("St Vincent's Hospital Sydney")
  await shot('case-options')
  await page.locator('.option-card button').click()
  await waitText('Treatment Plan Details')
  await shot('option-detail')
  await click('Request Online Consultation')
  await waitText('consultation request has been sent')
  await page.keyboard.press('Escape')

  step('doctor proposes slots (dev) → pick one → pay fee')
  await click('Propose consultation times')
  await waitText('Consultation: select a time')
  await page.locator('.option-card button').click()
  await page.waitForSelector('.slot input')
  await page.locator('.slot input').click()
  await click('Confirm Selected Time')
  await waitText('Pay $200 AUD to Confirm')
  await click('Pay $200 AUD to Confirm')
  await waitText('Consultation Payment')
  await shot('consultation-payment')
  await click('Pay Now')
  await waitText('Payment received')
  await page.goto(caseUrl)
  await waitText('Consultation scheduled')

  step('select option → pay treatment')
  await page.locator('.option-card button').click()
  await click('Select This Treatment Option')
  await click('Confirm')
  await page.waitForFunction(() => location.pathname.endsWith('/payment'), { timeout: 10000 })
  await waitText('Total Due')
  await shot('treatment-payment')
  await click('Pay Now')
  await waitText('Payment Confirmed')
  await page.goto(caseUrl)
  await waitText('Payment Confirmed')

  step('hospital letters (dev) → visa wizard')
  await click('Send hospital letters')
  await waitText('Start visa application')
  await shot('case-visa-ready')
  await click('Start visa application')
  await waitText('Traveler Details')
  await page.locator('input[placeholder="e.g. A12345678"]').fill('E12345678')
  const dates = await page.$$('input[type=date]')
  await dates[1].type('01012032')
  await click('Next')
  await waitText('pre-existing medical conditions')
  const radios = await page.$$('input[type=radio]')
  await radios[1].click() // No
  await radios[2].click() // Yes
  await click('Next')
  await page.locator('input[placeholder="Name of doctor or specialist"]').fill('Dr Amelia Chen')
  await page.locator('input[placeholder="Hospital or clinic name"]').fill("St Vincent's Hospital Sydney")
  await page.locator('input[placeholder="Full address"]').fill('390 Victoria St, Darlinghurst NSW')
  await page.locator('input[placeholder="+61 2 9123 4567"]').fill('+61283821111')
  await click('Next')
  await page.select('select', 'Self-Funded')
  await page.locator('input[placeholder="e.g. AUD 50,000"]').fill('AUD 200,000')
  await (await page.waitForSelector('.doc-slot input[type=file]')).uploadFile(pdf)
  await waitText('bank_statement.pdf')
  await click('Next')
  // Typed dates depend on the browser locale (dd/mm vs mm/dd); set the values directly.
  await waitText('Intended Arrival Date')
  const iso = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10)
  await page.$$eval(
    'input[type=date]',
    (inputs, values) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      inputs.forEach((input, i) => {
        setter.call(input, values[i])
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    [iso(30), iso(60)],
  )
  await click('Next')
  const slots = await page.$$('.doc-slot input[type=file]')
  await slots[0].uploadFile(pdf)
  await waitText('passport.pdf')
  await (await page.$$('.doc-slot input[type=file]'))[1].uploadFile(pdf)
  await waitText('passport_photograph.pdf')
  await shot('visa-documents-step')
  await click('Next')
  const legal = await page.$$('input[type=radio]')
  await legal[1].click()
  await legal[3].click()
  await click('Next')
  await waitText('travelling with a companion')
  await click('Submit Application')
  await waitText('Application Submitted')
  await shot('visa-submitted')

  step('visa detail, chat, documents, payments, dashboard')
  const pending = new Map()
  page.on('request', (r) => r.url().includes('/api/') && pending.set(r, Date.now()))
  page.on('requestfinished', (r) => pending.delete(r))
  page.on('requestfailed', (r) => { console.log('failed', r.url(), r.failure()?.errorText); pending.delete(r) })
  globalThis.dumpPending = () => [...pending.entries()].map(([r, t]) => `${r.method()} ${r.url()} ${Date.now() - t}ms`)
  await page.goto(`${BASE}/patient/visa-travel?tab=visa`)
  await click('View Details')
  await waitText('Passport Number')
  await shot('visa-detail')
  await page.goto(`${BASE}/patient/messages`)
  await click('Open chat as coordinator')
  await waitText('care coordinator')
  await page.locator('textarea').fill('Thanks! When will my visa lawyer contact me?')
  await click('Send')
  await waitText('When will my visa lawyer')
  await shot('messages')
  await page.goto(`${BASE}/patient/documents`)
  await waitText('-other.pdf')
  await shot('documents')
  await page.goto(`${BASE}/patient/payments`)
  await waitText('Treatment Payment')
  await shot('payments')
  await page.goto(`${BASE}/patient/dashboard`)
  await waitText('Journey Progress')
  await shot('dashboard')
  await click('中文')
  await waitText('欢迎回来')
  await shot('dashboard-zh')
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(`${BASE}/patient/cases`)
  await new Promise((r) => setTimeout(r, 800))
  await shot('cases-mobile-zh')
  console.log('✔ journey complete')
} catch (error) {
  console.error('✖', error.message)
  await shot('FAILED')
  console.error('URL:', page.url())
  console.error('pending:', globalThis.dumpPending?.())
  console.error((await page.evaluate(() => document.body.innerText)).slice(0, 1500))
  process.exitCode = 1
} finally {
  if (consoleErrors.length) console.log('Browser errors:\n' + [...new Set(consoleErrors)].slice(0, 15).join('\n'))
  await browser.close()
}
