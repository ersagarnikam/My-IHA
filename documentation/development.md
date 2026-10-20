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

Turn seeding off with `iha.dev.seed-demo-data=false`.

### Creating your own accounts

- Patients: `/register`. Doctors: `/register/doctor`.
- Email isn't sent in development. The 6-digit code is printed in the API log: `Verification code for you@example.com: 123456`.
- Email/SMS alerts appear in the log as `[email → …]` and `[sms → …]`.

### Payments in development

Payments use the simulated provider (`iha.payments.provider=fake`): payment pages show a **Pay Now** button instead of a card form. It runs the same completion logic as Stripe's webhook. To try real Stripe test mode, see [Deployment](deployment.md#stripe).

### Dev simulation (stand-ins for unported portals)

The admin, hospital and lawyer portals don't exist yet, so in the dev profile `/api/dev/**` endpoints play those roles. The web app shows them as dashed **Dev simulation** boxes (only under `npm run dev`, never in a production build).

| Where | Button | Plays |
|---|---|---|
| Patient case page | Publish two treatment options | admin + doctors |
| Patient case page | Propose consultation times | doctor |
| Patient case page | Send hospital letters | hospital |
| Patient / doctor messages | Open chat as coordinator | admin |
| Doctor pending-approval page | Approve my registration / Ask me for more information | admin |
| Doctor dashboard | Assign me a new case | patient + admin |
| Doctor case page | Upload the requested documents | patient |
| Doctor case page | Approve plan and send it to the patient | admin |
| Doctor case page | Request an online consultation | patient |
| Doctor consultation page | Choose the first time and pay | patient |

Delete `dev/DevSimulationController`, `dev/DoctorDevController` and both `DevPanel.tsx` files once the admin portal exists.

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
```

Screenshots go to `e2e/shots/` (git-ignored). The scripts expect Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`; change `executablePath` elsewhere.

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
