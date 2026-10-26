# CLAUDE.md

Guidance for Claude Code sessions in this repository. Read this first, then `README.md` (overview, porting status) and `documentation/` (architecture, API reference, data model, guides). Keep `documentation/` current when you change behaviour, endpoints or tables.

## What this is

IHA / "MTA" (Medical Tourism Australia): a platform connecting international patients with hospitals, doctors and visa lawyers around a shared **case**.

The project is **mid-migration** from a Next.js + Supabase monorepo to Spring Boot + React:

| Folder | Status |
|---|---|
| `backend/` | **New.** Java 21, Spring Boot 4.1, Spring Security (JWT), Spring Data JPA, Flyway. H2 in dev, PostgreSQL in prod. |
| `frontend/` | **New.** React 19, TypeScript, Vite, React Router 7. One SPA with a route tree per role. |
| `e2e/` | **New.** Scripted Chrome (puppeteer-core) runs against the local dev servers: `journey.mjs` (patient), `doctor-journey.mjs` (doctor), `admin-journey.mjs` (admin; no API log needed; needs a freshly started API because it approves the one seeded pending doctor), `hospital-journey.mjs` (hospital; needs the API log), `smoke.mjs` (opens every portal page as the demo accounts, desktop + phone; no API log). `E2E_BASE` overrides `http://localhost:5173`, `shot-doctor-dashboard.mjs` (full-page dashboard screenshot). Run with `API_LOG=<api log> node <script>`. |
| `documentation/` | **New.** Technical docs of the new stack: architecture, development, backend/frontend guides, API reference, data model, patient/doctor portal guides, deployment. |
| `apps/`, `packages/`, `supabase/` | **Old** Next.js/Supabase code. Kept untouched as the reference for porting. Do not edit; delete only when the user says so. |
| `docs/` | Technical docs of the **old** stack (per app, per package). The best source for how a feature is supposed to behave. |

## Porting status

- **Done:** the entire patient portal (auth, onboarding/profile, dashboard, cases, documents, treatment options, consultations, payments + invoices, visa wizard and detail, chat, live notifications, English/Chinese). Backend journey tests and the e2e script cover it.
- **Done:** the doctor portal (backend `doctor/` + `providerchat/`, frontend `portals/doctor/`, migrations V4–V5). Covered by `DoctorPortalFlowTests` and `e2e/doctor-journey.mjs`. English only (the old doctor app had no i18n). Visual reference for most pages: the live dev portal https://dev.doctor.medicaltourismaustralia.com (view only — never click data-changing actions there; the auto-mode classifier blocks clicks there anyway).
  - **Dashboard** follows the user's concept image `MTA_Doctor_Dashboard_Concept.png` (in `C:\Users\ersag\Downloads\`): teal "return on membership" hero, stat cards, action list, funnel, decline reasons, anonymised price benchmark, earnings chart, membership & verification, feature cards. All figures come from `GET /api/doctor/insights` (`DoctorInsightsService`). **Rule from the user's intent: no invented numbers** — features that don't exist yet (patient ratings, payouts, referrals, follow-ups, hospital packages, plan templates, public profile) show a yellow **Soon** chip instead of fake data. The concept's extra sidebar pages are not built; ask before adding them.
  - **Case workflow (decided by the user, 2026-10-20):** accept → start evaluation → review/request documents → **initial Zoom consultation** → treatment plan. The doctor proposes 1–3 times (in the doctor's time zone), the patient picks one and pays AUD 200, Zoom is created on payment. **Plan submission is blocked** (`409 initial_consultation_required`) until it has taken place (scheduled and start time passed) or the doctor skipped it with a reason (stored on `doctor_case_assignments.consultation_skipped_reason`, visible to MTA). Drafting is always allowed. The older patient-requested consultation about a published option stays as an optional "follow-up" (`consultation_requests.kind` = `initial` | `option`).
  - **Time zones (2026-10-26):** each doctor and hospital has a `time_zone` (one of `common/AustralianTimeZones`: Sydney, Melbourne, Brisbane, Adelaide, Darwin, Perth, Hobart; default Brisbane, migration V9). Doctors enter and see consultation times in their zone (labelled e.g. "(Sydney Time)"; Sydney/Melbourne/Adelaide/Hobart observe daylight saving). Patients see the doctor's zone (`doctorTimeZone` on consultations) plus their own. Hospitals' letter dates and "today" use theirs. The frontend reads it via `setProviderTimeZone`/`providerTimeZone()` in `lib/format.ts`, set by `DoctorProvider`/`HospitalProvider` (admin resets it). MTA admin reporting and fee renewals stay on Brisbane. Never hard-code a zone again.
- **Started (2026-10-21):** admin portal — backend `admin/` (AdminService, AdminController, AdminChatController, AdminBootstrap via IHA_ADMIN_EMAIL/IHA_ADMIN_PASSWORD), migration V6 (plan rejection_reason), frontend `portals/admin/` (dashboard with live insights from `AdminInsightsService` — no invented numbers, doctor approvals with per-doctor performance, cases + assign, plan review publish/decline, messages inbox, Settings → platform fees with change history via `fees/FeeSettingsService`, migration V7; Payments → full/partial refunds via `refund/RefundService` with the card processing fee deducted once per payment unless waived, credit notes, migration V8). Tests: `AdminPortalFlowTests`, `e2e/admin-journey.mjs`. Demo login `admin@demo.local` / `Demo1234`. Guide: `documentation/admin-portal.md`.
- **Done (2026-10-26):** hospital portal — backend `hospital/` (HospitalAccountService, HospitalPortalService, HospitalLetterRenderer, HospitalAdminService, HospitalPaymentListener), admin Hospital Approvals (`AdminHospitalController`, `portals/admin/HospitalPages.tsx`), frontend `portals/hospital/` (English only). A hospital sees a case once a non-draft plan names it; case pages are keyed by **plan id**. Its only write action is the two visa letters (PDFBox), which unlock the patient's visa application once both are sent. Hospitals aren't charged fees yet. Demo `hospital@demo.local` (St Vincent's) and `pending.hospital@demo.local`. Tests: `HospitalPortalFlowTests`, `e2e/hospital-journey.mjs`. Guide: `documentation/hospital-portal.md`.
- **Next:** visa-lawyer portal; admin follow-ups (live pushes for the admin inbox, user/payment/settings tools, visa lawyer assignment).
  - Their routes are placeholders (`portal(...)` in `frontend/src/App.tsx`); API prefixes are already role-guarded in `SecurityConfig`.
  - Admin-side operations already written as services: `DoctorAdminService` (review doctor, assign case, publish plan), `ProviderMessageService.open/close/sendAsAdmin`, `ChatService.openThread/sendAsAdmin`, `CaseStatusService.transition`, `VisaSubmission.assignLawyer`. Expose them under `/api/admin/**`.
  - Provider chat is generic (`ProviderAccount` type doctor/hospital/lawyer): hospital and lawyer portals reuse `ProviderMessageService`.
  - Doctor fee payments ride the shared `PaymentGateway`/webhook: `PaymentService` publishes `UnmatchedIntentEvent` for intents that aren't patient payments; `DoctorFeeService` claims them. Do the same for any new payment type.
  - **Dev stand-ins** (`dev/DevSimulationController.java`, `dev/DoctorDevController.java`, `portals/patient/DevPanel.tsx`, `portals/doctor/DevPanel.tsx`) are kept for now: the patient and doctor e2e scripts use them, and the hospital step has no real portal yet. Remove them once the scripts drive the real portals.
- **Demo data:** `dev/DevDataSeeder` (+ `dev/DevHistory`) seeds on every dev start, through the real services: four hospitals; `patient@demo.local`; `doctor@demo.local` (Dr. Amelia Chen) with a new invitation, a case in evaluation (no consultation yet, to try the flow) and a year of history (treated/paid cases backdated over past months, a case lost to another doctor); `peer1@demo.local` and `peer2@demo.local` (Cardiology peers for benchmark/rank). Password for all: `Demo1234`. Tests also run in the dev profile, so seeding runs there too — keep it working.
- **Dev simulation buttons** (dashed boxes, `import.meta.env.DEV` only) play admin/patient: approve registration, assign a case, upload requested documents, choose a time and pay, **fast-forward a consultation to "taken place"** (`DevTime`), publish a plan, request a follow-up consultation, open chats.
- Case references are `MTA-<year>-<seq>` (the live system's format).
- **Not yet built:** real email/SMS (`notification/AlertDispatcher` only logs — users can't verify email in production until this exists), multi-instance realtime (`RealtimeHub` is in-memory), migrating data from the old Supabase project, and doctor-side "no-show" recording for consultations.
- **Design target:** the user wants the new UI to look like the old Next.js screens (they share screenshots of the old portal). Match the old components in `apps/<portal>/components` (Tailwind slate/cyan-700 palette, Geist font, lucide icons). The patient shell and dashboard already match.

## Website ↔ portal

**https://medicaltourismaustralia.com** (a separate WordPress site, not in this repo) is the platform's home page. The portal has no landing page: signed-out visits to `/` and every explicit sign-out go to the website (`HOME_URL` in `frontend/src/lib/site.ts`, overridable with `VITE_HOME_URL`). Use `AuthContext.signOut()` for user-initiated sign-out; `logout()` is for expired sessions and leaves the user on `/login`. The website links into `/login`, `/register` and deep pages; see README "Website and portal" for the link table and keep it current when adding entry points (e.g. provider sign-up).

## Running locally (this Windows machine)

No pnpm, no Docker, no global Maven. **Only JDK 17 is installed** while the pom targets 21, so always pass `-Djava.version=17`:

```bash
# backend/  (API on :8080, dev profile, in-memory H2)
export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot"
./mvnw -Djava.version=17 spring-boot:run      # run
./mvnw -Djava.version=17 test                 # tests (must stay green)

# frontend/ (Vite on :5173, proxies /api to :8080)
npm install && npm run dev
npm run build                                  # type-check + build (must stay green)

# e2e/ (both servers running; API stdout redirected to a log file)
npm install && API_LOG=<path to API log> node journey.mjs   # patient
API_LOG=<path to API log> node doctor-journey.mjs                # doctor
```

- Dev data is in memory: everything is lost on API restart. Register at `/register`; the 6-digit code is printed in the API log (`Verification code for …`). Email/SMS alerts are logged as `[email → …]`.
- Payments default to the simulated provider (`iha.payments.provider=fake`); Stripe needs `IHA_PAYMENTS_PROVIDER=stripe` + `STRIPE_*` keys. Zoom needs `ZOOM_*`.
- **Claude Code preview servers:** `.claude/launch.json` has `api` (absolute path to `backend\mvnw.cmd` with `-f …\pom.xml -Djava.version=17`, `autoPort: true`) and `web` (`npm --prefix frontend run dev`, port 5173). Relative paths and `cmd /c "cd backend && …"` don't work through the preview tool on Windows. The API always binds 8080 regardless of the port the tool reports. The e2e scripts need an API log file, so for e2e runs stop the preview `api` and start `./mvnw … spring-boot:run > <log>` instead, then hand back to the preview tool.
- **Sharing a link:** `cloudflared` is installed (`C:\Program Files (x86)\cloudflared\cloudflared.exe`). `cloudflared tunnel --url http://localhost:5173` gives a temporary public URL. The Vite proxy presents `Origin: http://localhost:5173` to the API — without it the API answers 403 "Invalid CORS request" for any other host.
- Sign in quickly in a browser tab by calling `POST /api/auth/login` with a demo account and storing the JSON in `localStorage['iha.session']`.
- **Ports taken by another project** (the user also runs MotorMovers on 8080/5173): start the API with `-Dspring-boot.run.arguments=--server.port=8081` and Vite with `PORT=5174 API_URL=http://localhost:8081` (preview config `web-alt`); e2e with `E2E_BASE=http://localhost:5174`. Don't stop the other project's servers.
- Don't run installers (winget etc.) without asking the user.
- Avoid Java 18–21-only APIs (e.g. `Math.clamp`) until JDK 21 is installed.

## Backend conventions

- Packages by feature under `com.iha` (`auth`, `patient`, `cases`, `treatment`, `consultation`, `payment`, `visa`, `chat`, `notification`, `realtime`, …). Controllers hold request/response records; services hold rules and `@Transactional`.
- **Security is in services, not the DB.** The old app relied on Postgres RLS; here every patient query starts from `PatientService.requireCurrent(user)` and ownership checks such as `CaseService.requireOwned`. Return 404 (not 403) for records that aren't the caller's.
- **Old SQL triggers/RPCs became explicit service code.** Port the exact behaviour, including notification titles and messages: the case timeline matches on them (see `CaseStatusService.textFor`). Read the latest definition of a function across `packages/db/supabase/migrations` before porting it.
- **Cross-module side effects go through events** to avoid bean cycles: e.g. `TreatmentOptionSelectedEvent`, `ConsultationSlotSelectedEvent`, `PaymentCompletedEvent`, `PatientRegisteredEvent`. Browser pushes use `RealtimeEvent` (sent after commit).
- **Invoices and GST:** every PDF goes through `payment/InvoiceRenderer`, which reads MTA's details from `fees/BusinessSettingsService`. Give each `InvoiceRenderer.Line` the GST it contains (`business.gstIn(Charge, amount)`, null = GST-free); the renderer switches to tax invoices / adjustment notes when MTA is GST-registered with an ABN. Refunds keep the card fee only for `RefundService.FEE_KEPT` reasons.
- **Provider verification:** approving a doctor or hospital needs passing register checks (`verification/VerificationService.requirePassing`); doctors need a current indemnity declaration to propose consultation times. Seed data and dev stand-ins call `VerificationService.recordDemoChecks` before approving and declare indemnity for demo doctors; tests that approve must do the same.
- **Fees are settings, never constants:** read them through `fees/FeeSettingsService` at the moment a charge is created (admin edits them under Settings). New fee → add a row in a migration and an entry in its `CATALOGUE`.
- **Errors:** throw `ApiException` (status + stable `code` + user-safe message) or `FieldValidationException`; both render as problem details with `code` / `fieldErrors`.
- **Encrypted columns** (`*_enc`) use the JPA converters in `crypto/` (string, date, decimal, string list). Never log their values; audit entries record only that something changed.
- **Uploads:** always `Uploads.validate(...)`, which checks size and detects the type from file bytes (`storage/FileType`). Files are served through the API after an ownership check, never by storage path.
- **Flyway:** migrations are append-only (`V12__…` next). SQL must run on both H2 (PostgreSQL mode) and Postgres: uuid ids generated in Java, `varchar` not `text`, no array defaults, no `gen_random_uuid()`.
- **Spring Data ignores nested repository interfaces**: one repository per file.
- **Tests:** `@SpringBootTest` + MockMvc journeys (`PatientJourneyTests`, `PatientCaseFlowTests`, `DoctorPortalFlowTests`, `AdminPortalFlowTests`, `SecurityAndAuthTests` (role matrix, forged tokens, auth codes, cross-user access, demo seed), `FeeSettingsTests`, `RefundTests`, `HospitalPortalFlowTests`, `TimeZoneTests`, `TaxInvoiceTests`, `VerificationTests`, plus `IhaApplicationTests`; 28 tests). Seed provider-side data directly in the test until those portals exist; admin steps go through `DoctorAdminService`.
- **Notifications:** `NotificationService.send` drops a duplicate only when the same user, type, **title** and case repeat within 60 s (matching on type alone used to swallow real back-to-back updates). Give distinct events distinct titles. Doctor names usually already start with "Dr." — use `ConsultationService.withTitle` rather than prefixing.

## Frontend conventions

- Everything for a role lives under `frontend/src/portals/<role>/`; shared bits in `components/` (`ui.tsx` kit, `Toasts`), `lib/` (`api.ts`, `useApi`, `realtime.tsx`, `format.ts`, `types.ts`, `cases.ts`).
- **All UI text goes through i18n:** `useT('namespace')`. `src/i18n/en.json` / `zh.json` are copied from `apps/patient/messages`; reuse existing keys before adding new ones (add to both files). Auth strings are in `auth-messages.json`. Exception: the doctor portal (`portals/doctor/`) is English-only with plain strings, like the old doctor app.
- Data: `useApi(path)` for reads (`reload()` keeps data on screen), `apiPost/apiPut/apiDelete` for writes, `openFile()` for authenticated downloads. Show server `fieldErrors` with `fieldError(error, 'field')`.
- Live updates: `useRealtime('notification' | 'chat_message' | 'provider_message', handler)`.
- Doctor portal styles live in `portals/doctor/doctor.css` (`dr-*` page classes, `dash-*` dashboard classes); shared helpers (provider-zone formatting, `TimeZoneSelect`, pill tabs, paging, badges) in `portals/doctor/shared.tsx`.
- **Never return a value from a `useEffect` arrow** (use a block body). Newer Chrome makes `scrollIntoView` return a Promise, and that crashed a page.
- Formatting: Prettier with the root `.prettierrc` (`node node_modules/prettier/bin/prettier.cjs --config .prettierrc --write "frontend/src/**/*.{ts,tsx}"`).

## Gotchas already paid for

- **H2 + connection pool:** H2 ties `IN (...)` CHECK constraints to the connection that created them (Flyway's). If the pool retires that connection, every insert into those tables fails with "The database has been closed", about 30 minutes after startup. `application-dev.yml` pins the Hikari pool (`max-lifetime: 0`, `idle-timeout: 0`). Keep it.
- **Realtime connections:** browsers allow ~6 HTTP/1.1 connections per host. `RealtimeProvider` closes its stream on `pagehide` and reconnects on `pageshow`; without that, pages kept in the back/forward cache leak streams and stall every other request.
- **Outlet context:** route wrappers between `PatientLayout` and pages must forward `useOutletContext()` (see `RequireCompleteProfile`).
- **curl in scripts:** use `--form-string` for text fields; `-F` treats `;` in a value as a separator.
- **H2 SQL:** `<param> * interval '1' hour` isn't supported — do date maths in Java and bind timestamps.
- **Bash tool + heredocs:** a heredoc containing an apostrophe (e.g. "isn't") sometimes fails with "unexpected EOF". Write multi-line edit scripts to a file in the scratchpad and run `node <file>`.
- **e2e and toasts:** success toasts sit over bottom-right buttons; the scripts click elements directly (`el.click()`) instead of by coordinates.
- **e2e and date inputs:** headless Chrome uses the OS locale (dd/mm/yyyy here), so typing digits into `input[type=date]` lands in the wrong segments. Set the value with the native setter and dispatch `input` (see the travel step in `journey.mjs`).
- **Refetching child data:** a component that loads its own data with `useApi` keeps a stale copy when the parent reloads; key it by the state that should trigger a refetch (see `InitialConsultationCard`).

## CI

GitHub Actions (`.github/workflows/ci.yml`): API tests on **Java 21** (no `-Djava.version` override there) and the frontend build on Node 24, on pushes to `main` and PRs. `backend/mvnw` must keep its executable bit in git (`git update-index --chmod=+x backend/mvnw`). The e2e journeys are not in CI.

## Before finishing work

1. `./mvnw -Djava.version=17 test` passes.
2. `npm run build` in `frontend/` passes.
3. For UI changes, run `e2e/journey.mjs` and/or `e2e/doctor-journey.mjs` (or click through in the browser) and update `README.md`'s porting status and `documentation/`.
4. Never commit secrets: `apps/patient/.env.local` holds real Supabase keys and is git-ignored. Only `.env.example` files are tracked.
