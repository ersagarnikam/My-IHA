# MTA Platform

[![CI](https://github.com/ersagarnikam/My-IHA/actions/workflows/ci.yml/badge.svg)](https://github.com/ersagarnikam/My-IHA/actions/workflows/ci.yml)

**Medical Tourism Australia** connects international patients with Australian doctors, hospitals and visa lawyers. A patient submits a medical case; MTA invites doctors; doctors evaluate it and propose treatment plans; the patient chooses one, pays, applies for a visa and travels for treatment.

This repository is mid-migration from a Next.js + Supabase monorepo to:

| Part | Stack | Folder |
|---|---|---|
| API | Java 21, Spring Boot 4.1, Spring Security (JWT), Spring Data JPA, Flyway | [`backend/`](backend/) |
| Database | H2 in memory for development, PostgreSQL for real environments | migrations in `backend/src/main/resources/db/migration` |
| Web app | React 19, TypeScript, Vite, React Router | [`frontend/`](frontend/) |
| Browser tests | puppeteer-core driving Chrome | [`e2e/`](e2e/) |

The old code (`apps/`, `packages/`, `supabase/`, documented in `docs/`) stays in place as the reference until every portal is ported.

## Documentation

Start with **[documentation/](documentation/README.md)**:

- [Architecture](documentation/architecture.md) — how the pieces fit: roles, security, events, live updates, payments, files.
- [Development guide](documentation/development.md) — run it locally, demo accounts, dev simulation, tests, troubleshooting.
- [Backend guide](documentation/backend.md) · [Frontend guide](documentation/frontend.md) — conventions and how to add features.
- [API reference](documentation/api-reference.md) · [Data model](documentation/data-model.md) — every endpoint, table and lifecycle.
- [Patient portal](documentation/patient-portal.md) · [Doctor portal](documentation/doctor-portal.md) — what users can do.
- [Deployment](documentation/deployment.md) — environment variables, PostgreSQL, Stripe, Zoom, website links, go-live checklist.

Working with Claude Code? See [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
# API on :8080 (dev profile: in-memory H2, demo data, H2 console at /h2-console)
cd backend
./mvnw spring-boot:run          # on a JDK 17 machine add: -Djava.version=17

# Web app on :5173 (proxies /api to :8080)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173/login and sign in with a demo account (recreated on every API start):

| Account | Password |
|---|---|
| `patient@demo.local` | `Demo1234` |
| `doctor@demo.local` | `Demo1234` |
| `admin@demo.local` | `Demo1234` |

Email isn't sent in development: verification codes are printed in the API log (`Verification code for …`). Payments are simulated with a **Pay Now** button. Dashed **Dev simulation** boxes stand in for the portals that aren't ported yet (hospital, lawyer) and for quick admin/patient steps.

## Tests

```bash
cd backend && ./mvnw test        # boots the API on H2 and drives full patient and doctor journeys over HTTP
cd frontend && npm run build     # type-check + production build
cd e2e && API_LOG=<api log> node journey.mjs          # patient journey in Chrome
cd e2e && API_LOG=<api log> node doctor-journey.mjs   # doctor journey in Chrome
cd e2e && node admin-journey.mjs                      # admin journey in Chrome
```

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the API tests on Java 21 and the web app build on every push to `main` and every pull request. The Chrome journeys need both servers and run locally.

## Website and portal

The public website **https://medicaltourismaustralia.com** is the home page; the portal has no landing page of its own. Signed-out visitors to `/` and anyone who signs out go back to the website (`VITE_HOME_URL` overrides it per environment). Website buttons link to `/login`, `/register`, `/register/doctor` and deep pages — see [Deployment](documentation/deployment.md#the-public-website) for the link table.

## Porting status

| Area | Status |
|---|---|
| Patient portal | **Ported** — registration, onboarding, dashboard, cases and documents, treatment options, consultations, payments and invoices, visa wizard, chat, live notifications, English/Chinese. |
| Doctor portal | **Ported** — sign-up and registration wizard, approval gate with resubmission, registration and annual fees, performance dashboard (earnings, funnel, benchmark), cases with document requests, **required initial Zoom consultation before the treatment plan**, plan builder, follow-up consultations (Brisbane time), chat, settings. |
| Admin portal | **Started** — dashboard, doctor approvals, case assignment, plan review (publish with MTA's fee or decline), patient and provider support inbox. See [documentation/admin-portal.md](documentation/admin-portal.md). |
| Hospital portal | Not yet. |
| Visa lawyer portal | Not yet. |
| Email / SMS delivery | Not yet — alerts and codes are logged. |
| Multi-instance live updates | Not yet — the realtime hub is in memory. |
| Data migration from Supabase | Not yet. |
