# CLAUDE.md

Guidance for Claude Code sessions in this repository. Read this first, then `README.md` (run instructions, porting status, old→new mapping).

## What this is

IHA / "MTA" (Medical Tourism Australia): a platform connecting international patients with hospitals, doctors and visa lawyers around a shared **case**.

The project is **mid-migration** from a Next.js + Supabase monorepo to Spring Boot + React:

| Folder | Status |
|---|---|
| `backend/` | **New.** Java 21, Spring Boot 4.1, Spring Security (JWT), Spring Data JPA, Flyway. H2 in dev, PostgreSQL in prod. |
| `frontend/` | **New.** React 19, TypeScript, Vite, React Router 7. One SPA with a route tree per role. |
| `e2e/` | **New.** Scripted Chrome (puppeteer-core) runs against the local dev servers: `journey.mjs` (patient), `doctor-journey.mjs` (doctor). Run with `API_LOG=<api log> node <script>`. |
| `apps/`, `packages/`, `supabase/` | **Old** Next.js/Supabase code. Kept untouched as the reference for porting. Do not edit; delete only when the user says so. |
| `docs/` | Technical docs of the **old** stack (per app, per package). The best source for how a feature is supposed to behave. |

## Porting status

- **Done:** the entire patient portal (auth, onboarding/profile, dashboard, cases, documents, treatment options, consultations, payments + invoices, visa wizard and detail, chat, live notifications, English/Chinese). Backend journey tests and the e2e script cover it.
- **Done:** the doctor portal (backend `doctor/` + `providerchat/`, frontend `portals/doctor/`, migration V4). Covered by `DoctorPortalFlowTests` and `e2e/doctor-journey.mjs`. English only (the old doctor app had no i18n). Visual reference: the live dev portal https://dev.doctor.medicaltourismaustralia.com (view only — never click data-changing actions there).
- **Next:** hospital, visa-lawyer and admin portals. Suggested order: **admin next** (it owns approvals, case assignment, plan publishing and opening chats).
  - Their routes are placeholders (`portal(...)` in `frontend/src/App.tsx`); API prefixes are already role-guarded in `SecurityConfig`.
  - Admin-side operations already written as services: `DoctorAdminService` (review doctor, assign case, publish plan), `ProviderMessageService.open/close/sendAsAdmin`, `ChatService.openThread/sendAsAdmin`, `CaseStatusService.transition`, `VisaSubmission.assignLawyer`. Expose them under `/api/admin/**`.
  - Provider chat is generic (`ProviderAccount` type doctor/hospital/lawyer): hospital and lawyer portals reuse `ProviderMessageService`.
  - Doctor fee payments ride the shared `PaymentGateway`/webhook: `PaymentService` publishes `UnmatchedIntentEvent` for intents that aren't patient payments; `DoctorFeeService` claims them. Do the same for any new payment type.
  - **When the admin portal lands, delete the stand-ins:** `dev/DevSimulationController.java`, `dev/DoctorDevController.java`, `portals/patient/DevPanel.tsx`, `portals/doctor/DevPanel.tsx`.
- **Demo data:** `dev/DevDataSeeder` seeds hospitals, `patient@demo.local` and `doctor@demo.local` (password `Demo1234`) on every dev start, through the real services. Tests also run in the dev profile, so the seeder runs there too.
- Case references are `MTA-<year>-<seq>` (the live system's format).
- **Not yet built:** real email/SMS (`notification/AlertDispatcher` only logs), multi-instance realtime (`RealtimeHub` is in-memory), migrating data from the old Supabase project.
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
- Don't run installers (winget etc.) without asking the user.
- Avoid Java 18–21-only APIs (e.g. `Math.clamp`) until JDK 21 is installed.

## Backend conventions

- Packages by feature under `com.iha` (`auth`, `patient`, `cases`, `treatment`, `consultation`, `payment`, `visa`, `chat`, `notification`, `realtime`, …). Controllers hold request/response records; services hold rules and `@Transactional`.
- **Security is in services, not the DB.** The old app relied on Postgres RLS; here every patient query starts from `PatientService.requireCurrent(user)` and ownership checks such as `CaseService.requireOwned`. Return 404 (not 403) for records that aren't the caller's.
- **Old SQL triggers/RPCs became explicit service code.** Port the exact behaviour, including notification titles and messages: the case timeline matches on them (see `CaseStatusService.textFor`). Read the latest definition of a function across `packages/db/supabase/migrations` before porting it.
- **Cross-module side effects go through events** to avoid bean cycles: e.g. `TreatmentOptionSelectedEvent`, `ConsultationSlotSelectedEvent`, `PaymentCompletedEvent`, `PatientRegisteredEvent`. Browser pushes use `RealtimeEvent` (sent after commit).
- **Errors:** throw `ApiException` (status + stable `code` + user-safe message) or `FieldValidationException`; both render as problem details with `code` / `fieldErrors`.
- **Encrypted columns** (`*_enc`) use the JPA converters in `crypto/` (string, date, decimal, string list). Never log their values; audit entries record only that something changed.
- **Uploads:** always `Uploads.validate(...)`, which checks size and detects the type from file bytes (`storage/FileType`). Files are served through the API after an ownership check, never by storage path.
- **Flyway:** migrations are append-only (`V5__…` next). SQL must run on both H2 (PostgreSQL mode) and Postgres: uuid ids generated in Java, `varchar` not `text`, no array defaults, no `gen_random_uuid()`.
- **Spring Data ignores nested repository interfaces**: one repository per file.
- **Tests:** `@SpringBootTest` + MockMvc journeys (`PatientJourneyTests`, `PatientCaseFlowTests`). Seed provider-side data directly in the test until those portals exist; admin steps go through `DoctorAdminService` (see `DoctorPortalFlowTests`).

## Frontend conventions

- Everything for a role lives under `frontend/src/portals/<role>/`; shared bits in `components/` (`ui.tsx` kit, `Toasts`), `lib/` (`api.ts`, `useApi`, `realtime.tsx`, `format.ts`, `types.ts`, `cases.ts`).
- **All UI text goes through i18n:** `useT('namespace')`. `src/i18n/en.json` / `zh.json` are copied from `apps/patient/messages`; reuse existing keys before adding new ones (add to both files). Auth strings are in `auth-messages.json`. Exception: the doctor portal (`portals/doctor/`) is English-only with plain strings, like the old doctor app.
- Data: `useApi(path)` for reads (`reload()` keeps data on screen), `apiPost/apiPut/apiDelete` for writes, `openFile()` for authenticated downloads. Show server `fieldErrors` with `fieldError(error, 'field')`.
- Live updates: `useRealtime('notification' | 'chat_message', handler)`.
- **Never return a value from a `useEffect` arrow** (use a block body). Newer Chrome makes `scrollIntoView` return a Promise, and that crashed a page.
- Formatting: Prettier with the root `.prettierrc` (`node node_modules/prettier/bin/prettier.cjs --config .prettierrc --write "frontend/src/**/*.{ts,tsx}"`).

## Gotchas already paid for

- **H2 + connection pool:** H2 ties `IN (...)` CHECK constraints to the connection that created them (Flyway's). If the pool retires that connection, every insert into those tables fails with "The database has been closed", about 30 minutes after startup. `application-dev.yml` pins the Hikari pool (`max-lifetime: 0`, `idle-timeout: 0`). Keep it.
- **Realtime connections:** browsers allow ~6 HTTP/1.1 connections per host. `RealtimeProvider` closes its stream on `pagehide` and reconnects on `pageshow`; without that, pages kept in the back/forward cache leak streams and stall every other request.
- **Outlet context:** route wrappers between `PatientLayout` and pages must forward `useOutletContext()` (see `RequireCompleteProfile`).
- **curl in scripts:** use `--form-string` for text fields; `-F` treats `;` in a value as a separator.

## Before finishing work

1. `./mvnw -Djava.version=17 test` passes.
2. `npm run build` in `frontend/` passes.
3. For UI changes, run `e2e/journey.mjs` (or click through in the browser) and update `README.md`'s porting status.
4. Never commit secrets: `apps/patient/.env.local` holds real Supabase keys and is git-ignored. Only `.env.example` files are tracked.
