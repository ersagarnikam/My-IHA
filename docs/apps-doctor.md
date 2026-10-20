# `apps/doctor` — Doctor Portal

> Scope: everything under `apps/doctor/` except `node_modules`, `.next` and `.turbo`. All paths below are relative to the repo root.

---

## 1. Overview

The Doctor Portal is the Next.js 15 (App Router) app that **medical specialists** use on the MTA (Medical Tourism Australia / "IHA") platform. With it, a doctor can:

- self-register through a 7-step wizard, then wait for MTA Admin approval (or resubmit after a rejection or a "more info" request),
- pay a one-time **registration fee** (Stripe, or an offline bank transfer) before the dashboard unlocks, and later pay an **annual renewal fee**,
- accept or decline cases that Admin has invited them to, review patient case details and documents, and ask the patient for more documents,
- start an evaluation, write and submit a **treatment plan** to MTA Admin, and mark a case completed once treatment is over,
- propose or cancel **consultation** time slots (in Sydney time) and join the Zoom call,
- message MTA Admin in a single provider thread, and receive in-portal notifications in real time,
- manage their profile, availability, billing, invoices, security and notification preferences.

- **Port:** `3004`, set in both `dev` and `start` scripts.
- **Users:** only accounts that have a `doctors` row. Hospital accounts, and patient or lawyer accounts, are signed out or rejected.
- **Branding:** "MTA Doctor Portal" (`app/layout.tsx` metadata).

### Key dependencies (`apps/doctor/package.json`)

| Dependency | Why it matters |
|---|---|
| `next` ^15.3.3, `react`/`react-dom` ^19.1 | App Router, Server Components, Server Actions, route handlers. |
| `@iha/db` | Supabase server/browser clients, the shared auth middleware, and the data-access modules (`case-assignments`, `cases`, `consultations`, `treatment-plans`, `doctor-fees`, `provider-messages`, `notifications`, `audit`, `storage`, `specialties`, `patients`, `treatments`, `auth-lookup`, `account-lookup`). |
| `@iha/ui` | Shared design system: `AuthShell`, auth forms, `WizardLayout`/`AccountStep`/`AgreementStep`, `CaseAssignmentsTable`, `CaseRowStatusBadge`, `ProviderMessageThread`, `NotificationsChannelProvider`/`useNotificationsChannel`, `SecurityTab`, `DocumentUploadField`, form primitives. |
| `@iha/validations` | Zod schemas and the `Result<T>` type (`auth`, `provider-registration`, `phone`, `treatmentPlanDraftSchema`/`treatmentPlanSubmitSchema`, `messageBodySchema`, `additionalInfoRequestSchema`, `declineReasonSchema`). |
| `@iha/logger` | Structured server logging (`createLogger('doctor:…')`). |
| `@supabase/ssr` | Cookie-based Supabase sessions. Used through `@iha/db`. |
| `stripe` ^22 | Server-side PaymentIntents and webhook signature verification for doctor fees (`lib/stripe.ts`). |
| `@stripe/stripe-js`, `@stripe/react-stripe-js` | Client-side Payment Element for the registration and annual fees. |
| `@tanstack/react-query` | Fetches and caches the Stripe client secret (`/api/fees/create-intent`). |
| `nuqs` | URL-synced tab state on Account & Settings (`?tab=`). |
| `react-hook-form`, `@hookform/resolvers`, `zod` | All forms: registration, resubmission, account settings, treatment plan. |
| `pdf-lib` | Server-side PDF invoice generation (`/api/fees/invoice`). |
| `react-phone-number-input`, `libphonenumber-js` | Phone inputs. The CSS is imported in `globals.css`; validation goes through `@iha/validations/phone`. |
| `sonner` | Toast notifications. |
| `lucide-react` | Icons. |
| `clsx`, `tailwind-merge` | Class utilities (mostly via `cn` from `@iha/ui`). |
| Dev: `@iha/config`, `tailwindcss` 3, `postcss`, `autoprefixer`, `eslint` 9, `typescript` 5.8 | Shared Tailwind preset, ESLint and tsconfig base. |

---

## 2. Configuration

### 2.1 `package.json` scripts

| Script | Command |
|---|---|
| `dev` | `next dev --port 3004` |
| `build` | `next build` |
| `start` | `next start --port 3004` |
| `lint` | `next lint` |

### 2.2 `next.config.ts`

- `output: 'standalone'` produces a self-contained server build for deployment.
- `transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations']` compiles the TypeScript workspace packages.
- `images.remotePatterns` allows `next/image` to load only from `https://<supabase-host>/storage/v1/object/public/**`. The host comes from `NEXT_PUBLIC_SUPABASE_URL`; the list is empty if that variable is unset. Patient avatars on the case detail page rely on this.

### 2.3 `middleware.ts`

The middleware is a thin wrapper around `handleAuthMiddleware` from `@iha/db/middleware` (`packages/db/src/middleware.ts`), called with:

```ts
publicPrefixes: ['/login', '/forgot-password', '/reset-password', '/verify', '/register', '/auth', '/api'],
postAuthPath: '/dashboard',
requireEmailVerification: true,
```

**Matcher:** every path except `_next/static`, `_next/image`, `favicon.ico` and image files (`svg|png|jpg|jpeg|gif|webp`).

**Rules, in order** (from the shared implementation):

1. Build a Supabase SSR client on the request cookies and call `auth.getUser()`. Any throw, such as a stale refresh token, is treated as "no user".
2. `checkPatientSoftDelete` is **not** set for this app, so no `patients` lookup happens.
3. `/` redirects to `/dashboard` if signed in, otherwise to `/login`.
4. A path is **public** if it equals one of the prefixes or starts with `prefix + '/'`. This means `/registration-fee` is **not** public: `/register` matches `/register` and `/register/...` only. `/pending-approval` is also protected.
5. **Not signed in and on a protected path:** redirect to `/login`.
6. **Signed in, email not confirmed, and on a protected path:** redirect to `/verify?email=<email>`.
7. **Signed in and on `/login`, `/verify` or `/forgot-password`:** redirect to `/dashboard`. `/register` and `/reset-password` are deliberately excluded.
8. Otherwise, continue, with refreshed auth cookies written onto the response.

**What the middleware does *not* do:** it never checks the role, the approval status or the registration fee. Those gates live in server code:

| Gate | Where it is enforced | Behaviour |
|---|---|---|
| Role must be `doctor` | `app/(dashboard)/layout.tsx`, `app/registration-fee/page.tsx`, `app/auth/callback/route.ts`, `postAuthRedirect` and `signInWithEmail` in `lib/actions/auth.ts` | Hospital accounts are signed out **before** being redirected to `/login`. Without the sign-out, middleware rule 7 would bounce them back to `/dashboard`, creating an infinite loop. `signInWithEmail` also uses `findOtherRoleAccount` to reject patient and lawyer accounts with the generic "Invalid email or password" message. |
| Account exists | Same places, plus every dashboard page | No `doctors` or `hospitals` row sends the user to `/register`. |
| Approval | `(dashboard)/layout.tsx`, `/registration-fee`, `postAuthRedirect` | A `status` other than `approved` sends the user to `/pending-approval`. |
| Registration fee | `(dashboard)/layout.tsx`, `postAuthRedirect` | `registration_fee_paid_at IS NULL` sends the user to `/registration-fee`. `/registration-fee` itself redirects to `/dashboard` once the fee is paid. |
| Annual fee | `components/layout/dashboard-shell.tsx` | **Soft only.** An amber banner appears from 14 days before `annual_fee_next_due_at` and stays while the fee is overdue. It never blocks access. |

The canonical "where should this user land" function is `postAuthRedirect(userId)`. Its order is: `/register`, then sign-out plus `/login` for a non-doctor, then `/pending-approval`, then `/registration-fee`, then `/dashboard`.

### 2.4 Styling, linting and TypeScript

- `tailwind.config.ts` uses the shared preset `@iha/config/tailwind.preset`. Its content globs cover `app/**`, `components/**` and `../../packages/ui/src/**`.
- `postcss.config.mjs` loads `tailwindcss` and `autoprefixer`.
- `app/globals.css` imports `react-phone-number-input/style.css`, defines the Tailwind layers, the `nav-progress` keyframes and `.animate-nav-progress` (used by `NavigationProgressProvider`), and the shadcn-style HSL CSS variables (light theme only).
- `eslint.config.mjs` re-exports `@iha/config/eslint-next`.
- `tsconfig.json` extends `@iha/config/tsconfig.base.json`, adds the Next plugin and the path alias `@/*` → `./*`.

### 2.5 Environment variables (`.env.example`, names only)

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase clients, middleware, `next.config.ts` image host |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase clients, middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceClient()` in the Stripe webhook |
| `NEXT_PUBLIC_APP_URL` | OAuth, password-reset and sign-up redirect URLs; origin in `/auth/callback`. Defaults to `http://localhost:3004`. |
| `NEXT_PUBLIC_NOTIFICATION_APP_URL` | Consumed by shared notification code in `@iha/db`/`@iha/notifications`, which links to the patient app. Not referenced directly in app code. |
| `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` | Email fan-out via `@iha/notifications`, e.g. `dispatchCaseStatusAlerts` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS fan-out via `@iha/notifications` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `loadStripe` in the registration-fee and billing UIs |
| `STRIPE_SECRET_KEY` | `lib/stripe.ts` (lazy client) |
| `STRIPE_WEBHOOK_SECRET` | `app/api/fees/webhook/route.ts` |

---

## 3. Routing map

Under "Auth": **Public** means middleware lets anyone in. **Session** means a signed-in user with a verified email. **Doctor + approved + fee paid** means the full `(dashboard)` layout gate applies.

| URL | File | Purpose | Auth | Main data loaded |
|---|---|---|---|---|
| `/` | (middleware) | Redirect only | — | Goes to `/dashboard` or `/login` |
| `/login` | `app/(auth)/login/page.tsx` | Email/password and OAuth sign-in | Public; signed-in users are bounced to `/dashboard` | — |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request a password-reset email | Public; signed-in users are bounced | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | Set a new password (recovery session) | Public | — |
| `/verify?email=` | `app/(auth)/verify/page.tsx` | Enter the email OTP | Public; redirects to `/register` if `email` is missing | — |
| `/register` | `app/register/page.tsx` | 7-step registration wizard | Public; if signed in **and** an account exists, redirects via `postAuthRedirect` | `fetchActiveSpecialties`, `fetchHospitalOptions`, `fetchFeeSettings` (registration fee, fallback 5000 AUD) |
| `/auth/callback` | `app/auth/callback/route.ts` (GET) | OAuth, email-link and password-recovery code exchange | Public | `exchangeCodeForSession`, `getAccountForUser` |
| `/pending-approval` | `app/pending-approval/page.tsx` | Under-review, rejected or more-info screen, with resubmit form | Session; redirects to `/register` if no account and `/dashboard` if approved | `getAccountForUser`. If rejected or more info requested: `fetchDoctorRegistrationDetails`, `fetchActiveSpecialties`, `fetchHospitalOptions` |
| `/registration-fee` | `app/registration-fee/page.tsx` | Pay the one-time registration fee | Session, doctor, approved, fee **unpaid** | `getAccountForUser`, `fetchFeeSettings` |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Home: quick actions, stats, upcoming consultations and treatments, recent cases | Doctor + approved + fee paid | `fetchAssignedCasesStats`, `fetchAssignmentsForDoctor`, `fetchConsultationRequestsForDoctor`, `fetchConfirmedTreatmentsForDoctor` |
| `/cases?status=&range=` | `app/(dashboard)/cases/page.tsx` | "My Cases" list with status tabs and a date-range filter | Doctor + approved + fee paid | `fetchAssignmentsForDoctor`, `fetchTreatmentPlanStatusesForDoctor` |
| `/cases/[caseId]` | `app/(dashboard)/cases/[caseId]/page.tsx` | Case detail: patient info, summary, medical history, documents, consultations, actions | Doctor + approved + fee paid; 404 if this doctor has no assignment | `fetchAssignmentForCase`, `fetchCaseById`, `fetchDocumentsByCase`, `fetchTreatmentPlanForCase`, `fetchConsultationRequestsForCase`, `fetchPatientForCase` |
| `/cases/[caseId]/treatment-plan` | `app/(dashboard)/cases/[caseId]/treatment-plan/page.tsx` | Treatment-plan builder, read-only once submitted | Doctor + approved + fee paid; 404 unless the assignment status is `accepted` | `fetchAssignmentForCase`, `fetchCaseById`, `fetchTreatmentPlanForCase`, `fetchHospitalOptionsForDoctor` |
| `/consultations?status=` | `app/(dashboard)/consultations/page.tsx` | Consultation request list with status tabs | Doctor + approved + fee paid | `fetchConsultationRequestsForDoctor` |
| `/consultations/[requestId]` | `app/(dashboard)/consultations/[requestId]/page.tsx` | Propose or update slots, see the selected slot, join Zoom, cancel | Doctor + approved + fee paid; ownership enforced by RLS (404) | `fetchConsultationRequestById` |
| `/messages` | `app/(dashboard)/messages/page.tsx` | Single thread with MTA Admin | Doctor + approved + fee paid | `fetchProviderThread`, `fetchProviderMessages` |
| `/notifications` | `app/(dashboard)/notifications/page.tsx` | Full notification history | Doctor + approved + fee paid | `fetchNotificationsForUser` |
| `/account-settings?tab=` | `app/(dashboard)/account-settings/page.tsx` | Profile, availability, billing, invoices, security, notification settings | Doctor + approved + fee paid | `fetchDoctorAccountSettings`, `fetchActiveSpecialties`, `fetchHospitalOptions`, `fetchFeeSettings` (annual fee, fallback 2000 AUD), `fetchDoctorFeePayments` |
| `GET /api/documents/[documentId]` | route handler | Stream a case document | Self-checked (doctor with an invited or accepted assignment) | See section 4 |
| `POST /api/fees/create-intent` | route handler | Create or reuse a Stripe PaymentIntent for a fee | Self-checked session | See section 4 |
| `GET /api/fees/invoice?paymentId=` | route handler | PDF invoice for a completed fee | Self-checked doctor | See section 4 |
| `POST /api/fees/webhook` | route handler | Stripe webhook for doctor fees | Stripe signature | See section 4 |

---

## 4. File reference

### 4.1 Root configuration

| File | Description |
|---|---|
| `apps/doctor/package.json` | Package `doctor`: scripts on port 3004 and the dependencies listed in §1. |
| `apps/doctor/.env.example` | Env var template (§2.5). |
| `apps/doctor/next.config.ts` | Standalone output, transpiles `@iha/*`, Supabase public-storage image host (§2.2). |
| `apps/doctor/middleware.ts` | Calls `handleAuthMiddleware` with the doctor app's public prefixes and email verification turned on (§2.3). |
| `apps/doctor/tailwind.config.ts` | Shared Tailwind preset plus content globs, including `packages/ui`. |
| `apps/doctor/postcss.config.mjs` | Tailwind and autoprefixer. |
| `apps/doctor/eslint.config.mjs` | Re-exports `@iha/config/eslint-next`. |
| `apps/doctor/tsconfig.json` | Extends the shared base; `@/*` alias. |

### 4.2 `app/` — root

| File | Description |
|---|---|
| `apps/doctor/app/layout.tsx` | Root layout. Loads the Geist Sans and Mono fonts, sets the title "MTA Doctor Portal" and wraps children in `<Providers>`. |
| `apps/doctor/app/providers.tsx` | Client providers: TanStack `QueryClientProvider` (60 s `staleTime`), `NuqsAdapter`, and the Sonner `<Toaster>` (top-center, rich colors). |
| `apps/doctor/app/error.tsx` | Global error boundary. Logs `[doctor:GlobalError]` with the digest and shows a "Try again" button that calls `reset`. |
| `apps/doctor/app/globals.css` | Tailwind layers, phone-input CSS, the nav-progress animation and theme CSS variables. |
| `apps/doctor/app/icon.png` | App favicon/icon, served by the Next.js file convention. |

### 4.3 `app/(auth)/` — unauthenticated pages

| File | Description |
|---|---|
| `apps/doctor/app/(auth)/layout.tsx` | Wraps the auth pages in `AuthShell` from `@iha/ui/auth`, a split layout that uses `/auth-illustration.png`. |
| `apps/doctor/app/(auth)/error.tsx` | Error boundary for the auth group (`[doctor:AuthError]`). |
| `apps/doctor/app/(auth)/login/page.tsx` | Renders `LoginPageClient`. |
| `apps/doctor/app/(auth)/forgot-password/page.tsx` | Renders `ForgotPasswordPageClient`. |
| `apps/doctor/app/(auth)/reset-password/page.tsx` | Renders `ResetPasswordPageClient`. |
| `apps/doctor/app/(auth)/verify/page.tsx` | Async server page. Reads `searchParams.email`, redirects to `/register` if it is missing, and otherwise renders `VerifyOtpPageClient` with the decoded email. |

### 4.4 `app/auth/callback/route.ts`

| File | Description |
|---|---|
| `apps/doctor/app/auth/callback/route.ts` | **GET.** Exchanges `?code` for a session; a missing or failed code goes to `/login?error=auth_callback`. Backfills `user_metadata.full_name` from OAuth identity data. An unconfirmed email goes to `/verify?email=`. An explicit `?next=` (used by password reset: `next=/reset-password`) is honoured as-is. Otherwise it calls `getAccountForUser`: a non-doctor is signed out and sent to `/login`; no account goes to `/register`; approved goes to `/dashboard`; anything else goes to `/pending-approval`. The origin is `NEXT_PUBLIC_APP_URL` or the request origin. **Note:** unlike `postAuthRedirect`, this route sends approved-but-unpaid doctors to `/dashboard`. The dashboard layout then redirects them on to `/registration-fee`, so the result is correct, just one extra hop. |

### 4.5 `app/register`, `app/pending-approval`, `app/registration-fee`

| File | Description |
|---|---|
| `apps/doctor/app/register/page.tsx` | Server page. If the user is signed in and already has an account, it redirects via `postAuthRedirect`. It loads specialties, the hospital catalog and fee settings, then renders `DoctorRegistrationWizard` with `initialStep = user ? 3 : 1`: a signed-in user without a row resumes at Basic Information. |
| `apps/doctor/app/pending-approval/layout.tsx` | `AuthShell` with a wider `max-w-2xl` content area. |
| `apps/doctor/app/pending-approval/page.tsx` | Server page. Redirects to `/login` if signed out, `/register` if there is no account, and `/dashboard` if approved. Shows status copy for `pending`, `more_info_requested` or `rejected`, plus the admin note (`rejection_reason` or `more_info_message`). For rejected or more-info accounts it prefetches the existing registration (`fetchDoctorRegistrationDetails`) and renders `DoctorResubmitForm`. Includes a log-out form that calls the `signOut` server action. **Note:** it does not sign out hospital-role accounts, unlike the other gates. |
| `apps/doctor/app/registration-fee/layout.tsx` | `AuthShell` with `max-w-2xl`. |
| `apps/doctor/app/registration-fee/page.tsx` | Server page. Requires a doctor who is approved and has not yet paid; otherwise it redirects to `/login`, `/register`, `/pending-approval` or `/dashboard`, and signs out non-doctors. Loads `fetchFeeSettings` and shows a fallback message if that fails. Renders `RegistrationFeePaymentClient` with the amount, Stripe's `?redirect_status` and a bank reference `DOC-REG-<first 8 of doctor id>`. |

### 4.6 `app/(dashboard)/` — authenticated portal

| File | Description |
|---|---|
| `apps/doctor/app/(dashboard)/layout.tsx` | **The main gate** (§2.3): user, then confirmed email, then account, then doctor role (else sign out), then `approved`, then `registrationFeePaidAt`. It loads the provider thread and its unread count (`fetchProviderThread`, `fetchUnreadProviderMessageCount`) and the notifications and unread count (`fetchNotificationsForUser`, `fetchUnreadNotificationCount`). It wraps everything in `NavigationProgressProvider` and `DashboardShell`, which receives the 5 most recent notifications. |
| `apps/doctor/app/(dashboard)/error.tsx` | Error boundary for the dashboard group (`[doctor:DashboardError]`). |
| `apps/doctor/app/(dashboard)/dashboard/page.tsx` | Dashboard home. Three quick-action cards (Cases, Consultations, Chat with Admin). Four `StatCard`s from `fetchAssignedCasesStats`: assigned, pending review, plans created, completed. **Upcoming Consultations:** `scheduled` requests whose selected slot is in the future, top 5, shown in Sydney time. **Upcoming Treatments:** `fetchConfirmedTreatmentsForDoctor` (the `treatment_options` table) with a start date, sorted, top 5. **Recent Cases:** the first 5 assignments, with `CaseRowStatusBadge`. |
| `apps/doctor/app/(dashboard)/dashboard/loading.tsx` | Skeleton for the dashboard. |
| `apps/doctor/app/(dashboard)/cases/page.tsx` | "My Cases". Merges `fetchAssignmentsForDoctor` with `fetchTreatmentPlanStatusesForDoctor` (plan status per case). Tabs: All, New (assignment `invited`), Under Review (`accepted` and the case is `doctor_assigned` or `evaluation`), Plan Sent (`treatment_plan`), Plan Confirmed (`payment_confirmed`, `visa_documents_submitted`, `visa_processing`, `travel_ready`), Completed, and Declined. Declined covers assignments that are declined, withdrawn or cancelled, a `visa_rejected` case, or a plan that is `rejected_by_iha`. The date-range filter (all, 7, 30, 90 days) applies to `cases.created_at`. Renders `CaseTabs`, `CaseAssignmentsTable` and `CaseDateFilter` from `@iha/ui`. Hospital accounts are redirected to `/case-management`, a legacy path that does not exist in this app. |
| `apps/doctor/app/(dashboard)/cases/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/cases/[caseId]/page.tsx` | Case detail. Returns 404 if the user is not a doctor or there is no assignment or case. Shows the reference number, status badge, patient info (avatar, DOB, gender, country), case summary (specialty, description), **medical history** (flagged SENSITIVE in code), and the uploaded documents (`CaseDocumentsList`, served via `/api/documents/...`). `RequestAdditionalInfoDialog` appears only when the assignment is `accepted` and the case is `evaluation`. Includes links to consultation requests, `CaseAssignmentActions` (accept or decline) and `CaseWorkflowActions` (only when the assignment is `accepted`). |
| `apps/doctor/app/(dashboard)/cases/[caseId]/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/cases/[caseId]/treatment-plan/page.tsx` | Returns 404 unless the user is a doctor with an `accepted` assignment. Loads the existing plan (`fetchTreatmentPlanForCase`) and the doctor's **approved affiliated hospitals** with room types (`fetchHospitalOptionsForDoctor`), then renders `TreatmentPlanForm`. |
| `apps/doctor/app/(dashboard)/cases/[caseId]/treatment-plan/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/consultations/page.tsx` | Consultation list. Tabs: All, Awaiting Slots (`requested`), Awaiting Patient Confirmation (`slots_proposed` or `slot_selected`), Scheduled, Cancelled. Shows a fetch error inline. Renders `ConsultationsTable`. |
| `apps/doctor/app/(dashboard)/consultations/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/consultations/[requestId]/page.tsx` | Consultation detail. RLS scopes `fetchConsultationRequestById` to the caller, which gives a 404 for other doctors' requests. Lists the proposed slots in Sydney time and highlights the patient's pick. `ProposeSlotsForm` appears when the status is `requested` or `slots_proposed` (the latter is a re-propose). For `slot_selected` it shows an "awaiting payment" note. For `scheduled` it shows the meeting time and `JoinZoomButton`, or "Zoom link not yet generated". For `cancelled` it shows the reason. `CancelConsultationDialog` is available unless the request is `cancelled` or `scheduled`. |
| `apps/doctor/app/(dashboard)/consultations/[requestId]/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/messages/page.tsx` | Loads the provider thread and its messages and renders `ProviderMessageThread` from `@iha/ui`, wired to the `sendProviderMessageAction`, `markProviderMessagesReadAction` and `requestProviderThreadReopenAction` server actions. Renders nothing if no thread exists. |
| `apps/doctor/app/(dashboard)/messages/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/notifications/page.tsx` | Loads all notifications for the user and renders `NotificationsList`. |
| `apps/doctor/app/(dashboard)/notifications/loading.tsx` | Skeleton. |
| `apps/doctor/app/(dashboard)/account-settings/page.tsx` | Loads the doctor's settings, specialties, hospital catalog, fee settings and fee-payment history in parallel, then renders `AccountSettingsClient`. Redirects to `/register` if there is no doctor row. |
| `apps/doctor/app/(dashboard)/account-settings/loading.tsx` | Skeleton. |

All `loading.tsx` files are presentational skeletons built from `Skeleton`, `Card`, `CardHeader` and `CardContent` in `@iha/ui`.

### 4.7 `app/api/` — route handlers

| File | Description |
|---|---|
| `apps/doctor/app/api/documents/[documentId]/route.ts` | **GET** `/api/documents/:documentId[?download=1]`. Authenticates the user (401), then resolves their `doctors.id` (403 if there is none). Reads the `case_documents` row and returns 404 unless a `doctor_case_assignments` row exists for this doctor and case with status `invited` or `accepted`. Creates a 60-second signed URL (`createCaseDocumentSignedUrl`, `case-documents` bucket), fetches the file and **streams it back** with the stored `Content-Type`, `Content-Disposition` (inline, or attachment when `download=1`) and `Cache-Control: private, no-store`. The point is that the storage path, which contains the raw patient id, is never exposed to the browser. Errors: 500 if signing fails, 502 if the upstream fetch fails. |
| `apps/doctor/app/api/fees/create-intent/route.ts` | **POST**, body `{ feeType: 'registration' \| 'annual' }`. Requires a session (401) and a valid `feeType` (400). Calls `getOrCreatePendingFeePayment(feeType)`, i.e. the RPC `create_doctor_fee_payment`. The RPC checks eligibility (approved, not already paid, due date reached) and takes the amount from `platform_fee_settings` on the server. If the pending row already has a `stripe_payment_intent_id`, the intent is retrieved and reused; an already-succeeded intent returns 400. Otherwise a new AUD PaymentIntent is created with metadata `doctor_id`, `fee_type` and `doctor_fee_payment_id`, and claimed via the RPC `set_doctor_fee_payment_stripe_intent`. If another request won that race, the new intent is cancelled and the winning one is used. Writes the audit event `fee.intent_created`. **Response:** `{ clientSecret, amount, feeType }`. |
| `apps/doctor/app/api/fees/invoice/route.ts` | **GET** `?paymentId=&download=`. Requires a session and a `doctors` row. Loads `doctor_fee_payments` with that id, owned by this doctor and `status='completed'` (404 otherwise). Builds an A4 PDF with `pdf-lib`: logo from `public/logo.png`, falling back to the text "Medical Tourism Australia"; invoice number `#<first 8 of id>`; date; "Paid" status; total; billed-to name and email; a line item (Registration Fee or Annual Renewal Fee, billing period or "One-time"); totals; and a footer with the Stripe reference. Writes the audit event `fee.invoice_downloaded`. Responds with `application/pdf`, inline or attachment. |
| `apps/doctor/app/api/fees/webhook/route.ts` | **POST**, the Stripe webhook. Verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET` (500 if unset, 400 if invalid). Uses the **service-role** client. **`payment_intent.succeeded`:** updates `doctor_fee_payments` by `stripe_payment_intent_id` to `status='completed'` with `gateway_reference` and `paid_at`. For a **registration** fee it sets `doctors.registration_fee_paid_at = now` and `annual_fee_next_due_at = today + 1 year`, which unlocks the dashboard. For an **annual** fee it sets `annual_fee_next_due_at = (current due date, or today if none) + 1 year`, keeping the anniversary, and clears `annual_fee_reminder_sent_for`. It then inserts a `notifications` row (`registration_fee_paid` or `annual_fee_paid`) and an `audit_logs` row (`fee.payment_completed`). **`payment_intent.payment_failed`:** sets the row to `status='failed'`. Always returns `{ received: true }`, including when no row matches (that case is logged). Uses hand-typed client shims to work around `never` types in the generated Supabase types. |

### 4.8 `components/`

#### `components/auth/`

| File | Description |
|---|---|
| `apps/doctor/components/auth/login-page-client.tsx` | `LoginPageClient` wraps `LoginForm` from `@iha/ui/auth`. Calls `signInWithEmail`, shows a toast if it is redirecting to `/verify` (unconfirmed email), then `router.push(redirectTo)` and refreshes. OAuth goes through the `signInWithOAuth` server action. |
| `apps/doctor/components/auth/forgot-password-page-client.tsx` | `ForgotPasswordPageClient` wraps `ForgotPasswordForm` and calls `requestPasswordReset`. |
| `apps/doctor/components/auth/reset-password-page-client.tsx` | `ResetPasswordPageClient` wraps `ResetPasswordForm` and calls `resetPassword`, then routes to `/login`. "Back to login" calls `signOut`. |
| `apps/doctor/components/auth/verify-otp-page-client.tsx` | `VerifyOtpPageClient` wraps `VerifyOtpForm`, calling `verifyOtp` (then routes to `redirectTo`) and `resendVerificationOtp`, which reports a `rateLimited` flag. |

#### `components/registration/`

| File | Description |
|---|---|
| `apps/doctor/components/registration/doctor-registration-wizard.tsx` | `DoctorRegistrationWizard`, a 7-step wizard in `WizardLayout`: 1 Account (`AccountStep`, then `signUpForRegistration`), 2 Verify Email, 3 Basic Information, 4 Professional Details, 5 Hospital Details, 6 Verification & Setup (documents), 7 Agreement (`AgreementStep` plus `RegistrationFeeAgreementNotice`). Step, draft, userId and email are persisted to **sessionStorage** (`doctor-draft:doctor-registration-wizard`) and restored before any step mounts. On final submit, the medical licence and degree certificate are merged into `certificates`, `submitDoctorRegistration` is called, the draft is cleared, and the user is routed to `redirectTo` (normally `/pending-approval`). The sidebar shows `RegistrationFeeSidebarNotice`. |
| `apps/doctor/components/registration/verify-email-step.tsx` | `VerifyEmailStep`, the in-wizard OTP step (`VerifyOtpForm` without the logo). It establishes the real session needed for uploads and the `register_doctor` RPC, ignores `redirectTo`, and calls `onNext`. |
| `apps/doctor/components/registration/doctor-basic-info-step.tsx` | `DoctorBasicInfoStep`: full name, phone (`PhoneInput`), and an optional profile photo uploaded to the `registration-documents` bucket under the `userId/` prefix. Validated with `doctorBasicInfoStepSchema`. |
| `apps/doctor/components/registration/doctor-professional-step.tsx` | `DoctorProfessionalStep`: specialties (`MultiSelectDropdown` from the `specialties` table), years of experience, qualifications (`TagInput`, stored as a comma-joined string), AHPRA licence number, bio, and languages (fixed list: English, Mandarin). Validated with `doctorProfessionalStepSchema`. |
| `apps/doctor/components/registration/doctor-hospital-step.tsx` | `DoctorHospitalStep`: hospital affiliations (`MultiSelectChecklist` over the whole catalog; may be empty), department, role (consultant or surgeon, as toggle buttons), and working days (Mon–Sun toggles). Validated with `doctorHospitalStepSchema`. |
| `apps/doctor/components/registration/doctor-documents-step.tsx` | `DoctorDocumentsStep`: required uploads for the medical licence (category `medical_license`) and degree certificate (`degree_certificate`) to `registration-documents`. Validated with `doctorDocumentsStepSchema`. |
| `apps/doctor/components/registration/doctor-resubmit-form.tsx` | `DoctorResubmitForm`, a single-page form with all registration fields, prefilled from `fetchDoctorRegistrationDetails`, plus a free multi-file `certificates` upload. Calls `resubmitDoctorRegistration(doctorId, values)`, then shows a toast and refreshes. A code comment calls it a stand-in for a future full profile editor ("Module 03"). |
| `apps/doctor/components/registration/fee-notice.tsx` | `RegistrationFeeSidebarNotice` and `RegistrationFeeAgreementNotice`: static notices that the AUD registration fee is charged only after approval. |

#### `components/registration-fee/` and `components/payments/`

| File | Description |
|---|---|
| `apps/doctor/components/registration-fee/registration-fee-payment-client.tsx` | `RegistrationFeePaymentClient`. Unless `redirect_status=succeeded`, a `useQuery` (`['doctor-registration-fee-intent']`, no retry, infinite stale time) POSTs `/api/fees/create-intent` with `{feeType:'registration'}` and renders Stripe `Elements` plus a `PaymentElement`. `confirmPayment` returns to `/registration-fee`. On `succeeded` it shows "Payment received" and a "Continue to dashboard" button. `failed` shows a retry banner. Always renders `BankTransferPanel`. |
| `apps/doctor/components/payments/bank-transfer-panel.tsx` | `BankTransferPanel`: a collapsible panel with static bank-transfer and cheque instructions (bank, account name, BSB, account number, reference, amount). Informational only; Admin reconciles these payments by hand. |

#### `components/layout/`

| File | Description |
|---|---|
| `apps/doctor/components/layout/dashboard-shell.tsx` | `DashboardShell`, the client portal frame. It has a collapsible desktop sidebar and a mobile overlay with nav items (Dashboard, My Cases, Consultations, Messages with an unread badge, Account & Settings), each carrying a `LinkProgressReporter`. The header holds `NotificationBell`, an avatar initial with the name and role, and a sign-out button behind a confirmation modal (`signOut` server action). It shows the **annual-fee banner** (14-day window, session-dismissible, hidden on `/account-settings`, links to `?tab=billing`) and forces scroll-to-top on route change. Everything is wrapped in `NotificationsChannelProvider` (Supabase realtime on `notifications`). |

#### `components/notifications/`

| File | Description |
|---|---|
| `apps/doctor/components/notifications/notification-bell.tsx` | `NotificationBell`. On mobile it is a link to `/notifications`; on desktop it is a dropdown of the latest 5 with "Mark all as read" and "View all". It subscribes to `useNotificationsChannel` for realtime inserts, shows a custom Sonner toast with a "View" link to `/cases/:case_id`, and marks items read optimistically through the `markNotificationAsRead` and `markAllNotificationsAsRead` actions. |
| `apps/doctor/components/notifications/notifications-list.tsx` | `NotificationsList`: the full list, with realtime prepend, per-item read with navigation to the case, and "Mark all as read". |

#### `components/cases/`

| File | Description |
|---|---|
| `apps/doctor/components/cases/case-assignment-actions.tsx` | `CaseAssignmentActions`. Only for an `invited` assignment: an Accept button and a Decline dialog with an optional reason (max 500 characters). Both call `respondToCaseAssignmentAction`. |
| `apps/doctor/components/cases/case-workflow-actions.tsx` | `CaseWorkflowActions`, the per-doctor workflow buttons. **Start Evaluation** appears when this doctor's `evaluation_started_at` is null and the case is `doctor_assigned` or `evaluation`; this is gated per assignment so several invited doctors can evaluate in parallel. **Build Treatment Plan**, or **Treatment Plan Sent — View**, appears while the case is `evaluation`. **View Treatment Plan** appears once a plan has been submitted. **Mark as Completed** has a confirmation dialog and appears only when the case is `payment_confirmed`, `visa_processing` or `travel_ready` **and** the plan's `treatment_end_date` is in the past. |
| `apps/doctor/components/cases/request-additional-info-dialog.tsx` | `RequestAdditionalInfoDialog`: document checkboxes (Lab Report, MRI/CT, X-Ray, Prescription, Medical History, Other) plus an optional message. Needs at least one document or a message of 10 or more characters. Builds a single message and calls `requestAdditionalInfoAction`. |
| `apps/doctor/components/cases/assignment-status-badge.tsx` | `AssignmentStatusBadge`: a coloured pill for assignment statuses. **Unused**: the pages use `CaseRowStatusBadge` from `@iha/ui`. |

#### `components/consultations/`

| File | Description |
|---|---|
| `apps/doctor/components/consultations/consultations-table.tsx` | `ConsultationsTable`: client-side search on patient name or case reference, 15 rows per page with `Pagination`. Columns: patient, case link, procedure (`treatment_option.description` or `procedure_name`), requested date, status badge, View. |
| `apps/doctor/components/consultations/consultation-status-badge.tsx` | `ConsultationStatusBadge` and `getConsultationStatusLabel`. They map `ConsultationStatus` from `@iha/db/consultations-shared` to a colour and label. `getConsultationStatusLabel` is only used internally. |
| `apps/doctor/components/consultations/propose-slots-form.tsx` | `ProposeSlotsForm`: a card wrapping `SlotRowsFields` (1–3 rows; `maxDate` is the treatment start date). Calls `proposeConsultationSlotsAction` and uses "Update Times" wording when re-proposing. |
| `apps/doctor/components/consultations/slot-rows-fields.tsx` | `SlotRowsFields`, `createEmptySlotRow` and the `SlotRow` type: 1–3 rows of date, start time and end time using `DateInput` and `TimeInput`, with add and remove. `min` is today's date in **UTC**. |
| `apps/doctor/components/consultations/cancel-consultation-dialog.tsx` | `CancelConsultationDialog`: requires a reason of at least 5 characters, then calls `cancelConsultationAction`. The patient is notified by email and SMS. |
| `apps/doctor/components/consultations/join-zoom-button.tsx` | `JoinZoomButton`: a live link that opens 15 minutes before the slot and closes at the slot end. It re-checks every 60 s and shows "ended" or "available 15 min before" states, mirroring the patient side. |

#### `components/treatment-plan/`

| File | Description |
|---|---|
| `apps/doctor/components/treatment-plan/treatment-plan-form.tsx` | `TreatmentPlanForm`, the treatment-plan builder. It uses RHF with the **lenient** `treatmentPlanDraftSchema` and collapsible sections: Diagnosis; Treatment/Procedure (type `medication_only`, `surgery` or `therapy`, procedure, description, technique, success rate, expected outcome); Timeline (start and end dates, with a computed duration hint, recovery time and length of stay); Hospital (only affiliated, approved hospitals, with room-category radios from `hospitals.room_types`, department and special requirements); Cost (doctor and hospital fees, itemised costs, notes); Specialists; Doctor Notes (patient instructions, aftercare one-per-line). Unsaved edits are mirrored to sessionStorage (`treatment-plan:<caseId>`). **Save Draft** calls `saveDraftTreatmentPlanAction`. **Submit Plan** needs the "I confirm" checkbox. It validates against the **strict** `treatmentPlanSubmitSchema` and sets field errors manually, which a watcher clears as fields become valid. It then saves the draft, calls `submitTreatmentPlanAction(caseId, planId)` and routes back to the case. Once `plan.status !== 'draft'` the form is read-only with a status-specific banner. |
| `apps/doctor/components/treatment-plan/collapsible-section.tsx` | `CollapsibleSection`: a simple card with an open/close toggle; no Accordion primitive exists in `@iha/ui`. |
| `apps/doctor/components/treatment-plan/cost-items-table.tsx` | `CostItemsTable`: a `useFieldArray` over `cost_items` (label and amount), with quick-add buttons (Surgery Charge, Diagnostics & Lab, Anaesthesia, Medication, Rehabilitation) and a custom item. |
| `apps/doctor/components/treatment-plan/specialists-table.tsx` | `SpecialistsTable`: a `useFieldArray` over `specialists` (type, optional name, `cost_aud`, notes). |
| `apps/doctor/components/treatment-plan/cost-summary-bar.tsx` | `CostSummaryBar`: a sticky running total of doctor fees, hospital fees, itemised costs and specialists. This is the doctor-facing figure only; Admin adds commission later. |

#### `components/account-settings/`

| File | Description |
|---|---|
| `apps/doctor/components/account-settings/account-settings-client.tsx` | `AccountSettingsClient`: tab shell with tabs Profile, Availability, Billing, Invoices, Security and Notifications. The tab is synced to `?tab=` via `nuqs` (shallow, no scroll). Sidebar on desktop, dropdown on mobile. Passes the annual-fee bank reference `DOC-ANN-<first 8 of doctor id>`. Security uses the shared `SecurityTab` from `@iha/ui`. |
| `apps/doctor/components/account-settings/personal-details-card.tsx` | `PersonalDetailsCard`: view and edit name, phone, DOB and gender; email is read-only. To change the avatar, the browser client uploads to the `avatars` bucket at `<userId>/avatar.<ext>` with upsert, and then `updateDoctorAvatarUrl(ext)` verifies the file and persists it. Saving calls `updateDoctorProfile`. |
| `apps/doctor/components/account-settings/professional-details-card.tsx` | `ProfessionalDetailsCard`: view and edit specialties, qualifications, experience, licence, department, role, languages, hospital affiliations and bio. Calls `updateDoctorProfessionalDetails`. |
| `apps/doctor/components/account-settings/availability-tab.tsx` | `AvailabilityTab`: a 7-day schedule with on/off toggles and 30-minute start and end selects. Calls `updateDoctorAvailability`. |
| `apps/doctor/components/account-settings/billing-tab.tsx` | `BillingTab`: shows the annual fee and its next-due date. When the fee is due, a "Pay now" button lazily POSTs `/api/fees/create-intent` with `{feeType:'annual'}` and mounts the Stripe `PaymentElement`, returning to `/account-settings?tab=billing`. Shows a success banner on `redirect_status=succeeded` and a `BankTransferPanel` while the fee is due. |
| `apps/doctor/components/account-settings/invoices-tab.tsx` | `InvoicesTab`: table of `doctor_fee_payments` (date, type, amount, status). Completed rows have **View**, which fetches the PDF as a blob and opens an object URL, and **Download**, which uses `?download=1`. |
| `apps/doctor/components/account-settings/notifications-tab.tsx` | `NotificationsTab`: email and SMS toggles that save immediately via `updateDoctorNotificationPreferences` and roll back on error. In-portal notifications are always on. |

### 4.9 `lib/`

#### `lib/actions/` — server actions (`'use server'`)

Every mutating action calls `logAuditEvent` from `@iha/db/audit` (the `audit_logs` table) with `app: 'doctor'`, and maps known RPC error codes to friendly messages.

| File | Exports and behaviour |
|---|---|
| `apps/doctor/lib/actions/auth.ts` | `postAuthRedirect(userId)`, the landing-route resolver (§2.3). `signInWithEmail` runs `loginSchema` and `signInWithPassword`. An `email_not_confirmed` error is returned as a `/verify` redirect. A non-doctor account, including patient or lawyer accounts found via `findOtherRoleAccount`, is signed out and gets the generic invalid-credentials message. Audits `auth.login_failed` and `auth.login_succeeded`. `verifyOtp` calls `auth.verifyOtp({type:'email'})` and returns `postAuthRedirect`. `resendVerificationOtp` calls `auth.resend({type:'signup'})` and surfaces `rateLimited`. `requestPasswordReset` calls `resetPasswordForEmail` with redirect `/auth/callback?next=/reset-password`. `resetPassword` calls `updateUser({password})`, then signs out and returns `/login`. `signInWithOAuth(provider)` redirects to the provider URL. `signOut` writes an audit event, signs out and redirects to `/login`. |
| `apps/doctor/lib/actions/registration.ts` | `signUpForRegistration(values, 'doctor')` validates with `registrationAccountStepSchema` and pre-checks the RPC `email_already_registered` (`checkEmailAlreadyRegistered`), because GoTrue's enumeration protection otherwise fails silently. It then calls `auth.signUp` with `options.data.role='doctor'`, so the patient-creation trigger skips this user. `submitDoctorRegistration(values)` validates with `doctorRegistrationSchema` and re-verifies every uploaded file against Storage metadata (`getStorageObjectMeta` on `registration-documents`: extension, real MIME type, 10 MB limit). It then calls the RPC **`register_doctor`** with the `p_*` fields, including `p_hospital_ids`, `p_working_days` and `p_certificates`, syncs `user_metadata.full_name`, audits `registration.doctor_submitted`, and returns `postAuthRedirect`. `resubmitDoctorRegistration(doctorId, values)` does the same checks and calls the RPC **`resubmit_doctor_registration`**, auditing `registration.resubmitted`. |
| `apps/doctor/lib/actions/cases.ts` | `respondToCaseAssignmentAction(assignmentId, status, caseId, declineReason?)` uses RPC `respond_to_case_assignment` and audits `case_assignment.accepted`, `.declined` or `.withdrawn`. `requestAdditionalInfoAction(caseId, message)` uses RPC `request_case_additional_info`, then `dispatchCaseStatusAlerts(..., 'additional_info_requested')` for email and SMS to the patient. `startCaseEvaluationAction(caseId)` uses RPC `start_case_evaluation`. `markCaseCompletedAction(caseId)` uses RPC `mark_case_completed`, then `dispatchCaseStatusAlerts(..., 'case_status_updated')`. All of them revalidate `/cases`, `/cases/:id` and `/dashboard` as relevant. |
| `apps/doctor/lib/actions/consultations.ts` | `proposeConsultationSlotsAction(requestId, caseId, slots)` validates 1–3 complete slots, none after the treatment start date, each in the future with end after start. It converts Sydney wall-clock times to UTC (`zonedWallTimeToUtcIso`) and calls RPC `propose_consultation_slots`. The patient's in-portal notification comes from a DB trigger; the action dispatches email and SMS with `consultation_status_updated`. `cancelConsultationAction(requestId, caseId, reason)` requires a reason of at least 5 characters and calls RPC `cancel_consultation`, then sends alerts. Audits `consultation.slots_proposed` and `consultation.cancelled`. |
| `apps/doctor/lib/actions/treatment-plans.ts` | `saveDraftTreatmentPlanAction(caseId, values)` validates with `treatmentPlanDraftSchema`, requires the doctor role, trims blank aftercare lines, and calls RPC `save_treatment_plan_draft` via `saveDraftTreatmentPlan`. Returns `{ id }` and audits `treatment_plan.draft_saved`. `submitTreatmentPlanAction(caseId, planId)` calls RPC `submit_treatment_plan` (errors include `missing_required_fields` and `invalid_transition`) and audits `treatment_plan.submitted`. |
| `apps/doctor/lib/actions/messages.ts` | `sendProviderMessageAction(threadId, body)` validates with `messageBodySchema` and inserts into `provider_messages` via `sendProviderMessage(threadId, role, userId, body)`. `markProviderMessagesReadAction(threadId)` marks messages read. `requestProviderThreadReopenAction(threadId, reason)` requests a reopen on `provider_message_threads`. All revalidate `/messages`. |
| `apps/doctor/lib/actions/notifications.ts` | `markNotificationAsRead(id)` and `markAllNotificationsAsRead()` update `notifications` via `@iha/db/notifications` and revalidate `/notifications`. |
| `apps/doctor/lib/actions/account-settings.ts` | `updateDoctorProfile` uses RPC `update_doctor_profile` (name, auth email, phone, DOB, gender). `updateDoctorProfessionalDetails` uses RPC `update_doctor_professional_details`, which includes `p_hospital_ids`. Both RPCs are hand-typed because they are missing from the generated types. `updateDoctorAvatarUrl(ext)` checks the `avatars/<uid>/avatar.<ext>` object's MIME type and 5 MB limit, then writes its public URL to `doctors.photo_url`. `updateDoctorAvailability` writes `availability_schedule` and syncs `working_days` short codes. `updateDoctorNotificationPreferences` writes the `email_` and `sms_notifications_enabled` flags. Each audits `doctor.*` and revalidates `/account-settings`. |

#### `lib/auth/`

| File | Description |
|---|---|
| `apps/doctor/lib/auth/account.ts` | Exports the `Account` union type and `getAccountForUser(userId)`. It looks up `hospitals` by `user_id` first, then `doctors`, and returns the role, id, display name, status, rejection or more-info notes, and for doctors `registrationFeePaidAt` and `annualFeeNextDueAt`. This is the single lookup used by every gate. |
| `apps/doctor/lib/auth/constants.ts` | User-facing auth strings: `INVALID_CREDENTIALS_MESSAGE`, `GENERIC_AUTH_ERROR`, `EMAIL_ALREADY_REGISTERED_MESSAGE`, `VERIFY_EMAIL_MESSAGE` and `EMAIL_NOT_CONFIRMED_MESSAGE`. |

#### `lib/data/` — server-side read helpers

| File | Description |
|---|---|
| `apps/doctor/lib/data/account-settings.ts` | `fetchDoctorAccountSettings(userId)` reads `doctors` and `doctor_hospital_affiliations` and returns the `DoctorAccountSettings` DTO. If `availability_schedule` is empty, it derives a schedule from the registration `working_days` (`deriveAvailabilityFromWorkingDays`, 09:00–17:00). Also exports `FULL_TO_SHORT_DAY`. |
| `apps/doctor/lib/data/hospitals.ts` | Types `HospitalOption`, `HospitalOptionWithRoomTypes` and `HospitalLetterheadInfo`. `fetchHospitalOptions()` returns the full `hospitals` catalog by name. `fetchHospitalOptionsForDoctor(doctorId)` returns affiliated hospitals with `status='approved'` and their `room_types`. `fetchHospitalById` is **unused** in this app; it is a leftover for hospital letterheads. |
| `apps/doctor/lib/data/registration-details.ts` | `fetchDoctorRegistrationDetails(userId)` maps the existing `doctors` row and its affiliations back into `DoctorRegistrationInput` defaults for the resubmit form. `photo_url` is treated as a storage path. |

#### `lib/validations/` — app-local Zod schemas

| File | Description |
|---|---|
| `apps/doctor/lib/validations/doctor-registration.ts` | `doctorRoles` (consultant, surgeon) with labels; `workingDays` (`mon`…`sun`) with labels. Per-step schemas: `doctorBasicInfoStepSchema`, `doctorProfessionalStepSchema` (licence must be an **AHPRA** number matching `^[A-Z]{3}\d{10}$`, upper-cased), `doctorHospitalStepSchema` and `doctorDocumentsStepSchema`. The combined `doctorRegistrationSchema` requires at least one certificate. Exports the `DoctorRegistrationInput` type. |
| `apps/doctor/lib/validations/account-settings.ts` | `languageOptions`, `doctorGenders` with labels, `doctorPersonalDetailsSchema`, `doctorProfessionalDetailsSchema`, `availabilityDays` with labels, `availabilityDaySchema`, `doctorAvailabilitySchema` (exactly 7 entries, at least one enabled) and `doctorNotificationPreferencesSchema`, plus their inferred types. |
| `apps/doctor/lib/validations/file-meta.ts` | `documentCategories`, the `UploadedFileMeta` type and `fileMetaSchema` (fileName, filePath, mimeType, fileSizeBytes, optional category). |

#### Other `lib/` files

| File | Description |
|---|---|
| `apps/doctor/lib/stripe.ts` | `stripe`, a **lazy** `Proxy` around a singleton `Stripe` client. It is built on first property access, so `next build` works without `STRIPE_SECRET_KEY`. |
| `apps/doctor/lib/timezone.ts` | `DOCTOR_TIME_ZONE = 'Australia/Sydney'`. `formatZonedDateTime(startIso, endIso)` returns `{date, range}` in the `en-AU` locale. `zonedWallTimeToUtcIso(date, time)` converts Sydney wall-clock time to UTC using `Intl.DateTimeFormat` offset lookup, so it is DST-correct for that date. |
| `apps/doctor/lib/draft-storage.ts` | `loadDraft`, `saveDraft` and `clearDraft`: JSON in **sessionStorage** under the prefix `doctor-draft:`, SSR-safe. Used by the registration wizard and the treatment-plan form. |

### 4.10 `types/`

| File | Description |
|---|---|
| `apps/doctor/types/index.ts` | App-local string-union types: `CaseStatus`, `AssignmentStatus`, `MessageThreadStatus`, `SenderType`, `HospitalDoctorStatus`, `AccountRole` and `TreatmentPlanStatus`. Note that `CaseStatus` lacks `visa_documents_submitted` and `visa_rejected`, which the cases page compares against as plain strings. |

### 4.11 `public/` (assets)

| File | Description |
|---|---|
| `apps/doctor/public/logo.png` | MTA logo. Used in the `DashboardShell` sidebar and embedded in PDF invoices (read from disk via `process.cwd()/public/logo.png`). |
| `apps/doctor/public/auth-illustration.png` | Illustration used by `AuthShell` / `AuthSidebar` in `@iha/ui` (default `illustrationSrc`). |

---

## 5. Key flows

### 5.1 Registration → pending approval → registration fee → dashboard

1. **Account (step 1).** On `/register`, `AccountStep` submits to `signUpForRegistration` (`lib/actions/registration.ts`). The RPC `email_already_registered` blocks duplicate emails. `auth.signUp` runs with `data.role='doctor'`, so no `patients` row is created. The returned `userId` and `email` are saved to the wizard state and sessionStorage.
2. **Verify email (step 2).** `VerifyEmailStep` calls `verifyOtp`, which creates a real session. That session is required for storage RLS and the `register_doctor` RPC.
3. **Steps 3–6.** Basic info, professional details, hospital details and documents are collected. Files upload straight from the browser to the `registration-documents` bucket under `<userId>/` (`DocumentUploadField`). Each step's values go into `draft`, which is persisted to sessionStorage.
4. **Agreement (step 7).** `RegistrationFeeAgreementNotice` restates the fee, which is charged only after approval. `submitDoctorRegistration` re-verifies every file against Storage metadata, then calls RPC `register_doctor`, which creates the `doctors` row (`status='pending'`), the affiliations and the certificates. It syncs `full_name` into auth metadata and audits the event. `postAuthRedirect` returns `/pending-approval`.
5. **Pending approval.** `app/pending-approval/page.tsx` shows "under review". If Admin sets `rejected` or `more_info_requested`, the page shows the note and `DoctorResubmitForm`, which calls `resubmitDoctorRegistration` and the RPC `resubmit_doctor_registration`.
6. **Approval.** Admin sets `status='approved'` in the admin app. On the next request, `postAuthRedirect` or the dashboard layout sends the doctor to `/registration-fee`.
7. **Registration fee.** `RegistrationFeePaymentClient` POSTs `/api/fees/create-intent` with `{feeType:'registration'}`. The RPC `create_doctor_fee_payment` checks eligibility and creates a pending `doctor_fee_payments` row with the server-side amount. A Stripe PaymentIntent is created and claimed (`set_doctor_fee_payment_stripe_intent`). The doctor pays in the `PaymentElement`, and Stripe redirects back to `/registration-fee?redirect_status=succeeded`.
8. **Webhook.** `POST /api/fees/webhook` handles `payment_intent.succeeded`. The payment becomes `completed`; `doctors.registration_fee_paid_at` is set to now and `annual_fee_next_due_at` to today + 1 year. A `registration_fee_paid` notification and an audit log are written.
9. **Unlocked.** The `(dashboard)/layout.tsx` gate now passes and `/dashboard` renders. Alternatively, the doctor can pay by bank transfer using reference `DOC-REG-XXXXXXXX`; Admin then marks the payment completed by hand.

### 5.2 Login

1. `/login` → `LoginPageClient` → `signInWithEmail`.
2. Wrong credentials show "Invalid email or password". An unconfirmed email redirects to `/verify?email=` with a toast.
3. A valid credential is checked for role. Hospital accounts, and accounts found by `findOtherRoleAccount` (patient or lawyer), are signed out and shown the same generic error.
4. On success, `postAuthRedirect` sends the doctor to `/register`, `/pending-approval`, `/registration-fee` or `/dashboard`.
5. OAuth follows `signInWithOAuth` → provider → `/auth/callback`, which exchanges the code and routes by account (§4.4).
6. Password reset follows `requestPasswordReset` → email → `/auth/callback?next=/reset-password` → `resetPassword` → sign out → `/login`.

### 5.3 Case review (assignment → evaluation → completion)

1. Admin invites the doctor to a case by creating a `doctor_case_assignments` row with status `invited`. The case shows under **New** on `/cases`.
2. On `/cases/[caseId]` the doctor sees the patient profile, the case description, the medical history and the documents. Documents stream through `/api/documents/[id]`, which checks the doctor has an invited or accepted assignment.
3. **Accept or decline** through `CaseAssignmentActions` → `respondToCaseAssignmentAction` → RPC `respond_to_case_assignment`.
4. **Start Evaluation** through `CaseWorkflowActions` → `startCaseEvaluationAction` → RPC `start_case_evaluation`. This sets the doctor's `evaluation_started_at` and moves the case to `evaluation`.
5. While the case is `evaluation`, the doctor can **Request More Documents** (`RequestAdditionalInfoDialog` → RPC `request_case_additional_info`). The patient gets an in-portal notification from the RPC, plus email and SMS via `dispatchCaseStatusAlerts`.
6. After the patient pays and the case reaches `payment_confirmed`, `visa_processing` or `travel_ready`, and once the plan's `treatment_end_date` has passed, the doctor can **Mark as Completed** (RPC `mark_case_completed`), and the patient is alerted.

### 5.4 Treatment plan authoring

1. From the case page, **Build Treatment Plan** opens `/cases/[caseId]/treatment-plan`. The doctor must have an `accepted` assignment.
2. `TreatmentPlanForm` loads any existing DB draft, and overlays unsaved sessionStorage edits from `treatment-plan:<caseId>`.
3. The doctor fills in diagnosis, treatment, timeline, hospital (only their approved affiliated hospitals, with that hospital's room types), costs, specialists and notes. `CostSummaryBar` shows a live total that excludes commission.
4. **Save Draft** calls RPC `save_treatment_plan_draft` (`saveDraftTreatmentPlanAction`).
5. **Submit Plan** requires the confirm checkbox and passing the strict `treatmentPlanSubmitSchema`. It saves the draft, then calls RPC `submit_treatment_plan`. The plan moves to `submitted_to_iha`, `doctor_case_assignments.plan_submitted_at` is set, and the form becomes read-only.
6. Admin reviews the plan (`iha_review_in_progress`, `iha_approved` or `rejected_by_iha`) and presents it to the patient. A plan rejected by IHA appears under the **Declined** tab on `/cases`.

### 5.5 Consultation requests and scheduling

1. A patient requests a consultation on a treatment option, creating a `consultation_requests` row with status `requested`. It appears under **Awaiting Slots**.
2. On `/consultations/[requestId]`, `ProposeSlotsForm` collects 1–3 slots in **Sydney time**. `proposeConsultationSlotsAction` validates them (future, end after start, not after the treatment start date), converts them to UTC and calls RPC `propose_consultation_slots`. The status becomes `slots_proposed`. A DB trigger notifies the patient in-portal, and the action sends email and SMS.
3. The doctor can re-propose while the status is `slots_proposed`. The patient picks a slot (`slot_selected`) and pays in the patient app. On payment the request becomes `scheduled`, and a Zoom link is generated outside this app.
4. When `scheduled`, the page shows the time and `JoinZoomButton`, active from 15 minutes before the start until the end.
5. The doctor can cancel with a reason (RPC `cancel_consultation`) at any time before the request is `scheduled`.

### 5.6 Annual fee

1. The webhook sets `annual_fee_next_due_at` to one year after registration.
2. From 14 days before the due date, `DashboardShell` shows a dismissible amber banner linking to `/account-settings?tab=billing`.
3. In `BillingTab`, the **Pay now** button only appears once the fee is due (`annual_fee_next_due_at <= now`). It POSTs `/api/fees/create-intent` with `{feeType:'annual'}`, and the RPC enforces that the due date has been reached. Stripe returns to `?tab=billing&redirect_status=succeeded`.
4. The webhook moves `annual_fee_next_due_at` forward one year from the previous due date and clears `annual_fee_reminder_sent_for`. The reminder emails themselves are sent outside this app. An `annual_fee_paid` notification is created.
5. Non-payment never blocks access.
6. Invoices for completed payments are available as PDFs in **Invoices** (`/api/fees/invoice`).

### 5.7 Messaging with MTA Admin

1. The `(dashboard)` layout loads the doctor's `provider_message_threads` row and its unread count, which appears as the badge on the Messages nav item.
2. `/messages` renders `ProviderMessageThread` from `@iha/ui` with three server actions: send (inserts into `provider_messages`), mark read, and request reopen of a closed thread with a reason.
3. If no thread exists yet, the page shows only the heading. Admin creates the thread.

### 5.8 Notifications

1. In-portal notifications are rows in `notifications`, written by DB triggers, RPCs and the fee webhook.
2. `DashboardShell` wraps the app in `NotificationsChannelProvider` (Supabase realtime), seeded with the server-fetched unread count.
3. `NotificationBell` prepends realtime rows, shows a toast with a link to the case, and supports per-item and "mark all" read through the `markNotificationAsRead` and `markAllNotificationsAsRead` actions. `/notifications` shows the full history.
4. Email and SMS fan-out to **patients** (on case or consultation changes) happens in `dispatchCaseStatusAlerts` from `@iha/db/cases`, using Resend and Twilio. The doctor's own email and SMS preferences are stored via `NotificationsTab`.

---

## 6. Notes, patterns and potential issues

### Patterns

- **Defence in depth.** Middleware only checks the session and email verification. Role, approval and fee gates run in the `(dashboard)` layout and in `postAuthRedirect`. Individual pages re-check the account (some redundantly), and ownership checks rely on RLS plus explicit assignment lookups.
- **Sign out before redirecting to `/login`** whenever a non-doctor is detected. This is deliberate, to avoid a middleware redirect loop; it is commented in several places.
- **RPC-first mutations.** Almost every state transition is a Postgres RPC. Server actions map error-code substrings (`unauthorized`, `invalid_transition`, …) to user-facing copy.
- **Trust nothing from the client for files.** Uploaded file metadata is re-verified against Storage (`getStorageObjectMeta`) before it is persisted. Documents are proxied so patient-id storage paths are never exposed.
- **Fee amounts are server-authoritative.** The amount comes from the `create_doctor_fee_payment` RPC and `platform_fee_settings`, and PaymentIntent creation races are reconciled.
- **sessionStorage drafts** for the registration wizard and the treatment-plan form.
- **Sydney time** for all consultation entry and display, with DST-correct conversion in `lib/timezone.ts`.
- **Auditing:** every mutation writes to `audit_logs` via `logAuditEvent` with `app: 'doctor'`.
- **Type workarounds:** several places cast the Supabase client to hand-written shapes because the generated DB types are stale (the webhook and account-settings RPCs).

### Potential issues and TODOs

1. **Registration-fee success relies on the URL.** The success screen trusts `?redirect_status=succeeded`. If the webhook is delayed, "Continue to dashboard" bounces the doctor straight back to `/registration-fee`, which then tries to create or reuse an intent. The RPC should block that, but the doctor would see an error. Consider polling `registration_fee_paid_at`.
2. **Bank details look like placeholders.** `components/payments/bank-transfer-panel.tsx` has hard-coded values (BSB `012-345`, account `123456789`). These should come from configuration before production.
3. **Legacy hospital redirect.** `cases/page.tsx` sends hospital accounts to `/case-management`, which does not exist in this app. The path is unreachable anyway, because the layout signs hospitals out.
4. **`/pending-approval` lacks a role check.** It does not sign out hospital-role accounts. A hospital user would see doctor copy, and the resubmit form would not render.
5. **Inconsistent `photo_url`.** Registration stores a **private storage path** (`registration-documents`). The avatar update stores a **public URL** (`avatars` bucket). `fetchDoctorRegistrationDetails` assumes a path, and the account settings `<img>` assumes a URL.
6. **Inconsistent audit ids.** Account-settings audits use `entityType: 'doctor'` with `entityId = userId` (the auth user id), whereas resubmission uses the doctor id.
7. **UTC "today".** `SlotRowsFields` and `TreatmentPlanForm` compute "today" in UTC (`toISOString().slice(0,10)`), not Sydney time. Near midnight the date picker's `min` can be off by a day; the server still validates the actual time.
8. **Unused code.** `components/cases/assignment-status-badge.tsx` (`AssignmentStatusBadge`), `fetchHospitalById` in `lib/data/hospitals.ts`, and the exported `getConsultationStatusLabel`. `slot-rows-fields.tsx` mentions a "reschedule dialog" that does not exist.
9. **Stale local types.** `types/index.ts`'s `CaseStatus` is missing `visa_documents_submitted` and `visa_rejected`, which the cases page compares against as plain strings.
10. **Fee-amount fallbacks.** The registration fee display falls back to 5000 AUD and the annual fee to 2000 AUD when fee settings fail to load. The actual charge is always server-side.
11. **Avatar path.** In `personal-details-card.tsx` the path is built as `${user?.id}/avatar.${ext}`. Without a session this would upload to `undefined/…`; RLS would almost certainly reject it.
12. **Placement.** An `import` statement in `treatment-plan-form.tsx` sits after a `const` declaration. It works because imports are hoisted, but it is unconventional.
13. **Email-confirmation duplication.** The callback route and the dashboard layout both handle unconfirmed emails, in addition to middleware rule 6. This is harmless redundancy.
