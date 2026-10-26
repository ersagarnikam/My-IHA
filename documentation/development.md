# Development guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| JDK | 21 (17 works) | The build targets Java 21. On a machine with only JDK 17, add `-Djava.version=17` to every Maven command and avoid Java 18–21-only APIs. |
| Maven | — | Not needed: use the wrapper `backend/mvnw`. |
| Node.js | 22+ (24 tested) | For the web app and the browser tests. |
| Google Chrome | any recent | Only for the scripted browser tests in `e2e/`. |

No database, Docker or pnpm is needed for development: the API uses an in-memory H2 database in PostgreSQL mode.

## Run it

Two terminals:

```bash
# 1. API on http://localhost:8080 (dev profile)
cd backend
./mvnw spring-boot:run                      # add -Djava.version=17 on a JDK 17 machine
                                            # Windows: mvnw.cmd spring-boot:run

# 2. Web app on http://localhost:5173 (proxies /api to :8080)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173/login.

### Demo accounts

The database starts empty on every API start, so the dev profile seeds demo data (`dev/DevDataSeeder`):

| Account | Password | What's there |
|---|---|---|
| `patient@demo.local` | `Demo1234` | Complete profile, medical history, two cases |
| `doctor@demo.local` | `Demo1234` | Approved, registration fee paid, four affiliated hospitals; one new case invitation, one case in evaluation, and a year of history for the dashboard (treated and paid cases over past months, a case lost to another doctor) |
| `peer1@demo.local`, `peer2@demo.local` | `Demo1234` | Two more Cardiology doctors, so the anonymised benchmark and rank have data |
| `pending.doctor@demo.local` | `Demo1234` | Dr. Olivia Grant, a registration waiting for admin review |
| `admin@demo.local` | `Demo1234` | MTA coordinator (admin portal) |
| `hospital@demo.local` | `Demo1234` | St Vincent's Hospital Sydney, registered and approved; Dr. Chen's and the peers' plans name it, so it has cases, and paid cases waiting for visa letters |
| `pending.hospital@demo.local` | `Demo1234` | Gold Coast Private Hospital, a registration waiting in Hospital Approvals |

Turn seeding off with `iha.dev.seed-demo-data=false`.

### Creating your own accounts

- Patients: `/register`. Doctors: `/register/doctor`.
- Email isn't sent in development. The 6-digit code is printed in the API log: `Verification code for you@example.com: 123456`.
- Email/SMS alerts appear in the log as `[email → …]` and `[sms → …]`.

### Payments in development

Payments use the simulated provider (`iha.payments.provider=fake`): payment pages show a **Pay Now** button instead of a card form. It runs the same completion logic as Stripe's webhook. To try real Stripe test mode, see [Deployment](deployment.md#stripe).

### Dev simulation (stand-ins for unported portals)

The lawyer portal doesn't exist yet, so in the dev profile `/api/dev/**` endpoints play that role — and, for quick testing from one portal, the admin, hospital and patient too. The web app shows them as dashed **Dev simulation** boxes (only under `npm run dev`, never in a production build).

| Where | Button | Plays |
|---|---|---|
| Patient case page | Publish two treatment options | admin + doctors |
| Patient case page | Propose consultation times | doctor |
| Patient case page | Send hospital letters (real: hospital portal → Documents) | hospital |
| Patient / doctor messages | Open chat as coordinator | admin |
| Doctor pending-approval page | Approve my registration / Ask me for more information | admin |
| Doctor dashboard | Assign me a new case | patient + admin |
| Doctor case page | Upload the requested documents | patient |
| Doctor case page | Approve plan and send it to the patient | admin |
| Doctor case page | Request an online consultation | patient |
| Doctor consultation page | Choose the first time and pay | patient |

The admin steps are now available for real in the [admin portal](admin-portal.md); the buttons remain because the e2e scripts use them. Remove them once the scripts drive the real portals.

### Ports already in use

If another project holds 8080 or 5173, run the API on another port and point Vite at it — the defaults stay unchanged:

```bash
./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=8081      # in backend/
PORT=5174 API_URL=http://localhost:8081 npm run dev                          # in frontend/
E2E_BASE=http://localhost:5174 API_LOG=… node journey.mjs                    # in e2e/
```

`.claude/launch.json` has a matching `web-alt` preview configuration.

### Sharing a temporary link

To let someone on another machine use your local servers, run a Cloudflare quick tunnel to the web app: `cloudflared tunnel --url http://localhost:5173`. It prints an `https://<random>.trycloudflare.com` address that lasts until you stop it. The web app's proxy forwards `/api` to the API (presenting the dev origin, so the API's CORS check accepts it), and `vite.config.ts` allows `*.trycloudflare.com` host names. Anyone with the link can use the demo accounts and dev simulation — use it for demos only.

### Looking at the database

The H2 console is at http://localhost:8080/h2-console:

- JDBC URL: `jdbc:h2:mem:iha;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1`
- User `sa`, no password.

Encrypted columns (`*_enc`) show ciphertext — that's expected.

## Tests

### API tests

```bash
cd backend
./mvnw test
```

Spring Boot tests that boot the whole API on H2, run every migration, validate the entities against the schema and drive complete journeys through HTTP (MockMvc):

| Test | Covers |
|---|---|
| `IhaApplicationTests` | The application starts; migrations and entity mappings agree. |
| `cases/PatientCaseFlowTests` | Registration validation, case submission and read-back, file-type rejection, role and ownership checks. |
| `PatientJourneyTests` | Onboarding through treatment options, consultation, payment, invoice and visa submission; chat, notifications, password change and account deletion. |
| `DoctorPortalFlowTests` | Doctor sign-up, registration, approval gate, fee, case through to submitted plan, document requests, consultation slots, chat, settings. |
| `AdminPortalFlowTests` | Admin access, doctor approval, case assignment, plan publish/decline, patient and provider chats. |
| `RefundTests` | Admin refunds: validation, partial and full refunds with the card fee deducted once, credit notes, waived fees, a refunded consultation cancelled, doctor fee refunds, dashboard net of refunds. |
| `LawyerPortalFlowTests` | Lawyer sign-up with consent, registration with a MARN, more-info and resubmission, the OMARA check and approval, assignment of the demo visa case, the status workflow with notifications and case status, document requests, notes, the visa grant, chat. |
| `HospitalPortalFlowTests` | Hospital sign-up, registration, MTA review and resubmission, the gate, settings; what the demo hospital sees, issuing and sending both visa letters and the patient's visa application unlocking. |
| `TimeZoneTests` | A Sydney doctor's slots across daylight saving (10:00 → 23:00 UTC in January, 00:00 UTC in July), the patient getting the doctor's zone, only Australian zones accepted, hospital zones. |
| `patient.PrivacyTests` | Consent is required and recorded with its version; admin privacy settings validation; a deleted account is closed after the grace period (login and contact erased, records kept for the retention years) and purged afterwards. |
| `VerificationTests` | Register checks: a lapsed AHPRA check blocks approval and shows as expired, one ending within 30 days as expiring; an active doctor without an indemnity declaration is flagged. (Approval and indemnity gates through HTTP are in `AdminPortalFlowTests`, `HospitalPortalFlowTests` and `DoctorPortalFlowTests`.) |
| `TaxInvoiceTests` | MTA's business details and GST: plain invoices until registered, then tax invoices with the ABN, GST per line and total (read back from the PDFs). |
| `FeeSettingsTests` | Admin fee settings: access, validation, history and audit, and that doctor billing, consultation fees and the suggested MTA service fee follow the settings. |
| `SecurityAndAuthTests` | Every role against every API prefix, forged and altered tokens, sign-in without revealing accounts, the wrong-code limit, password reset, other patients' records and invoices, unknown ids on admin routes, the seeded demo accounts. |

### Type-check and build the web app

```bash
cd frontend
npm run build          # tsc -b + vite build
```

### Browser journeys

Scripted Chrome runs (puppeteer-core) against the running dev servers. Redirect the API's output to a file so the scripts can read verification codes from it:

```bash
cd backend && ./mvnw spring-boot:run > ../api.log 2>&1 &      # or any log path
cd e2e
npm install
API_LOG=../api.log node journey.mjs          # patient: register → visa application
API_LOG=../api.log node doctor-journey.mjs   # doctor: sign-up → scheduled consultation
node admin-journey.mjs                       # admin: approve, assign, publish/decline, chat (needs a freshly started API)
API_LOG=../api.log node hospital-journey.mjs # hospital: sign-up, wizard, MTA review, visa letters
API_LOG=../api.log node lawyer-journey.mjs   # lawyer: sign-up, wizard, register check, assignment, visa workflow (fresh API)
node smoke.mjs                               # opens every patient/doctor/admin page at desktop and phone width
```

`smoke.mjs` signs in as the demo accounts and fails on page crashes, console errors, failed API calls, error panels, missing headings, redirects or horizontal scrolling. Screenshots go to `e2e/shots/` (git-ignored). The scripts expect Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`; change `executablePath` elsewhere.

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs on every push to `main` and every pull request:

| Job | Runs |
|---|---|
| API tests (Java 21) | `./mvnw -B test` in `backend/`; uploads the Surefire reports when a test fails |
| Web app type-check and build | `npm ci && npm run build` in `frontend/` (Node 24) |

The Chrome journeys in `e2e/` need both servers running and stay a local check.

## Before you push

1. `./mvnw test` passes in `backend/`.
2. `npm run build` passes in `frontend/`.
3. For UI changes, run the relevant `e2e` journey or click through the flow.
4. Update the documentation in this folder and the porting status in the root `README.md`.
5. Never commit secrets. `apps/patient/.env.local` (old app) holds real keys and is git-ignored; only `.env.example` files are tracked.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Every insert fails with "The database has been closed" about 30 minutes after startup | H2 ties some CHECK constraints to the connection that created them. `application-dev.yml` keeps pool connections forever (`max-lifetime: 0`, `idle-timeout: 0`) — don't remove it. |
| The web app hangs on requests after navigating back and forth | Too many open live-update streams. `RealtimeProvider` closes the stream on `pagehide`; keep that behaviour. |
| A new Spring Data repository is ignored | Repositories nested inside another class aren't picked up. Give each its own file. |
| `UnsupportedClassVersionError` or unknown Java API at build time | You're on JDK 17: add `-Djava.version=17` and don't use Java 18–21 APIs (e.g. `Math.clamp`). |
| A page crashes with "destroy is not a function" | A `useEffect` arrow returned a value (newer Chrome's `scrollIntoView` returns a Promise). Use a block body. |
| `curl -F` cuts a text field at `;` | Use `--form-string` for text fields. |
| Logged in as a demo user but the page shows errors after an API restart | The in-memory data was reset; sign out and in again. |
