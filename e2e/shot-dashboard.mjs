// Screenshots the patient dashboard for an account at desktop and phone widths.
// Usage: node shot-dashboard.mjs <email> <password> shots/<name>
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const [email, password, out] = process.argv.slice(2)
const session = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json())

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setViewport({ width: 2000, height: 712 })
await page.goto(`${BASE}/login`)
await page.evaluate((s) => localStorage.setItem('iha.session', JSON.stringify(s)), session)
await page.goto(`${BASE}/patient/dashboard`)
await page.waitForFunction(() => document.body.innerText.includes('Journey'), { timeout: 15000 })
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: `${out}-desktop.png` })
await page.setViewport({ width: 390, height: 844 })
await new Promise((r) => setTimeout(r, 500))
await page.screenshot({ path: `${out}-mobile.png`, fullPage: true })
console.log(errors.length ? errors.join('\n') : 'no page errors')
await browser.close()
