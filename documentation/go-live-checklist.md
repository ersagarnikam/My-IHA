# Production go-live checklist

**Status on 2026-11-06: not ready for real patients.** The portals work end to end on a production-style local stack, but nothing is hosted, the real payment, email and Zoom services haven't been tried, and the blockers in section 2 are open.

Work through the sections in order. Tick an item only after someone has checked it, and record who and when in the pull request or tracker. Commands and settings are in [deployment.md](deployment.md).

Owners: **MTA** (business), **Dev**, **Legal** (lawyer), **Accountant**.

## 1. Decisions needed first

| Done | Decision | Owner | Why it matters |
|---|---|---|---|
| [ ] | Which host and region? | MTA + Dev | Decides backups, encrypted disks and whether health data leaves Australia. An Australian region is the simplest starting point. |
| [ ] | What is the portal's address? | MTA | Needed for HTTPS, Stripe, Resend and the website's links. |
| [ ] | What happens to the old system? | MTA | `patient.` and `doctor.medicaltourismaustralia.com` still answer. If real people or data are there, plan the data migration and switch-over. Migration isn't started. If there's nothing to keep, record that and skip section 8. |
| [ ] | Launch to everyone, or a limited pilot first? | MTA | A pilot with a few known doctors and patients is the safer first step. |
| [ ] | Who is on call, and who handles a privacy complaint or data breach? | MTA | Someone must be named before real health data is held. |

## 2. Blockers found in the code and site

These were checked against the current code on 2026-11-06.

| Done | Blocker | What was found | What's needed | Owner |
|---|---|---|---|---|
| [ ] | Privacy policy and terms links are broken | `/privacy-policy/` and `/terms-and-conditions/` on the website both return 404, and sign-up asks people to accept them | Publish both pages, then set the links under admin **Settings** | MTA + Legal |
| [ ] | No limit on sign-in attempts | 12 wrong passwords in a row were all answered normally. There's no lockout or rate limit on sign-in, code requests or sign-up, so anyone can guess passwords or run up email and SMS costs | Rate limits on `/api/auth/**`, in the app or at the network edge | Dev |
| [ ] | No two-step sign-in | Admins can see every patient's health information with a password alone | Two-step sign-in, at least for admins | Dev |
| [ ] | Uploaded medical documents aren't encrypted by the app | `LocalStorageService` writes files as they are, while database fields are encrypted | At minimum an encrypted disk; better, encrypted object storage | Dev |
| [ ] | Uploads aren't scanned for malware | Type and size are checked, but doctors and lawyers download what patients upload | Add scanning, or record a decision to accept the risk | Dev + MTA |
| [ ] | No backups | The Docker setup keeps data in local volumes with no backup | Scheduled database and file backups, stored off the server, with a restore test | Dev |
| [ ] | Stripe has never been run | No test covers `StripePaymentGateway`, and every run so far used simulated payments | Full test-mode run, then one small live payment and refund | Dev + MTA |
| [ ] | Payments can start simulated by mistake | The `prod` profile still starts with `IHA_PAYMENTS_PROVIDER=fake`, and `.env.example` defaults to `fake` with codes written to the log | Make the API refuse to start in `prod` with either setting | Dev |
| [ ] | Zoom has never been run | Without Zoom keys the API only logs a warning, so a patient can pay AUD 200 and get no meeting link | Treat Zoom as required, and test a real paid booking | Dev + MTA |
| [ ] | Security headers are missing | No HSTS or Content-Security-Policy. Sessions are kept in browser storage, so a CSP matters | Add both, and check that Stripe still loads | Dev |
| [ ] | No monitoring or error alerts | No error tracking or metrics, and `/actuator/health` isn't reachable through the public address (it returns the web app) | Expose a health check to the monitor, and set up alerts and log retention | Dev |
| [ ] | No dependency update checks | No Dependabot or similar on the repository | Turn on update and vulnerability alerts | Dev |
| [ ] | Failed messages aren't retried | A failed email or SMS is logged and dropped, and messages waiting at a restart are lost. Codes can be requested again and alerts stay in the portal | Add retries, or record a decision to accept this for launch | Dev + MTA |

## 3. Legal and compliance

These are questions for an Australian lawyer, not legal advice. Allow time for this: the answers can change what the portal says or does.

| Done | Item | Owner |
|---|---|---|
| [ ] | Privacy policy covers health information, consent, retention and how to complain | Legal |
| [ ] | Overseas recipients are named: Resend, Twilio, Stripe, Zoom and the host, wherever they process data outside Australia | Legal |
| [ ] | Data breach response plan written, including Notifiable Data Breaches duties | Legal + MTA |
| [ ] | Privacy impact assessment done, including any state health records laws and overseas patients' home-country laws | Legal |
| [ ] | Terms confirm MTA's role, cancellations and refunds. Admin refund rules match them | Legal |
| [ ] | Consent wording reviewed, including the Chinese text of the patient portal | Legal |
| [ ] | Written agreements with doctors, hospitals and visa lawyers | Legal + MTA |
| [ ] | MTA's own wording doesn't amount to immigration advice; only registered agents and lawyers advise | Legal |
| [ ] | Website and portal claims meet health advertising rules, including AHPRA's | Legal |
| [ ] | Retention period confirmed (default 7 years, in **Settings**) | Legal |
| [ ] | Insurance in place: professional indemnity and cyber | MTA |

## 4. Business setup

| Done | Item | Owner |
|---|---|---|
| [ ] | ABN, legal name, address and billing email entered in **Settings**. ABN is blank by default | MTA |
| [ ] | GST registration and the tax setting for each charge confirmed. The defaults are placeholders | Accountant |
| [ ] | All fees reviewed in **Settings**: doctor registration and annual fees, AUD 200 consultation, 10% suggested service fee, card fee estimate | MTA |
| [ ] | Refund policy agreed, including who may approve refunds | MTA + Accountant |
| [ ] | Stripe account approved for this business, with payouts going to the right bank account | MTA |
| [ ] | Support email and phone staffed. Staff trained using `docs/demo/` | MTA |
| [ ] | First doctors, hospitals and lawyers recruited, and their register checks completed | MTA |

## 5. Accounts and services

| Done | Item | Owner |
|---|---|---|
| [ ] | Domain and DNS ready for the portal | MTA + Dev |
| [ ] | Resend: domain verified with SPF, DKIM and DMARC. Sender set in `RESEND_FROM_ADDRESS` | Dev |
| [ ] | Real code received at Gmail, Outlook and a Chinese provider such as QQ, and not in spam | Dev + MTA |
| [ ] | Twilio: sending number or sender ID registered for Australia | Dev + MTA |
| [ ] | SMS delivered to an Australian mobile and to each main patient country. China has its own sender rules | Dev + MTA |
| [ ] | Stripe: live keys set; webhook added at `/api/payments/webhook` for `payment_intent.succeeded`, `payment_intent.payment_failed`, `refund.updated` and `refund.failed`; `STRIPE_WEBHOOK_SECRET` set | Dev |
| [ ] | Zoom: Server-to-Server OAuth app with meeting-create scope, `ZOOM_*` set | Dev |

## 6. Production environment

| Done | Item | Owner |
|---|---|---|
| [ ] | `SPRING_PROFILES_ACTIVE=prod`, with no dev profile anywhere | Dev |
| [ ] | `IHA_PAYMENTS_PROVIDER=stripe` and `IHA_VERIFICATION_LOGCODES=false` | Dev |
| [ ] | `COMPOSE_PROFILES`, `RESEND_BASE_URL` and `TWILIO_BASE_URL` aren't pointing at the local mailbox | Dev |
| [ ] | New secrets generated for production. Nothing reused from a test `.env` | Dev |
| [ ] | `IHA_PII_KEY` kept in a secrets manager with a separate backup. **If it's lost, encrypted patient data can't be read** | Dev + MTA |
| [ ] | Database isn't publicly reachable, and its disk is encrypted | Dev |
| [ ] | HTTPS on the portal, HTTP redirects to it, certificate renewal is automatic | Dev |
| [ ] | `PUBLIC_URL` is the real `https://` address, with no trailing slash | Dev |
| [ ] | Any proxy in front keeps `/api/realtime` unbuffered and allows 50 MB uploads | Dev |
| [ ] | One API instance only. Live updates and local file storage don't support more yet | Dev |
| [ ] | Backups running, and a restore tested on a separate server, including files and `IHA_PII_KEY` | Dev |
| [ ] | First admin signed in and password changed. `IHA_ADMIN_EMAIL` and `IHA_ADMIN_PASSWORD` removed | Dev + MTA |
| [ ] | Admin accounts created for named staff only, because every admin has full access | MTA |
| [ ] | Build deployed from a tagged commit with CI green | Dev |
| [ ] | Independent security test or penetration test done, and findings fixed | MTA + Dev |

## 7. Final checks on the production address

Use a real card, phone and email, with test accounts marked clearly so they can be closed afterwards.

| Done | Check | Owner |
|---|---|---|
| [ ] | Patient signs up, receives the real code, and consent is recorded | MTA |
| [ ] | Case goes through all five portals, following `docs/demo/end-to-end-journey.md` | MTA + Dev |
| [ ] | Real low-value card payment succeeds, and the invoice PDF looks right when opened | MTA |
| [ ] | Full or partial refund reaches the card, and the credit note looks right | MTA |
| [ ] | Doctor pays a registration fee | MTA |
| [ ] | Zoom link arrives after payment and works for both people | MTA |
| [ ] | Hospital letters and the visa grant upload and download correctly | MTA |
| [ ] | Password reset works; suspending a user signs them out immediately | MTA |
| [ ] | Website buttons open the right pages, and sign-out returns to the website | MTA |
| [ ] | `/api/dev/**` isn't available, demo logins fail, and the dashed dev panels don't appear | Dev |
| [ ] | Portal works on a phone and in the main browsers, in English and Chinese | MTA |
| [ ] | Monitoring alert reaches the on-call person when the API is stopped | Dev |
| [ ] | Test records closed. MTA's reports and exports are clean | MTA |

## 8. Launch day

| Done | Step | Owner |
|---|---|---|
| [ ] | Pick a quiet time, with Dev and a business owner available | MTA |
| [ ] | Take a backup and confirm it finished | Dev |
| [ ] | If migrating: freeze the old system, migrate, and compare counts and sample records | Dev |
| [ ] | Deploy and confirm the health check and migrations | Dev |
| [ ] | Point the website buttons at the portal | MTA |
| [ ] | Run a short check: sign in, one page per portal, one small payment | Dev + MTA |
| [ ] | Announce it, starting with the pilot group if there is one | MTA |

**Rollback:** migrations only go forward, so a failed release that changed the database means restoring the backup and deploying the previous tagged build. Anything recorded after that backup would be lost, so check Stripe for payments made in between. Decide who can call a rollback before launch.

## 9. First two weeks

| Done | Item | Owner |
|---|---|---|
| [ ] | Check errors, failed emails and SMS every day | Dev |
| [ ] | Compare Stripe with the admin **Payments** page each week. Check the webhook has no failures | MTA + Dev |
| [ ] | Confirm nightly backups, and repeat a restore test after the first week | Dev |
| [ ] | Review the **Audit Log** for unexpected admin activity | MTA |
| [ ] | Confirm alerts for lapsing doctor and hospital registrations are being acted on | MTA |
| [ ] | Hold a review, then plan fee payments for hospitals and lawyers | MTA + Dev |

## Already verified

Checked locally on Java 21, PostgreSQL 17 and nginx, with the mailbox standing in for Resend and Twilio. None of this proves the real services work.

- All 52 backend tests, the frontend build and all seven e2e scripts, including the 118-page smoke test, with no API errors.
- All 14 migrations apply on PostgreSQL. The API checks the schema on start.
- Email and SMS requests are correctly formed. Sign-up keeps working during a provider outage, and codes can be resent.
- Replacing the API container causes no outage in nginx.
- In the `prod` profile, `/api/dev/**` needs a sign-in and has no demo accounts or data; the H2 console isn't available.
- Passwords must meet the strength rule, and verification codes expire after 15 minutes and 5 attempts.
- Sensitive database fields are encrypted, data survives a restart, and refunds, tax invoices, register checks and consent records have tests.
