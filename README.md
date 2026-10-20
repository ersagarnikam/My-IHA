# IHA Platform

Medical-tourism platform connecting international patients with hospitals, doctors and visa lawyers.

The platform is being moved off the Next.js + Supabase monorepo (`apps/`, `packages/`, `supabase/`, documented in `docs/`) onto:

| Part | Stack |
|---|---|
| API (`backend/`) | Java 21, Spring Boot 4.1, Spring Security (JWT), Spring Data JPA, Flyway |
| Database | H2 in memory for development, PostgreSQL for real environments |
| Web app (`frontend/`) | React 19, TypeScript, Vite, React Router |

The old code stays in place as the reference until each flow is ported.

## Running locally

```bash
# API on :8080 (dev profile: in-memory H2, H2 console at /h2-console)
cd backend
./mvnw spring-boot:run

# Web app on :5173 (proxies /api to :8080)
cd frontend
npm install
npm run dev
```

Email isn't wired up yet: in the dev profile, verification and password-reset codes are written to the API log (`Verification code for …`), and email/SMS alerts are logged as `[email → …]` / `[sms → …]`.

Payments are simulated by default (`iha.payments.provider=fake`): the payment page shows a "Pay Now" button that runs the same completion logic as the Stripe webhook. Set `IHA_PAYMENTS_PROVIDER=stripe` plus the Stripe keys below to take real payments.

**Demo accounts (dev profile).** The H2 database is in memory, so all data is lost when the API restarts; `dev/DevDataSeeder` recreates demo data on every start (turn off with `iha.dev.seed-demo-data=false`):

| Account | Password | What's there |
|---|---|---|
| `patient@demo.local` | `Demo1234` | Complete profile, two cases |
| `doctor@demo.local` | `Demo1234` | Approved, fee paid, four affiliated hospitals; one new case invitation and one case in evaluation |

**Dev simulation.** The hospital, lawyer and admin portals aren't ported yet, so in the dev profile `/api/dev/*` (and dashed "Dev simulation" boxes in the UI, shown only under `npm run dev`) stand in for them: publishing treatment options, approving doctors and their plans, assigning cases, sending hospital letters and opening support chats. They also play the patient from the doctor portal (upload requested documents, request and pay for a consultation). Remove `dev/DevSimulationController`, `dev/DoctorDevController` and the `DevPanel.tsx` files once the admin portal exists.

Tests: `./mvnw test` in `backend/` (boots the app, runs every migration on H2, validates entities against the schema, and runs HTTP-level flow tests). `npm run build` in `frontend/` type-checks and builds.

### Production profile

Run with `SPRING_PROFILES_ACTIVE=prod` and set:

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | PostgreSQL connection (`jdbc:postgresql://…`) |
| `IHA_JWT_SECRET` | HMAC key for access tokens, at least 32 bytes |
| `IHA_PII_KEY` | Base64 of a 32-byte AES key for encrypted columns (`openssl rand -base64 32`). Changing it makes existing rows unreadable. |
| `IHA_STORAGE_ROOT` | Directory for uploaded files (default `./data/storage`) |
| `IHA_CORS_ORIGINS` | Allowed web origins, comma-separated |
| `IHA_PAYMENTS_PROVIDER` | `stripe` (default in prod) or `fake` |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe API keys; point the Stripe webhook at `POST /api/payments/webhook` |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | Zoom Server-to-Server OAuth app for consultation meetings (optional; without it, meetings get no link) |

The web app reads one build-time variable, `VITE_HOME_URL` (see `frontend/.env.example`).

## Website and portal

The public website, **https://medicaltourismaustralia.com**, is the home page. The portal (this app) has no landing page of its own:

- Opening the portal root (`/`) while signed out sends the visitor to the website; signed-in users go straight to their own area (patients to `/patient/dashboard`, other roles to theirs).
- Signing out (or deleting the account) returns to the website.
- Sign-in and registration pages show the MTA logo and a "Back to medicaltourismaustralia.com" link.
- Any portal page can be linked directly. A signed-out visitor is asked to sign in first, then lands on the page the link pointed to.

Change the website address per environment with `VITE_HOME_URL` (default `https://medicaltourismaustralia.com`).

**Links to put on the website** (replace `https://portal.example.com` with wherever the portal is hosted, e.g. a `portal.` subdomain):

| Website button | Link |
|---|---|
| Patient login / Sign in | `https://portal.example.com/login` |
| Get started / Create an account | `https://portal.example.com/register` |
| Submit your case | `https://portal.example.com/patient/cases/new` |
| Forgot password | `https://portal.example.com/forgot-password` |
| Doctor, hospital or visa lawyer login | `https://portal.example.com/login` (everyone signs in on the same page and is sent to their own area by role) |

| Doctor registration | `https://portal.example.com/register/doctor` |

Hospital and visa-lawyer sign-up links will be added when those portals are ported.

## How the old design maps onto the new one

| Supabase / Next.js | Spring / React |
|---|---|
| Supabase Auth (email + OTP) | `app_users` table, BCrypt passwords, 6-digit email codes, HS256 JWTs (`auth/`) |
| Five portals on ports 3000–3004 | One SPA with a route tree per role (`/patient`, `/doctor`, `/hospital`, `/lawyer`, `/admin`), guarded by the JWT's `role` claim |
| Row-level security policies | Role check per API prefix (`/api/patient/**` needs `PATIENT`, …) in `SecurityConfig`, plus ownership checks in services: every patient query starts from the caller's own `patients` row |
| pgcrypto `*_enc` bytea columns | AES-256-GCM `EncryptedStringConverter` on `*_enc` varchar columns |
| `SECURITY DEFINER` RPCs and triggers (notifications, status sync, audit) | Service methods that do the same writes explicitly (`NotificationService`, `AuditService`) |
| Supabase Storage buckets | `StorageService` (local disk now; swap the implementation for S3 or similar). Files are always streamed through the API after an ownership check |
| Supabase Realtime | Server-sent events on `GET /api/realtime` (`RealtimeHub`), read with `fetch` so the JWT can be sent. Single-instance only for now |
| next-intl (en/zh) | The same `messages/en.json` and `zh.json` catalogues with a small translator (`i18n/I18nContext.tsx`) |
| `hard-delete-expired-patients` Edge Function | `PatientRetentionJob` (daily, 30-day grace period) |
| 137 incremental migrations | `V1__core_schema.sql` (final shape of all 28 tables), `V2__seed_reference_data.sql`, `V3__patient_portal.sql`, `V4__doctor_portal.sql` |

Backend packages are by feature: `auth`, `patient`, `cases`, `documents`, `treatment`, `consultation`, `payment`, `visa`, `chat`, `notification`, `realtime`, `dashboard`, `doctor` (doctor portal), `provider` (hospital/doctor/lawyer entities), `providerchat` (provider ↔ admin support chat), `specialty`, `audit`, `crypto`, `storage`, `zoom`, `config`, `common`, and `dev` (dev profile only).

## Porting status

**Patient portal: ported.**
- Registration, email verification, login, forgot/reset password, change password, account deletion (30-day grace, then hard delete).
- Onboarding wizard and profile (personal details, medical background, emergency contact, avatar, notification preferences, saved cards).
- Dashboard (journey progress, next action), cases (3-step wizard, add documents, travel assistance, status and notification timelines).
- Treatment options with cost breakdown, option selection, online consultations (request → choose a time → pay → Zoom meeting).
- Payments: Stripe Payment Element with saved cards (or simulated), webhook, payment history, PDF invoices.
- Visa: hospital letters, 8-step application wizard with document uploads and server-side validation, application detail, lawyer document requests, approved visa download, travel guide.
- Documents page (medical + visa, standalone uploads, link to case), support chat, notifications with live updates, English/Chinese.

Tests: `backend` has HTTP-level journey tests for all of the above; the UI was also driven end to end in Chrome.

**Doctor portal: ported** (matches the live dev doctor portal).
- Sign-up at `/register/doctor`, email verification, 4-step registration wizard with document uploads; pending-approval page with resubmission when MTA rejects or asks for more information; registration fee (Stripe or simulated) unlocks the portal.
- Dashboard (quick actions, metrics, upcoming consultations and treatments, recent cases), My Cases (tabs, search, date filter), case details (patient info, history, documents, accept/decline, start evaluation, tracked document requests, mark completed).
- Treatment plan builder (draft/submit, affiliated hospitals and room categories, itemised costs, specialists, live total); hospital notified on submission.
- Consultations: propose up to three times in Brisbane time, cancel, scheduled meeting with Join Zoom (opens 15 minutes before).
- Support chat with MTA, notifications, account settings (profile, photo, availability, billing with annual renewal, invoices as PDF, password, notification preferences).
- English only, like the old doctor app. Doctor-facing times are Brisbane time (the patient portal's slot times now say "(Brisbane Time)" too).

Tests: `DoctorPortalFlowTests` (HTTP, whole journey) and `e2e/doctor-journey.mjs` (Chrome).

**Not yet ported:**
- Hospital, visa-lawyer and admin portals (provider approval, case assignment and plan publishing currently exist only as service methods in `DoctorAdminService` used by dev simulation, letters, visa processing).
- Real email/SMS delivery (Resend/Twilio): `notification/AlertDispatcher` only logs.
- Shared realtime for multiple API instances (needs a broker behind `RealtimeHub`).
- Data migration from the Supabase project.
