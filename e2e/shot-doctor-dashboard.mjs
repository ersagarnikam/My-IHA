// Full-page screenshot of the doctor dashboard as the demo doctor (dev servers running).
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/login')
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'doctor@demo.local', password: 'Demo1234' }),
  })
  localStorage.setItem('iha.session', JSON.stringify(await r.json()))
})
await page.goto('http://localhost:5173/doctor/dashboard')
await page.waitForFunction(() => document.body.innerText.includes('Your conversion funnel'), { timeout: 15000 })
await new Promise((r) => setTimeout(r, 2500)) // let toasts fade
const out = path.join(import.meta.dirname, 'shots', 'doctor-dashboard.png')
await page.screenshot({ path: out, fullPage: true })
console.log(out)
await browser.close()
