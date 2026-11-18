// Screenshots every screen of the five portals in the order a user meets them, and writes one
// screen-flow document per portal to docs/demo/screen-flows/. Needs a freshly started API in the
// dev profile (it signs up new accounts and approves the seeded pending providers) with its log
// in API_LOG, and Vite on :5173 (or E2E_BASE). Usage:
//   API_LOG=<api log> node screen-flows.mjs
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const LOG = process.env.API_LOG
if (!LOG) throw new Error('Set API_LOG to the API log file (sign-up codes are read from it).')
const OUT = path.resolve(import.meta.dirname, '../docs/demo/screen-flows')
const stamp = Date.now().toString().slice(-6)

// ── API helpers ─────────────────────────────────────────────────────────
async function call(method, p, token, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const get = (p, s) => call('GET', p, s?.accessToken)
const post = (p, s, body) => call('POST', p, s?.accessToken, body)
const put = (p, s, body) => call('PUT', p, s?.accessToken, body)
const login = (email) => post('/api/auth/login', null, { email, password: 'Demo1234' })
const first = (list, what) => {
  if (!list?.length) throw new Error(`no ${what} in the demo data`)
  return list[0]
}
const code = (email) => {
  const line = fs
    .readFileSync(LOG, 'utf8')
    .split('\n')
    .filter((l) => l.includes(`Verification code for ${email}`))
    .at(-1)
  if (!line) throw new Error(`no verification code for ${email} in ${LOG}`)
  return line.trim().slice(-6)
}
/** Signs up through the API and verifies with the code from the log: returns the session. */
async function signUp(kind, email, extra = {}) {
  await post(`/api/auth/register/${kind}`, null, {
    email,
    password: 'Demo1234',
    acceptTerms: true,
    ...extra,
  })
  return post('/api/auth/verify', null, { email, code: code(email) })
}
const validUntil = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
/** Records passing register checks, then approves (what MTA does under Approvals). */
async function approve(type, id, reviewPath) {
  const v = await get(`/api/admin/verifications/${type}/${id}`, admin)
  for (const check of v.required) {
    await post(`/api/admin/verifications/${type}/${id}`, admin, {
      checkType: check.checkType,
      outcome: 'verified',
      validUntil,
      details: null,
    })
  }
  await post(reviewPath, admin, { outcome: 'approved', reason: null })
}
const setFee = (key, amount) =>
  put(`/api/admin/settings/fees/${key}`, admin, { amount, reason: 'Screen flow screenshots' })

// ── Demo data ───────────────────────────────────────────────────────────
const patient = await login('patient@demo.local')
const doctor = await login('doctor@demo.local')
const admin = await login('admin@demo.local')
const hospital = await login('hospital@demo.local')
const lawyer = await login('lawyer@demo.local')
const pendingDoctor = await login('pending.doctor@demo.local')
const pendingHospital = await login('pending.hospital@demo.local')
const pendingLawyer = await login('pending.lawyer@demo.local')

const patientCases = await get('/api/patient/cases', patient)
const caseIn = (status) => patientCases.find((c) => c.status === status)
const visas = (await get('/api/patient/visa-submissions', patient)).submissions
const doctorCases = await get('/api/doctor/cases', doctor)
const doctorCase = (status) => doctorCases.find((c) => c.assignment?.status === status)
const doctorEvaluation = doctorCases.find(
  (c) => c.assignment?.status === 'accepted' && c.caseStatus === 'evaluation',
)
const doctorDone = doctorCases.find((c) => c.assignment?.status === 'accepted' && c.caseStatus === 'completed')
const consultations = await get('/api/doctor/consultations', doctor)
const hospitalCase = first(await get('/api/hospital/cases', hospital), 'hospital cases')
const hospitalDoctor = first(await get('/api/hospital/doctors', hospital), 'hospital doctors')
const lawyerCase = first(await get('/api/lawyer/cases', lawyer), 'lawyer cases')

// ── Screens ─────────────────────────────────────────────────────────────
// Each step: who is signed in (null = signed out), the path, a title and what the screen is for.
// `prep` runs first (API calls that move the story on). Steps whose page redirects elsewhere are
// skipped and reported, so the documents only show screens that really render.
let newPatient, newDoctor, newHospital, newLawyer
const newEmail = (who) => `${who}.${stamp}@example.com`

const portals = [
  {
    id: 'patient',
    name: 'Patient portal',
    intro:
      'International patients submit a case, meet the doctor on Zoom, compare treatment plans, pay, and apply for their medical treatment visa. Shown as `patient@demo.local`, whose cases sit at different stages, plus a brand-new sign-up for the first screens.',
    steps: [
      { section: 'Joining', title: 'Sign in', path: '/login', as: null, about: 'The shared sign-in page for every portal. The website links here.' },
      { title: 'Create an account', path: '/register', as: null, about: 'Name, email and password, plus the two consents: the terms, and sharing health information with the people arranging treatment.' },
      {
        title: 'Verify email',
        prep: async () => {
          const email = newEmail('patient')
          await post('/api/auth/register/patient', null, {
            fullName: 'Mei Lin',
            email,
            password: 'Demo1234',
            acceptTerms: true,
            consentHealthInfo: true,
          })
          return { path: `/verify?email=${encodeURIComponent(email)}`, after: async () => (newPatient = await post('/api/auth/verify', null, { email, code: code(email) })) }
        },
        as: null,
        about: 'A 6-digit code arrives by email. The patient can ask for a new one.',
      },
      { title: 'Complete profile', path: '/patient/profile/setup', as: () => newPatient, about: 'Personal details, medical background and emergency contact. Required before anything else.' },
      { section: 'Everyday screens', title: 'Dashboard', path: '/patient/dashboard', as: () => patient, about: 'Journey progress and the next action for each case.' },
      { title: 'Case Management', path: '/patient/cases', as: () => patient, about: 'Every case with its status.' },
      { title: 'Submit a new case', path: '/patient/cases/new', as: () => patient, about: 'Specialty, description and medical reports (PDF, JPG or PNG up to 10 MB).' },
      { section: 'One case, step by step', title: 'Case under review', path: () => `/patient/cases/${caseIn('under_review')?.id}`, as: () => patient, about: 'MTA is matching the case with doctors.' },
      { title: 'Case in evaluation', path: () => `/patient/cases/${caseIn('evaluation')?.id}`, as: () => patient, about: 'The doctor reviews the case. The patient uploads anything requested and books the initial Zoom consultation (AUD 200).' },
      { title: 'Treatment plans', path: '/patient/treatments', as: () => patient, about: 'Published plans side by side: doctor, hospital, procedure, timeline, recovery and full costs.' },
      { title: 'Case after payment', path: () => `/patient/cases/${caseIn('payment_confirmed')?.id}`, as: () => patient, about: 'The plan is paid. The hospital now sends the invitation and appointment letters.' },
      { title: 'Payments', path: '/patient/payments', as: () => patient, about: 'Every payment with a PDF invoice, and any refunds.' },
      { title: 'Visa & Travel: travel', path: '/patient/visa-travel', as: () => patient, about: 'Travel details for the treatment trip.' },
      { title: 'Visa & Travel: visa', path: '/patient/visa-travel?tab=visa', as: () => patient, about: 'Visa applications for each case. The application opens once both hospital letters have arrived.' },
      { title: 'Visa application', path: () => visas[0] && `/patient/visa-travel/${visas[0].id}`, as: () => patient, about: 'The submitted application, its documents and the lawyer’s progress. The approved visa is downloaded here.' },
      { title: 'Case with visa submitted', path: () => `/patient/cases/${caseIn('visa_documents_submitted')?.id}`, as: () => patient, about: 'The case timeline records every step.' },
      { title: 'Completed case', path: () => `/patient/cases/${caseIn('completed')?.id}`, as: () => patient, about: 'The doctor marked the treatment completed.' },
      { section: 'Support and account', title: 'Documents', path: '/patient/documents', as: () => patient, about: 'Every file across the patient’s cases.' },
      { title: 'Messages', path: '/patient/messages', as: () => patient, about: 'Support chat with the MTA coordinator.' },
      { title: 'Notifications', path: '/patient/notifications', as: () => patient, about: 'Everything that happened on the patient’s cases.' },
      { title: 'Profile: personal information', path: '/patient/profile', as: () => patient, about: 'Personal and medical details.' },
      { title: 'Profile: notifications', path: '/patient/profile?tab=notifications', as: () => patient, about: 'Email and SMS preferences.' },
      { title: 'Profile: payment', path: '/patient/profile?tab=payment', as: () => patient, about: 'Payment preferences.' },
      { title: 'Profile: security', path: '/patient/profile?tab=security', as: () => patient, about: 'Change password.' },
      { title: 'Profile: delete account', path: '/patient/profile?tab=deleteAccount', as: () => patient, about: 'Close the account. Records are kept for the legal retention period, then purged.' },
    ],
  },
  {
    id: 'doctor',
    name: 'Doctor portal',
    intro:
      'Australian specialists evaluate cases, hold an initial Zoom consultation and write treatment plans. Shown as `doctor@demo.local` (Dr. Amelia Chen), plus a new sign-up and `pending.doctor@demo.local` for the joining screens. English only.',
    steps: [
      { section: 'Joining', title: 'Doctor sign-up', path: '/register/doctor', as: null, about: 'Email, password and the terms.' },
      {
        title: 'Registration wizard',
        prep: async () => {
          newDoctor = await signUp('doctor', newEmail('doctor'))
        },
        path: '/doctor/register',
        as: () => newDoctor,
        about: 'Four steps: details, qualifications and AHPRA number, hospitals and availability, documents.',
      },
      { title: 'Waiting for approval', path: '/doctor/pending-approval', as: () => pendingDoctor, about: 'MTA checks the AHPRA register and approves, rejects or asks for more information.' },
      {
        title: 'Registration fee',
        prep: async () => {
          const d = first((await get('/api/admin/doctors', admin)).filter((x) => x.status === 'pending'), 'pending doctors')
          await approve('doctor', d.id, `/api/admin/doctors/${d.id}/review`)
        },
        path: '/doctor/registration-fee',
        as: () => pendingDoctor,
        about: 'After approval the doctor pays the one-time registration fee (set by MTA) to open the portal.',
      },
      { section: 'Everyday screens', title: 'Dashboard', path: '/doctor/dashboard', as: () => doctor, about: 'Return on membership, actions for today, funnel, decline reasons, anonymous price benchmark and earnings. Every figure comes from real records; planned features show a **Soon** chip.' },
      { title: 'My Cases', path: '/doctor/cases', as: () => doctor, about: 'Invitations and cases by stage.' },
      { section: 'One case, step by step', title: 'New invitation', path: () => doctorCase('invited') && `/doctor/cases/${doctorCase('invited').caseId}`, as: () => doctor, about: 'Accept or decline, with a 48-hour response target.' },
      { title: 'Case in evaluation', path: () => doctorEvaluation && `/doctor/cases/${doctorEvaluation.caseId}`, as: () => doctor, about: 'History and documents, document requests, and the initial consultation card where the doctor offers up to three times in their own time zone.' },
      { title: 'Build treatment plan', path: () => doctorEvaluation && `/doctor/cases/${doctorEvaluation.caseId}/treatment-plan`, as: () => doctor, about: 'Diagnosis, procedure, timeline, hospital and costs. Submission stays locked until the consultation has happened or is skipped with a reason.' },
      { title: 'Completed case', path: () => doctorDone && `/doctor/cases/${doctorDone.caseId}`, as: () => doctor, about: 'A treated, paid case.' },
      { title: 'Consultations', path: '/doctor/consultations', as: () => doctor, about: 'Every consultation by status.' },
      { title: 'Consultation details', path: () => consultations[0] && `/doctor/consultations/${consultations[0].id}`, as: () => doctor, about: 'Time in the doctor’s zone and the patient’s, the Zoom link and the case.' },
      { section: 'Support and account', title: 'Messages', path: '/doctor/messages', as: () => doctor, about: 'Chat with MTA.' },
      { title: 'Notifications', path: '/doctor/notifications', as: () => doctor, about: 'Invitations, payments and plan decisions.' },
      ...[
        ['profile', 'Profile', 'Public details, specialties and time zone.'],
        ['availability', 'Availability', 'When the doctor can see patients.'],
        ['indemnity', 'Indemnity', 'The professional indemnity declaration, needed before offering consultation times.'],
        ['billing', 'Billing', 'Membership status and the annual renewal.'],
        ['invoices', 'Invoices', 'Fee invoices as PDFs.'],
        ['security', 'Security', 'Change password.'],
        ['notifications', 'Notifications', 'Email and SMS preferences.'],
      ].map(([tab, label, about]) => ({
        title: `Account & Settings: ${label}`,
        path: `/doctor/account-settings?tab=${tab}`,
        as: () => doctor,
        about,
      })),
    ],
  },
  {
    id: 'hospital',
    name: 'Hospital portal',
    intro:
      'Partner hospitals see patients whose treatment plan names them and send the two visa letters. Shown as `hospital@demo.local` (St Vincent’s Hospital Sydney), plus a new sign-up and `pending.hospital@demo.local` for the joining screens. For the fee screen the hospital fees were set to AUD 500 (registration) and AUD 300 (annual); in the demo they start at $0, which means no charge. English only.',
    steps: [
      { section: 'Joining', title: 'Hospital sign-up', path: '/register/hospital', as: null, about: 'Email, password and the terms.' },
      {
        title: 'Registration wizard',
        prep: async () => {
          newHospital = await signUp('hospital', newEmail('hospital'))
        },
        path: '/hospital/register',
        as: () => newHospital,
        about: 'Hospital details, accreditation and documents.',
      },
      { title: 'Waiting for approval', path: '/hospital/pending-approval', as: () => pendingHospital, about: 'MTA checks the hospital’s registration and approves, rejects or asks for more information.' },
      {
        title: 'Registration fee',
        prep: async () => {
          await setFee('hospital_registration_fee', 500)
          await setFee('hospital_annual_fee', 300)
          const h = first((await get('/api/admin/hospitals', admin)).filter((x) => x.status === 'pending'), 'pending hospitals')
          await approve('hospital', h.id, `/api/admin/hospitals/${h.id}/review`)
        },
        path: '/hospital/registration-fee',
        as: () => pendingHospital,
        about: 'Only when MTA has set a registration fee above $0: the portal opens once it is paid by card.',
      },
      { section: 'Everyday screens', title: 'Dashboard', path: '/hospital/dashboard', as: () => hospital, about: 'Incoming patients and the letters still to send. An overdue annual fee shows a reminder here.' },
      { title: 'Cases', path: '/hospital/cases', as: () => hospital, about: 'Cases whose plan names the hospital, by stage.' },
      { title: 'Case details', path: `/hospital/cases/${hospitalCase.planId}`, as: () => hospital, about: 'The plan, the patient and the two visa letters: generate the PDF and send it to the patient.' },
      { title: 'Patients', path: '/hospital/patients', as: () => hospital, about: 'Everyone coming to the hospital.' },
      { title: 'Patient details', path: `/hospital/patients/${hospitalCase.patientId}`, as: () => hospital, about: 'One patient’s cases at the hospital.' },
      { title: 'Doctors', path: '/hospital/doctors', as: () => hospital, about: 'Doctors affiliated with the hospital.' },
      { title: 'Doctor details', path: `/hospital/doctors/${hospitalDoctor.id}`, as: () => hospital, about: 'One doctor and their cases at the hospital.' },
      { title: 'Documents', path: '/hospital/documents', as: () => hospital, about: 'Letters waiting to be sent, and every letter sent.' },
      { section: 'Support and account', title: 'Messages', path: '/hospital/messages', as: () => hospital, about: 'Chat with MTA.' },
      { title: 'Notifications', path: '/hospital/notifications', as: () => hospital, about: 'New patients, payments and fee reminders.' },
      ...[
        ['profile', 'Hospital profile', 'Details, time zone and documents.'],
        ['billing', 'Billing', 'Registration and annual membership fees, with invoices.'],
        ['security', 'Security', 'Change password.'],
        ['notifications', 'Notifications', 'Email and SMS preferences.'],
      ].map(([tab, label, about]) => ({
        title: `Account & Settings: ${label}`,
        path: `/hospital/account-settings?tab=${tab}`,
        as: () => hospital,
        about,
      })),
    ],
  },
  {
    id: 'lawyer',
    name: 'Visa lawyer portal',
    intro:
      'Migration agents and lawyers review and progress the visa applications MTA assigns to them. Shown as `lawyer@demo.local` (James Whitfield), plus a new sign-up and `pending.lawyer@demo.local` for the joining screens. For the fee screen the lawyer fees were set to AUD 400 (registration) and AUD 250 (annual); in the demo they start at $0. English only.',
    steps: [
      { section: 'Joining', title: 'Lawyer sign-up', path: '/register/lawyer', as: null, about: 'Email, password and the terms.' },
      {
        title: 'Registration wizard',
        prep: async () => {
          newLawyer = await signUp('lawyer', newEmail('lawyer'))
        },
        path: '/lawyer/register',
        as: () => newLawyer,
        about: 'Practice details and a MARN or practising certificate.',
      },
      { title: 'Waiting for approval', path: '/lawyer/pending-approval', as: () => pendingLawyer, about: 'MTA checks the register and approves, rejects or asks for more information.' },
      {
        title: 'Registration fee',
        prep: async () => {
          await setFee('lawyer_registration_fee', 400)
          await setFee('lawyer_annual_fee', 250)
          const l = first((await get('/api/admin/lawyers', admin)).filter((x) => x.status === 'pending'), 'pending lawyers')
          await approve('lawyer', l.id, `/api/admin/lawyers/${l.id}/review`)
        },
        path: '/lawyer/registration-fee',
        as: () => pendingLawyer,
        about: 'Only when MTA has set a registration fee above $0: the portal opens, and cases can be assigned, once it is paid.',
      },
      { section: 'Everyday screens', title: 'Dashboard', path: '/lawyer/dashboard', as: () => lawyer, about: 'Assigned applications and what needs doing.' },
      { title: 'Visa cases', path: '/lawyer/cases', as: () => lawyer, about: 'Applications assigned to the lawyer, by status.' },
      { title: 'Visa case details', path: `/lawyer/cases/${lawyerCase.caseId}`, as: () => lawyer, about: 'The application and its documents, notes, and the status workflow up to issuing the visa grant.' },
      { title: 'Documents', path: '/lawyer/documents', as: () => lawyer, about: 'Every document across the lawyer’s cases.' },
      { section: 'Support and account', title: 'Messages', path: '/lawyer/messages', as: () => lawyer, about: 'Chat with MTA.' },
      { title: 'Notifications', path: '/lawyer/notifications', as: () => lawyer, about: 'New assignments and fee reminders.' },
      ...[
        ['profile', 'Profile', 'Practice details and time zone.'],
        ['billing', 'Billing', 'Registration and annual membership fees, with invoices.'],
        ['security', 'Security', 'Change password.'],
        ['notifications', 'Notifications', 'Email and SMS preferences.'],
      ].map(([tab, label, about]) => ({
        title: `Account & Settings: ${label}`,
        path: `/lawyer/account-settings?tab=${tab}`,
        as: () => lawyer,
        about,
      })),
    ],
  },
  {
    id: 'admin',
    name: 'Admin portal',
    intro:
      'MTA staff approve providers, run cases, review plans, handle money and keep the audit trail. Shown as `admin@demo.local`, after the doctor, hospital and lawyer approvals in the other flows.',
    steps: [
      { section: 'Overview', title: 'Dashboard', path: '/admin/dashboard', as: () => admin, about: 'Live figures: cases, approvals waiting, revenue including membership fees.' },
      { section: 'Providers', title: 'Doctor approvals', path: '/admin/doctors', as: () => admin, about: 'Doctors by approval status.' },
      { title: 'Doctor details', path: async () => `/admin/doctors/${(await get('/api/admin/doctors', admin)).find((d) => d.status === 'approved')?.id}`, as: () => admin, about: 'Profile, register checks, approval decision and performance.' },
      { title: 'Hospital approvals', path: '/admin/hospitals', as: () => admin, about: 'Hospitals by approval status.' },
      { title: 'Hospital details (fee unpaid)', path: async () => `/admin/hospitals/${(await get('/api/admin/hospitals', admin)).find((h) => /gold coast/i.test(JSON.stringify(h)))?.id}`, as: () => admin, about: 'Register checks and the **Membership** line: this hospital was just approved and has not paid its registration fee, so its portal is locked.' },
      { title: 'Lawyer approvals', path: '/admin/lawyers', as: () => admin, about: 'Lawyers by approval status.' },
      { title: 'Lawyer details', path: async () => `/admin/lawyers/${first(await get('/api/admin/lawyers', admin), 'lawyers').id}`, as: () => admin, about: 'Credential, register checks and membership.' },
      { section: 'Cases', title: 'Cases', path: '/admin/cases', as: () => admin, about: 'Every case by stage.' },
      { title: 'Case details', path: async () => `/admin/cases/${first(await get('/api/admin/cases', admin), 'cases').id}`, as: () => admin, about: 'Assign doctors, follow the timeline, close or complete the case.' },
      { title: 'Plan review', path: '/admin/plans', as: () => admin, about: 'Treatment plans waiting for MTA.' },
      { title: 'Plan details', path: async () => `/admin/plans/${first(await get('/api/admin/plans', admin), 'plans').id}`, as: () => admin, about: 'Publish the plan to the patient or decline it with a reason.' },
      { title: 'Visa cases', path: '/admin/visa-cases', as: () => admin, about: 'Visa applications and their assigned lawyer.' },
      { title: 'Messages', path: '/admin/messages', as: () => admin, about: 'The live inbox: chats with patients and providers.' },
      { section: 'Money', title: 'Payments', path: '/admin/payments', as: () => admin, about: 'Every payment: patients, doctors, hospitals and lawyers. CSV export.' },
      { title: 'Payment details', path: async () => { const p = first(await get('/api/admin/payments', admin), 'payments'); return `/admin/payments/${p.kind}/${p.id}` }, as: () => admin, about: 'Full or partial refunds, with the card processing fee kept only for certain reasons, and credit notes.' },
      { title: 'Settings', path: '/admin/settings', as: () => admin, about: 'Platform fees with change history, business details for invoices and GST, privacy retention.' },
      { section: 'People and compliance', title: 'Users', path: '/admin/users', as: () => admin, about: 'Every account; suspend or restore, add staff.' },
      { title: 'User details', path: async () => `/admin/users/${first(await get('/api/admin/users', admin), 'users').id}`, as: () => admin, about: 'One account, its role and history.' },
      { title: 'Audit log', path: '/admin/audit', as: () => admin, about: 'Who did what and when. Encrypted values are never shown.' },
      { title: 'My Account', path: '/admin/account', as: () => admin, about: 'The staff member’s own password and details.' },
    ],
  },
]

// ── Capture ─────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const problems = []
const skipped = []
let current = ''
page.on('pageerror', (e) => problems.push(`${current}: page error: ${e.message}`))
page.on('response', (r) => {
  if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${current}: ${r.status()} ${r.url()}`)
})
await page.goto(`${BASE}/login`)

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const results = {}

try {
  for (const portal of portals) {
    fs.rmSync(path.join(OUT, portal.id), { recursive: true, force: true })
    fs.mkdirSync(path.join(OUT, portal.id), { recursive: true })
    results[portal.id] = []
    let n = 0
    let section = null
    for (const step of portal.steps) {
      if (step.section) section = step.section
      current = `${portal.id} / ${step.title}`
      let after = null
      if (step.prep) {
        const r = await step.prep()
        if (r?.path) step.path = r.path
        after = r?.after
      }
      const target = typeof step.path === 'function' ? await step.path() : step.path
      if (!target || target.includes('undefined')) {
        skipped.push(`${current}: no demo record for this screen`)
        continue
      }
      const session = step.as ? step.as() : null
      await page.evaluate((s) => {
        if (s) localStorage.setItem('iha.session', JSON.stringify(s))
        else localStorage.removeItem('iha.session')
      }, session)
      await page.goto(BASE + target, { waitUntil: 'networkidle2', timeout: 30000 })
      await page.addStyleTag({ content: '.dev-panel{display:none!important}' })
      await new Promise((r) => setTimeout(r, 700))
      const want = new URL(BASE + target)
      const got = new URL(page.url())
      if (got.pathname !== want.pathname) {
        skipped.push(`${current}: ${target} redirected to ${got.pathname}`)
        if (after) await after()
        continue
      }
      n++
      const file = `${String(n).padStart(2, '0')}-${slug(step.title)}.jpg`
      // Grow the window to the page height first: a full-page capture would otherwise cut
      // full-height elements (the sidebar) at the first screen.
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.setViewport({ width: 1440, height: Math.max(900, height) })
      await new Promise((r) => setTimeout(r, 300))
      await page.screenshot({ path: path.join(OUT, portal.id, file), type: 'jpeg', quality: 70 })
      await page.setViewport({ width: 1440, height: 900 })
      results[portal.id].push({ section, title: step.title, path: target, about: step.about, file })
      console.log(`✔ ${current}`)
      if (after) await after()
    }
  }
} finally {
  await browser.close()
}

// Put the demo fees back to $0 (the default) so the rest of the session behaves like the seed.
for (const key of ['hospital_registration_fee', 'hospital_annual_fee', 'lawyer_registration_fee', 'lawyer_annual_fee']) {
  await setFee(key, 0).catch(() => {})
}

// ── Documents ───────────────────────────────────────────────────────────
const shownPath = (p) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{id}').replace(/email=[^&]+/, 'email=…')
for (const portal of portals) {
  const shots = results[portal.id]
  let md = `# ${portal.name}: screen flow\n\n${portal.intro}\n\n`
  md += `Screens appear in the order a user meets them. Captured from the local dev environment with demo data at 1440 × 900 (full page). Developer-only test buttons are hidden; payment screens still say that payments are simulated. Regenerate with \`e2e/screen-flows.mjs\` (see [README](README.md)).\n\n`
  md += `## Contents\n\n`
  let sec = null
  shots.forEach((s, i) => {
    if (s.section !== sec) {
      sec = s.section
      md += `\n**${sec}**\n\n`
    }
    md += `${i + 1}. [${s.title}](#${i + 1}-${slug(s.title)})\n`
  })
  sec = null
  shots.forEach((s, i) => {
    if (s.section !== sec) {
      sec = s.section
      md += `\n## ${sec}\n`
    }
    md += `\n### ${i + 1}. ${s.title}\n\n\`${shownPath(s.path)}\`: ${s.about}\n\n![${s.title}](${portal.id}/${s.file})\n`
  })
  fs.writeFileSync(path.join(OUT, `${portal.id}.md`), md)
}

let index = `# Screen flows\n\nEvery screen of each portal, in the order a user meets it, with a screenshot and one line on what it is for. For how to demo each portal, see the [demo guides](../README.md).\n\n| Portal | Screens |\n|---|---|\n`
for (const portal of portals) index += `| [${portal.name}](${portal.id}.md) | ${results[portal.id].length} |\n`
index += `\n## Regenerating\n\nThe screenshots come from the local dev environment (in-memory demo data). With a **freshly started** API (the script signs up new accounts and approves the seeded pending doctor, hospital and lawyer) and Vite running:\n\n\`\`\`bash\ncd e2e\nAPI_LOG=<path to the API log> node screen-flows.mjs\n\`\`\`\n\nIt rewrites the images and these documents. A screen whose demo record is missing, or which redirects elsewhere, is skipped and listed at the end of the run.\n`
fs.writeFileSync(path.join(OUT, 'README.md'), index)

const total = Object.values(results).reduce((a, r) => a + r.length, 0)
console.log(`\n${total} screens captured to ${OUT}`)
if (skipped.length) console.log(`Skipped:\n  ${skipped.join('\n  ')}`)
if (problems.length) {
  console.log(`Problems:\n  ${problems.join('\n  ')}`)
  process.exitCode = 1
}
