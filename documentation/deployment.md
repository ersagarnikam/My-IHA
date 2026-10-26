# Deployment

The platform is two deployables:

| Part | Build | Output |
|---|---|---|
| API | `cd backend && ./mvnw -DskipTests package` | `backend/target/iha-api-0.0.1-SNAPSHOT.jar` (run with Java 21: `java -jar …`) |
| Web app | `cd frontend && npm ci && npm run build` | static files in `frontend/dist/` |

Serve `frontend/dist/` from any static host or CDN with a fallback to `index.html` (client-side routing), and route `/api/**` on the same origin to the API (or allow the web origin with `IHA_CORS_ORIGINS`). Keep `/api/realtime` unbuffered — it's a server-sent-events stream (e.g. `proxy_buffering off` in nginx).

## Environment variables

Start the API with `SPRING_PROFILES_ACTIVE=prod`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | `jdbc:postgresql://host:5432/db` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | yes | Database credentials. |
| `IHA_JWT_SECRET` | yes | HMAC key for access tokens, at least 32 bytes of randomness. Changing it signs everyone out. |
| `IHA_PII_KEY` | yes | Base64 of a 32-byte AES key (`openssl rand -base64 32`) for encrypted columns. **Changing or losing it makes existing encrypted data unreadable** — store it in a secrets manager and back it up. |
| `IHA_STORAGE_ROOT` | yes | Directory for uploaded files (default `./data/storage`); must be persistent and backed up. |
| `IHA_CORS_ORIGINS` | if cross-origin | Allowed web origins, comma-separated. |
| `IHA_PAYMENTS_PROVIDER` | no | `stripe` (default in prod) or `fake`. Never `fake` in production. |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | for payments | Stripe keys. |
| `IHA_ADMIN_EMAIL`, `IHA_ADMIN_PASSWORD` | first start | Creates the first MTA admin account if that email doesn't exist (password ≥ 12 characters). Remove them afterwards. |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | optional | Zoom Server-to-Server OAuth app; without it, scheduled consultations have no meeting link. |

Web app build-time variable: `VITE_HOME_URL` — the public website the portal sends signed-out visitors to (default `https://medicaltourismaustralia.com`; see `frontend/.env.example`).

## Database

PostgreSQL 14+. Flyway applies the migrations on startup; the entities are then validated against the schema, so the API refuses to start on a mismatch. Back up the database together with the storage directory and keep `IHA_PII_KEY` with the backups (they're useless without it).

## Stripe

1. Create the API keys (test mode first) and set the three `STRIPE_*` variables.
2. Add a webhook endpoint `https://<api-host>/api/payments/webhook` for `payment_intent.succeeded`, `payment_intent.payment_failed`, `refund.updated` and `refund.failed` (the last two settle refunds Stripe processes asynchronously); copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. The same webhook completes patient payments and doctor fees.

To try Stripe locally: `IHA_PAYMENTS_PROVIDER=stripe` plus test keys, and forward events with the Stripe CLI (`stripe listen --forward-to localhost:8080/api/payments/webhook`).

## Zoom

Create a Server-to-Server OAuth app with meeting-create scope and set the `ZOOM_*` variables. Meetings are created when a consultation is paid.

## The public website

The portal's home is https://medicaltourismaustralia.com. Point the website's buttons at the portal (replace `portal.example.com` with the real host):

| Website button | Link |
|---|---|
| Patient login / Sign in | `https://portal.example.com/login` |
| Get started / Create an account | `https://portal.example.com/register` |
| Submit your case | `https://portal.example.com/patient/cases/new` |
| Forgot password | `https://portal.example.com/forgot-password` |
| Doctor registration | `https://portal.example.com/register/doctor` |
| Hospital registration | `https://portal.example.com/register/hospital` |
| Visa lawyer registration | `https://portal.example.com/register/lawyer` |
| Doctor, hospital or lawyer login | `https://portal.example.com/login` |

## Not production-ready yet

| Gap | What's needed |
|---|---|
| Email and SMS | Wire a provider (e.g. Resend, Twilio) into `notification/AlertDispatcher` and `auth/VerificationCodeSender` — today they only log. **Users can't verify their email in production until this is done.** |
| Visa lawyer portal | Not ported; visa processing (lawyer assignment, document requests, approved visas) needs it, or direct database work. |
| Several API instances | `RealtimeHub` is in memory; add a broker before scaling out. |
| File storage | Local disk only; use shared/object storage for more than one instance. |
| Data from the old Supabase project | Needs a migration script (decrypt with the old pgcrypto key, re-encrypt with `IHA_PII_KEY`). |

## Go-live checklist

- [ ] `SPRING_PROFILES_ACTIVE=prod`; no dev profile anywhere (it enables demo data and `/api/dev/**`).
- [ ] Strong, unique `IHA_JWT_SECRET` and `IHA_PII_KEY` from a secrets manager; `IHA_PII_KEY` backed up.
- [ ] PostgreSQL backups and storage-directory backups scheduled and tested.
- [ ] Stripe live keys and webhook secret; a test payment end to end.
- [ ] Email delivery implemented and verified.
- [ ] HTTPS everywhere; `IHA_CORS_ORIGINS` limited to the web origin.
- [ ] `VITE_HOME_URL` set for the environment; website buttons point at the right host.
- [ ] `/actuator/health` wired to monitoring.
