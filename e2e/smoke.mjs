// Opens every page of the patient, doctor, hospital, lawyer and admin portals as the demo accounts (needs the
// API on :8080 in the dev profile and Vite on :5173) and fails on crashes, console errors,
// failed API calls, error panels or "not found" pages. Desktop and phone widths. Usage:
//   node smoke.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'

async function api(path, token) {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json()
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Demo1234' }),
  })
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`)
  return res.json()
}

const first = (list, what) => {
  if (!list.length) throw new Error(`no ${what} in the demo data`)
  return list[0]
}

const patient = await login('patient@demo.local')
const doctor = await login('doctor@demo.local')
const admin = await login('admin@demo.local')
const hospital = await login('hospital@demo.local')
const lawyer = await login('lawyer@demo.local')

const patientCase = first(await api('/api/patient/cases', patient.accessToken), 'patient cases')
const visas = await api('/api/patient/visa-submissions', patient.accessToken)
const doctorCases = await api('/api/doctor/cases', doctor.accessToken)
// The plan page needs a case the doctor has accepted (the newest one is usually a fresh invitation).
const doctorCase = first(doctorCases.filter((c) => c.assignment?.status === 'accepted'), 'accepted doctor cases')
const consultations = await api('/api/doctor/consultations', doctor.accessToken)
const adminDoctor = first(await api('/api/admin/doctors', admin.accessToken), 'doctors')
const adminCase = first(await api('/api/admin/cases', admin.accessToken), 'cases')
const adminPlan = first(await api('/api/admin/plans', admin.accessToken), 'plans')
const adminPayment = first(await api('/api/admin/payments', admin.accessToken), 'payments')
const adminHospital = first(await api('/api/admin/hospitals', admin.accessToken), 'hospitals')
const hospitalCase = first(await api('/api/hospital/cases', hospital.accessToken), 'hospital cases')
const adminLawyer = first(await api('/api/admin/lawyers', admin.accessToken), 'lawyers')
const lawyerCase = first(await api('/api/lawyer/cases', lawyer.accessToken), 'lawyer cases')
const hospitalDoctor = first(await api('/api/hospital/doctors', hospital.accessToken), 'hospital doctors')

const portals = [
  {
    session: lawyer,
    pages: [
      '/lawyer/dashboard',
      '/lawyer/cases',
      `/lawyer/cases/${lawyerCase.caseId}`,
      '/lawyer/documents',
      '/lawyer/messages',
      '/lawyer/notifications',
      '/lawyer/account-settings',
    ],
  },
  {
    session: hospital,
    pages: [
      '/hospital/dashboard',
      '/hospital/cases',
      `/hospital/cases/${hospitalCase.planId}`,
      '/hospital/patients',
      `/hospital/patients/${hospitalCase.patientId}`,
      '/hospital/doctors',
      `/hospital/doctors/${hospitalDoctor.id}`,
      '/hospital/documents',
      '/hospital/messages',
      '/hospital/notifications',
      '/hospital/account-settings',
    ],
  },
  {
    session: patient,
    pages: [
      '/patient/dashboard',
      '/patient/cases',
      '/patient/cases/new',
      `/patient/cases/${patientCase.id}`,
      '/patient/treatments',
      '/patient/documents',
      '/patient/messages',
      '/patient/notifications',
      '/patient/payments',
      '/patient/visa-travel',
      ...visas.submissions.slice(0, 1).map((v) => `/patient/visa-travel/${v.id}`),
      '/patient/profile',
    ],
  },
  {
    session: doctor,
    pages: [
      '/doctor/dashboard',
      '/doctor/cases',
      `/doctor/cases/${doctorCase.caseId}`,
      `/doctor/cases/${doctorCase.caseId}/treatment-plan`,
      '/doctor/consultations',
      ...consultations.slice(0, 1).map((c) => `/doctor/consultations/${c.id}`),
      '/doctor/messages',
      '/doctor/notifications',
      '/doctor/account-settings',
    ],
  },
  {
    session: admin,
    pages: [
      '/admin/dashboard',
      '/admin/doctors',
      '/admin/hospitals',
      `/admin/hospitals/${adminHospital.id}`,
      '/admin/lawyers',
      `/admin/lawyers/${adminLawyer.id}`,
      '/admin/visa-cases',
      `/admin/doctors/${adminDoctor.id}`,
      '/admin/cases',
      `/admin/cases/${adminCase.id}`,
      '/admin/plans',
      `/admin/plans/${adminPlan.id}`,
      '/admin/messages',
      '/admin/payments',
      `/admin/payments/${adminPayment.kind}/${adminPayment.id}`,
      '/admin/settings',
    ],
  },
]

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const problems = []
let checked = 0

try {
  for (const viewport of [
    { width: 1400, height: 900 },
    { width: 390, height: 844, isMobile: true, hasTouch: true },
  ]) {
    for (const { session, pages } of portals) {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      let current = ''
      const report = (msg) => problems.push(`${viewport.width}px ${current}: ${msg}`)
      page.on('pageerror', (e) => report(`page error: ${e.message}`))
      page.on('console', (m) => m.type() === 'error' && report(`console: ${m.text()}`))
      page.on('response', (r) => {
        const url = r.url()
        if (url.includes('/api/') && r.status() >= 400) report(`${r.status()} ${r.request().method()} ${url}`)
      })
      await page.goto(`${BASE}/login`)
      await page.evaluate((s) => localStorage.setItem('iha.session', JSON.stringify(s)), session)

      for (const path of pages) {
        current = path
        await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 30000 }).catch((e) => report(e.message))
        if (new URL(page.url()).pathname !== path) report(`redirected to ${new URL(page.url()).pathname}`)
        const state = await page.evaluate(() => ({
          alert: [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent.trim()).find((t) => t),
          loading: !!document.querySelector('.loading, [aria-busy=true]'),
          heading: !!document.querySelector('main h1, main h2, h1'),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        }))
        if (state.alert) report(`error panel: ${state.alert.slice(0, 120)}`)
        if (state.loading) report('still loading after the network went idle')
        if (!state.heading) report('no page heading')
        if (state.overflow > 4) report(`horizontal scroll (${state.overflow}px wider than the screen)`)
        checked++
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
}

if (problems.length) {
  console.log(`✘ ${problems.length} problem(s) on ${checked} page loads:\n` + problems.join('\n'))
  process.exitCode = 1
} else {
  console.log(`✔ ${checked} page loads without errors`)
}
