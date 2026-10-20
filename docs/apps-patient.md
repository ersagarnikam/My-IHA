# `apps/patient` — Patient Portal

> Scope: everything under `apps/patient/` except `node_modules/`, `.next/` and `.turbo/`. All paths below are relative to the repository root. This document was written from the source as of 2026-10-16.

---

## 1. Overview

**What it is.** The patient-facing portal of the MTA (Medical Tourism Australia / "IHA") platform. International patients use it to:

- register and verify their email (OTP), then complete a 3-step profile (personal info, medical background, emergency contact);
- submit medical **cases** (condition + supporting documents) and follow them through a 12-stage lifecycle (`case_submitted` → … → `completed`);
- review **treatment options** that doctors/hospitals prepare, request an optional paid **online consultation** (Zoom), and confirm one option;
- **pay** for consultations and treatment with Stripe (saved cards, Payment Element, invoices/receipts);
- fill in the **visa (subclass 602) application** and upload visa documents for the visa lawyer;
- chat with MTA admins, receive realtime **notifications**, manage documents, and manage account settings (including account deletion).

**Users.** Patients only. Authentication (Supabase Auth) is shared with the hospital, doctor and visa portals, so the app explicitly checks that a `patients` row exists for the signed-in user (`lib/actions/auth.ts → signInWithEmail`).

**Port.** `3000` (`next dev --port 3000` / `next start --port 3000`). Output mode is `standalone`.

### Key dependencies (`apps/patient/package.json`)

| Package | Why it matters here |
|---|---|
| `next` ^15.3, `react` / `react-dom` ^19.1 | App Router, Server Components, Server Actions, route handlers. |
| `@iha/db` (workspace) | Supabase server/browser clients (`@iha/db/server`, `@iha/db/client`), the auth middleware (`@iha/db/middleware`) and all data-access modules (`cases`, `treatments`, `consultations`, `payments`, `visa`, `chat`, `notifications`, `patients`, `specialties`, `storage`, `audit`, `auth-lookup`). Also performs email/SMS dispatch internally (via `@iha/notifications`) in helpers such as `dispatchCaseStatusAlerts`. |
| `@iha/ui` (workspace) | Shared shadcn-style components (`Button`, `Card`, `Dialog`, `Select`, `Form*`, `Carousel`, `Skeleton`, `DateInput`, `DocumentPreviewModal`, `cn`) and the auth UI (`@iha/ui/auth`: `AuthShell`, `AuthSidebar`, `LoginForm`, `RegisterForm`, `VerifyOtpForm`, `ForgotPasswordForm`, `ResetPasswordForm`). |
| `@iha/validations` (workspace) | Zod schemas and the `Result<T>` type: auth schemas, `medicalDetailsSchema`, `personalInfoSchema`, `medicalBackgroundSchema`, `emergencyContactSchema`, `visaFormSchema`/`getVisaFormSchema`, `getReopenRequestSchema`, `DOCUMENT_TYPES`, visa document category lists. |
| `@iha/logger` (workspace) | `createLogger('patient:…')` structured (pino) logging in server code. |
| `@iha/config` (dev, workspace) | Shared `tsconfig.base.json`, ESLint config (`eslint-next`) and Tailwind preset. |
| `@supabase/ssr` | Cookie-based Supabase sessions (used through `@iha/db`). |
| `stripe` | Server-side Stripe SDK (PaymentIntents, Customers, CustomerSessions, PaymentMethods, webhooks). Wrapped lazily in `lib/stripe.ts`. |
| `@stripe/stripe-js`, `@stripe/react-stripe-js` | Client Payment Element (checkout) and Card Element (saving cards). |
| `@tanstack/react-query` | Client fetching/caching for PaymentIntent creation and saved-card list/mutations. |
| `next-intl` | Cookie-based i18n (`en` / `zh`), server and client translations. |
| `nuqs` | URL query-state (`/profile?tab=…`). |
| `react-hook-form` + `@hookform/resolvers` + `zod` | All forms (wizards, profile cards, visa form, reopen modal, security tab). |
| `react-phone-number-input`, `libphonenumber-js` | International phone input and the country list used in profile dropdowns. |
| `pdf-lib` | Server-side PDF invoice generation (`/api/payments/invoice`). |
| `sonner` | Toast notifications (including custom realtime notification toasts). |
| `lucide-react` | Icons. |
| `clsx`, `tailwind-merge` | Class utilities (`lib/utils.ts`, though components use `cn` from `@iha/ui`). |
| `tailwindcss` 3, `postcss`, `autoprefixer` | Styling. |

---

## 2. Configuration

### 2.1 `package.json` scripts

| Script | Command |
|---|---|
| `dev` | `next dev --port 3000` |
| `build` | `next build` |
| `start` | `next start --port 3000` |
| `lint` | `next lint` |

### 2.2 `next.config.ts`

- Wrapped with `createNextIntlPlugin('./i18n/request.ts')`.
- `output: 'standalone'`.
- `transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations']`.
- `images.remotePatterns`: allows `https://<supabase host>/storage/v1/object/public/**` (derived from `NEXT_PUBLIC_SUPABASE_URL`) so public avatars can be rendered by `next/image`.
- `experimental.serverActions.bodySizeLimit: '10mb'` — needed because document uploads go through the `uploadDocumentFile` Server Action (default limit is 1 MB).

### 2.3 `middleware.ts` (auth & redirect logic)

The app's middleware delegates entirely to `handleAuthMiddleware` from `packages/db/src/middleware.ts` with:

```ts
publicPrefixes: ['/login', '/register', '/forgot-password', '/reset-password', '/verify', '/auth', '/api'],
postAuthPath: '/cases',
requireEmailVerification: true,
checkPatientSoftDelete: true,
```

Matcher: every path except `_next/static`, `_next/image`, `favicon.ico` and image files (`svg|png|jpg|jpeg|gif|webp`).

Exact behaviour, in order:

1. Creates a Supabase server client bound to request/response cookies (refreshing the session cookies if needed) and calls `auth.getUser()`. If that throws (e.g. a stale refresh-token cookie) the user is treated as unauthenticated.
2. **Soft-delete check** (`checkPatientSoftDelete`): if a user is signed in, looks up `patients.is_deleted` for `user_id`. If `true`, signs the user out and redirects to `/login`.
3. **Root path** `/`: redirect to `/cases` if signed in, otherwise `/login`.
4. **Protected routes** = any path that is *not* equal to or under one of the public prefixes. Unauthenticated request to a protected route → redirect to `/login`.
5. **Email verification**: signed-in user with no `email_confirmed_at` on a protected route → redirect to `/verify?email=<email>`.
6. **Leave auth pages**: signed-in user visiting `/login`, `/verify` or `/forgot-password` (first path segment) → redirect to `/cases`. (`/register` and `/reset-password` are deliberately not in this set.)
7. Otherwise passes through with refreshed cookies.

Notes:
- `/api/*` is public at the middleware level; **every route handler validates the session itself** (and the Stripe webhook verifies its signature instead).
- The `(dashboard)` layout adds a second layer: it re-checks the user, email confirmation, and that the profile is complete (`date_of_birth` and `emergency_contact_name` present) — otherwise it redirects to `/profile/setup`.

### 2.4 Tailwind / PostCSS / ESLint / TypeScript

| File | Content |
|---|---|
| `apps/patient/tailwind.config.ts` | Uses `@iha/config/tailwind.preset`; content globs `app/**`, `components/**` and `../../packages/ui/src/**`. |
| `apps/patient/postcss.config.mjs` | `tailwindcss` + `autoprefixer`. |
| `apps/patient/eslint.config.mjs` | Re-exports `@iha/config/eslint-next`. |
| `apps/patient/tsconfig.json` | Extends `@iha/config/tsconfig.base.json`, Next plugin, path alias `@/* → ./*`. |
| `apps/patient/next-env.d.ts` | Standard Next.js generated type references. |
| `apps/patient/app/globals.css` | Imports `react-phone-number-input/style.css`; Tailwind layers; styles `.PhoneInput*` to match shadcn inputs; defines `@keyframes nav-progress` / `.animate-nav-progress` (top navigation progress bar); shadcn-style HSL CSS variables (`--background`, `--primary`, …). |

### 2.5 i18n

- Library: `next-intl` v4 **without locale-prefixed routes**.
- `apps/patient/i18n/request.ts`: reads the `locale` cookie; `'zh'` → Chinese, anything else → `'en'`; dynamically imports `messages/<locale>.json`.
- `app/layout.tsx` wraps the tree in `NextIntlClientProvider`; server components use `getTranslations`, client components `useTranslations`.
- Switching: `components/language-switcher.tsx` → Server Action `lib/actions/locale.ts#setLocale` (authenticated users only) sets a 1-year `locale` cookie and `revalidatePath('/', 'layout')`. The switcher is only rendered in the dashboard header.
- Database-generated notification titles/messages and many `toLocaleDateString('en-AU')` dates are **not** translated.

### 2.6 `messages/` translations

`apps/patient/messages/en.json` and `apps/patient/messages/zh.json` (1218 lines each, 971 leaf keys each, key sets identical). Top-level namespaces:

`nav`, `logout`, `common`, `errors`, `notifications`, `messages`, `caseStatus`, `dashboard`, `activeCaseSection`, `cases`, `approvedVisa`, `caseDetail`, `submissionSuccess`, `treatments`, `treatmentDetail`, `consultation`, `payments`, `visaTravel`, `profile`, `documentTypes`, `caseDocuments`, `caseWizard`, `paymentPage`, `documents`, `visaForm`, `visaDetail`, `actionErrors` (server-action error strings), `documentUpload`, `authToasts`.

### 2.7 Environment variables (names only)

Defined in `apps/patient/.env.local` (values are secrets and are not reproduced here):

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `next.config.ts` (image host), `@iha/db` clients and middleware. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `@iha/db` clients and middleware. |
| `SUPABASE_SERVICE_ROLE_KEY` | `@iha/db/server#createServiceClient` (used by the Stripe webhook) and other privileged `@iha/db` helpers. |
| `NEXT_PUBLIC_APP_URL` | `lib/actions/auth.ts` (email/OAuth redirect URLs), `app/auth/callback/route.ts` (redirect origin). Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_NOTIFICATION_APP_URL`, `NEXT_PUBLIC_DOCTOR_APP_URL` | Not referenced in app code; consumed by shared packages when building links in outbound notifications. |
| `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` | Email delivery inside `@iha/notifications` (reached via `@iha/db` dispatch helpers). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS delivery inside `@iha/notifications`. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `loadStripe()` in `payment-client.tsx`, `consultation-payment-client.tsx`, `payment-billing-tab.tsx`. |
| `STRIPE_SECRET_KEY` | `lib/stripe.ts`. |
| `STRIPE_WEBHOOK_SECRET` | `app/api/payments/webhook/route.ts`. |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | `lib/zoom.ts` (Server-to-Server OAuth). |
| `LOG_LEVEL` (optional) | `@iha/logger`. |

---

## 3. Routing map

Route groups `(auth)`, `(onboarding)` and `(dashboard)` do not appear in URLs. "Auth" column: **Public** = allowed without session by middleware; **Session** = signed in + email verified (middleware); **Complete profile** = additionally passes the `(dashboard)` layout check (patient row with DOB + emergency contact).

| URL | File | Purpose | Auth | Main data loaded |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Redirect only. | — | Middleware sends to `/cases` or `/login` before the page's own `redirect('/login')` runs. |
| `/login` | `app/(auth)/login/page.tsx` | Email/password + OAuth sign-in. | Public (signed-in users bounced to `/cases`) | — |
| `/register` | `app/(auth)/register/page.tsx` | Sign-up + OAuth. | Public | — |
| `/verify?email=` | `app/(auth)/verify/page.tsx` | 6-digit email OTP verification / resend. Redirects to `/register` if no `email`. | Public (signed-in → `/cases`) | — |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request reset email. | Public (signed-in → `/cases`) | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | Set new password using the recovery session. | Public | — |
| `/auth/callback` | `app/auth/callback/route.ts` (GET) | OAuth / email-link code exchange. | Public | Supabase auth session. |
| `/profile/setup` | `app/(onboarding)/profile/setup/page.tsx` | 3-step onboarding wizard. Redirects to `/dashboard` if already complete; throws if no `patients` row. | Session | `patients` row. |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Welcome, active-case carousel + next action, quick actions, latest 4 cases. | Complete profile | Patient context, cases, document counts, latest payments, visa statuses, specialty labels. |
| `/cases` | `app/(dashboard)/cases/page.tsx` | Active and past cases list. | Complete profile | Cases for patient, specialty labels. |
| `/cases/new` | `app/(dashboard)/cases/new/page.tsx` | 3-step case submission wizard. | Complete profile | Patient row, active specialties. |
| `/cases/[caseId]` | `app/(dashboard)/cases/[caseId]/page.tsx` | Case detail: documents, description, treatment options + consultations, visa & travel section, hospital letters, approved-visa banner, travel assistance, notification timeline, status timeline. Realtime refresh. | Complete profile (RLS scopes case) | Case, case documents, case notifications, treatment options, consultation requests, visa submission, hospital letters, approved visa doc, specialty labels. |
| `/cases/[caseId]/payment` | `app/(dashboard)/cases/[caseId]/payment/page.tsx` | Treatment payment (Stripe) or "already paid" notice. Only for `treatment_confirmed`/`payment_confirmed`. | Complete profile | Case, selected treatment option (cost breakdown, hospital). |
| `/cases/[caseId]/consultations/[requestId]/payment` | `…/consultations/[requestId]/payment/page.tsx` | Consultation-fee payment (AUD 200). Only while consultation `status = slot_selected`. | Complete profile | Case, consultation request + slots. |
| `/cases/[caseId]/visa` | `app/(dashboard)/cases/[caseId]/visa/page.tsx` | 8-step visa application wizard (or read-only submitted state). Requires case in a visa-eligible status and, if not yet started, both hospital letters. | Complete profile | Case, patient, visa submission, visa documents, hospital letters. |
| `/documents` | `app/(dashboard)/documents/page.tsx` | All medical + visa documents with tabs, upload, link-to-case, preview/download. | Complete profile | Case documents, visa documents, cases, specialty labels. |
| `/messages` | `app/(dashboard)/messages/page.tsx` | Single support chat thread with MTA admin. | Complete profile | Chat thread + messages. |
| `/notifications` | `app/(dashboard)/notifications/page.tsx` | Full notification list. | Complete profile | Notifications for user. |
| `/payments` | `app/(dashboard)/payments/page.tsx` | Payment history with invoice view/download and pay/retry links. | Complete profile | Payments for patient (with case ref). |
| `/profile?tab=` | `app/(dashboard)/profile/page.tsx` | Account settings: personal / notifications / payment / security / delete. | Complete profile | Patient row, user email. |
| `/treatments` | `app/(dashboard)/treatments/page.tsx` | All treatment options across cases, grouped by case. | Complete profile | Treatment options with case info, consultations, specialty labels. |
| `/visa-travel?tab=` | `app/(dashboard)/visa-travel/page.tsx` | Tab `travel` (static guide, default) or `visa` (visa applications list + eligible cases). | Complete profile | (visa tab) cases, visa submissions, hospital letters per case. |
| `/visa-travel/[submissionId]` | `app/(dashboard)/visa-travel/[submissionId]/page.tsx` | Visa application detail: form data by section, rejection reason, approved visa, documents, open lawyer requests. | Complete profile (RLS) | Visa submission + case, visa documents, document requests. |

API routes (all under the middleware-public `/api` prefix; each authenticates itself):

| Method + URL | File |
|---|---|
| `GET /api/documents/[documentId]` | `app/api/documents/[documentId]/route.ts` |
| `GET /api/documents/visa/[documentId]` | `app/api/documents/visa/[documentId]/route.ts` |
| `DELETE /api/payments/[id]` | `app/api/payments/[id]/route.ts` |
| `POST /api/payments/add-card` | `app/api/payments/add-card/route.ts` |
| `GET /api/payments/cards` | `app/api/payments/cards/route.ts` |
| `POST /api/payments/consultation-intent` | `app/api/payments/consultation-intent/route.ts` |
| `POST /api/payments/create-intent` | `app/api/payments/create-intent/route.ts` |
| `GET /api/payments/invoice?intentId=&download=` | `app/api/payments/invoice/route.ts` |
| `GET /api/payments/receipt?intentId=` | `app/api/payments/receipt/route.ts` |
| `POST /api/payments/set-default` | `app/api/payments/set-default/route.ts` |
| `POST /api/payments/webhook` | `app/api/payments/webhook/route.ts` |

---

## 4. File reference

### 4.1 Root files

| File | Description |
|---|---|
| `apps/patient/package.json` | Package `patient`; scripts and dependencies (see §1, §2.1). |
| `apps/patient/next.config.ts` | next-intl plugin, standalone output, transpiled workspace packages, Supabase public-storage image host, 10 MB Server Action body limit. |
| `apps/patient/middleware.ts` | Calls `handleAuthMiddleware` (`@iha/db/middleware`) with the patient public prefixes, `postAuthPath: '/cases'`, email verification and patient soft-delete checks (see §2.3). |
| `apps/patient/tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`, `next-env.d.ts` | Tooling config (see §2.4). |
| `apps/patient/.env.local` | Local environment (Supabase, Stripe, Resend, Twilio, Zoom secrets). Names listed in §2.7. Should never be committed. |
| `apps/patient/i18n/request.ts` | next-intl request config: cookie `locale` → `en`/`zh` messages. |
| `apps/patient/messages/en.json`, `apps/patient/messages/zh.json` | Translation catalogs (see §2.6). |
| `apps/patient/types/index.ts` | Exports string-union types `CaseStatus`, `AssignmentStatus`, `TreatmentPlanStatus`. **Not imported anywhere**; `CaseStatus` lacks `visa_rejected`, which other code uses. |
| `apps/patient/public/` | Static assets: `logo.png` (195×75, used in the sidebar and embedded into PDF invoices) and `auth-illustration.png` (534×505, used by `@iha/ui/auth` `AuthSidebar`). |

### 4.2 `app/` — root

| File | Description |
|---|---|
| `apps/patient/app/layout.tsx` | Root layout. Loads Geist / Geist Mono fonts, sets metadata ("MTA Patient Portal"), resolves locale/messages and wraps children in `NextIntlClientProvider` + `Providers`. |
| `apps/patient/app/providers.tsx` | Client providers: TanStack `QueryClientProvider` (`staleTime` 60 s), `NuqsAdapter`, and sonner `<Toaster richColors closeButton position="top-center" />`. |
| `apps/patient/app/page.tsx` | `redirect('/login')` (in practice middleware handles `/` first). |
| `apps/patient/app/not-found.tsx` | Translated 404 (`errors.notFound`) with link to `/dashboard`. |
| `apps/patient/app/error.tsx` | Global client error boundary; logs `digest`/message to console, translated "try again" button calling `reset()`. |
| `apps/patient/app/globals.css` | Global styles (see §2.4). |
| `apps/patient/app/icon.png` | 192×192 app icon (Next.js file-based metadata). |
| `apps/patient/app/auth/callback/route.ts` | **GET** OAuth/email-link callback. Uses `code` query param and `next` (default `/dashboard`). Calls `supabase.auth.exchangeCodeForSession`; on failure redirects to `/login?error=auth_callback`. On success: `syncPatientProfileFromAuthUser(user)` (copies OAuth display name to `patients.full_name`), backfills `user_metadata.full_name` via `auth.updateUser`, redirects unverified users to `/verify?email=…`, otherwise to `${NEXT_PUBLIC_APP_URL ?? origin}${next}`. |

### 4.3 `app/(auth)/`

| File | Description |
|---|---|
| `apps/patient/app/(auth)/layout.tsx` | Wraps auth pages in `AuthShell` from `@iha/ui/auth` (illustration sidebar + form area). |
| `apps/patient/app/(auth)/error.tsx` | Error boundary for auth pages (same pattern as global). |
| `apps/patient/app/(auth)/login/page.tsx` | Renders `LoginPageClient`. |
| `apps/patient/app/(auth)/register/page.tsx` | Renders `RegisterPageClient`. |
| `apps/patient/app/(auth)/forgot-password/page.tsx` | Renders `ForgotPasswordPageClient`. |
| `apps/patient/app/(auth)/reset-password/page.tsx` | Renders `ResetPasswordPageClient`. |
| `apps/patient/app/(auth)/verify/page.tsx` | Async server page; reads `searchParams.email`, redirects to `/register` if missing, else renders `VerifyOtpPageClient` with the decoded email. |

### 4.4 `app/(onboarding)/profile/setup/`

| File | Description |
|---|---|
| `apps/patient/app/(onboarding)/profile/setup/layout.tsx` | Two-column layout with `AuthSidebar` (`@iha/ui/auth`) and a 520 px content column. |
| `apps/patient/app/(onboarding)/profile/setup/page.tsx` | Requires user (`getAuthUser`), loads patient via `fetchPatientByUserId`. If no `patients` row it **throws** (to avoid a redirect loop between middleware and layouts). If DOB and emergency contact already set → `redirect('/dashboard')`. Otherwise renders `ProfileSetupWizard`. |
| `apps/patient/app/(onboarding)/profile/setup/loading.tsx` | Skeleton placeholder. |
| `apps/patient/app/(onboarding)/profile/setup/error.tsx` | Error boundary (shown e.g. when the patient row is missing). |

### 4.5 `app/(dashboard)/` — layout and boundaries

| File | Description |
|---|---|
| `apps/patient/app/(dashboard)/layout.tsx` | Server layout for all dashboard routes. Re-checks auth and `email_confirmed_at` (→ `/verify`), loads patient and redirects to `/profile/setup` when profile is incomplete. Loads in parallel: `fetchNotificationsForUser`, `fetchUnreadNotificationCount` (`@iha/db/notifications`), locale, `fetchChatThreadForPatient` then `fetchUnreadChatMessageCount` (`@iha/db/chat`). Renders `NavigationProgressProvider` → `DashboardShell` with user name/initial/avatar, the latest 5 notifications, unread counts and locale. |
| `apps/patient/app/(dashboard)/error.tsx` | Error boundary scoped to the dashboard content area. |
| `apps/patient/app/(dashboard)/**/loading.tsx` (15 files) | Route-level Suspense fallbacks, all built from `Skeleton` (`@iha/ui`) and mirroring each page's layout: `dashboard/`, `cases/`, `cases/new/`, `cases/[caseId]/`, `cases/[caseId]/payment/`, `cases/[caseId]/consultations/[requestId]/payment/`, `cases/[caseId]/visa/`, `documents/`, `messages/`, `notifications/`, `payments/`, `profile/`, `treatments/`, `visa-travel/`, `visa-travel/[submissionId]/`. No logic. |

### 4.6 `app/(dashboard)/` — pages

| File | Description |
|---|---|
| `apps/patient/app/(dashboard)/dashboard/page.tsx` | Uses `fetchCurrentPatientContext`, `fetchCasesForPatientId`, then batched `fetchDocumentCountsForCases` (`@iha/db/cases`), `fetchLatestPaymentsForCases` (`@iha/db/payments`), `fetchVisaSubmissionStatusesForCases` (`@iha/db/visa`) for in-progress cases. Builds `ActiveCaseSummary[]` (payment/visa display strings via helpers `getPaymentDisplay`, `getVisaDisplay`) for `ActiveCaseSection`; renders quick-action links and up to 4 `DashboardCaseCard`s. |
| `apps/patient/app/(dashboard)/cases/page.tsx` | Lists cases split into active (`isInProgress`) and past, with `CaseStatusBadge`; empty state links to `/cases/new`. |
| `apps/patient/app/(dashboard)/cases/new/page.tsx` | Requires complete profile; loads `fetchActiveSpecialties` (`@iha/db/specialties`) and renders `CaseSubmissionWizard`. |
| `apps/patient/app/(dashboard)/cases/[caseId]/page.tsx` | Case detail. Loads case (`fetchCaseForCurrentUser`, RLS-scoped → `notFound()`), documents, `fetchNotificationsForCase`, specialty labels; conditionally (by status lists `TREATMENT_STATUSES` / `VISA_STATUSES`) `fetchTreatmentOptionsForCurrentCase`, `fetchVisaSubmissionForCase`, `fetchSentHospitalDocumentsForCase`, `fetchApprovedVisaDocumentForCase` and consultation requests. "Start visa application" is enabled only when both `hospital_invitation` and `appointment_confirmation` letters were sent. Mounts `CaseStatusListener` and `ConsultationRequestsListener` for realtime refresh. Renders `ApprovedVisaBanner`, `CaseDocumentsSection`, `TreatmentOptionsSection`, `CaseLettersSection`, `TravelAssistanceSection` (only `travel_ready`), `CaseTimeline`, `StatusTimeline`. |
| `apps/patient/app/(dashboard)/cases/[caseId]/payment/page.tsx` | Allowed for `treatment_confirmed`/`payment_confirmed` only (else redirect to case). Finds the selected option (`is_selected`), shows `PaymentClient` or an "already paid" card. `redirect_status=succeeded` (Stripe return) always shows the success screen even if the webhook already flipped the case. |
| `apps/patient/app/(dashboard)/cases/[caseId]/consultations/[requestId]/payment/page.tsx` | Loads case and `fetchConsultationRequestById` (`@iha/db/consultations`); 404 if request is not for this case; redirects to case unless `status === 'slot_selected'`. Shows selected slot (`SlotTimeZones`), fee `CONSULTATION_FEE_AUD` and `ConsultationPaymentClient`. |
| `apps/patient/app/(dashboard)/cases/[caseId]/visa/page.tsx` | Allowed statuses: `payment_confirmed`, `visa_documents_submitted`, `visa_processing`, `travel_ready`, `completed`. If no submission yet (or `not_started`), requires both hospital letters. Loads patient, submission and `fetchVisaDocuments`; renders `VisaPageClient`. |
| `apps/patient/app/(dashboard)/documents/page.tsx` | Merges `fetchAllDocumentsForPatientId` (case_documents) and `fetchAllVisaApplicationDocumentsForPatientId` (visa_documents) sorted by upload date; passes cases and specialty labels to `DocumentsClient`. |
| `apps/patient/app/(dashboard)/messages/page.tsx` | Loads `fetchChatThreadForPatient` + `fetchChatMessages` (`@iha/db/chat`) and renders `ChatThread`. |
| `apps/patient/app/(dashboard)/notifications/page.tsx` | `fetchNotificationsForUser` → `NotificationsList`. |
| `apps/patient/app/(dashboard)/payments/page.tsx` | `fetchPaymentsForPatient` (`@iha/db/payments`) → `PaymentsHistoryClient`. |
| `apps/patient/app/(dashboard)/profile/page.tsx` | Loads patient (redirects to `/login` if missing, `/profile/setup` if incomplete) → `ProfileClient`. |
| `apps/patient/app/(dashboard)/treatments/page.tsx` | `fetchAllTreatmentOptionsForCurrentUser`, groups by case (display specialty resolved), loads consultations per option → `TreatmentsListClient`. |
| `apps/patient/app/(dashboard)/visa-travel/page.tsx` | `?tab=visa` loads cases, `fetchAllVisaSubmissionsWithCase`, `fetchSentHospitalDocumentsForCases` to compute `lettersReceivedByCase`; renders `TabBar` + `TravelGuide` or `VisaManagement`. |
| `apps/patient/app/(dashboard)/visa-travel/[submissionId]/page.tsx` | Loads `fetchVisaSubmissionWithCaseDetail`, `fetchVisaDocuments`, then `fetchDocumentRequestsForCase` (unfulfilled ones listed). Renders read-only form data grouped into 7 sections (`SECTION_KEYS`), status badge, rejection reason, `ApprovedVisaBanner` (category `approved_visa`) and `VisaDetailDocuments`. |

### 4.7 `app/api/` — route handlers

All handlers use `createClient()` from `@iha/db/server` (user session, RLS applies) unless noted.

| File | Method | Request → Response | Side effects / notes |
|---|---|---|---|
| `apps/patient/app/api/documents/[documentId]/route.ts` | GET | Path `documentId`, optional `?download=1`. → streamed file body with `Content-Type` = stored mime, `Content-Disposition: inline|attachment`, `Cache-Control: private, no-store`. 401 / 403 (no patient) / 404 (not found or not owner) / 500 / 502. | Reads `case_documents`, checks `patient_id` matches, creates a 60 s signed URL with `createCaseDocumentSignedUrl` (`@iha/db/cases`), fetches and proxies it so the storage path (containing patient id) is never exposed. |
| `apps/patient/app/api/documents/visa/[documentId]/route.ts` | GET | Same contract for `visa_documents`. | Uses `createVisaDocumentSignedUrl` (`@iha/db/visa`) and proxies the bytes. |
| `apps/patient/app/api/payments/cards/route.ts` | GET | → JSON array of the user's `payment_methods` rows (newest first). 401 / 500. | Read-only. |
| `apps/patient/app/api/payments/add-card/route.ts` | POST | Body `{ paymentMethodId }` (Stripe PM created client-side). → 201 with inserted `payment_methods` row; 400/401/500. | Gets or creates the Stripe Customer (stores `patients.stripe_customer_id`), `paymentMethods.attach`, `paymentMethods.update({ allow_redisplay: 'always' })`, retrieves card details; first card becomes default both in DB and as `customers.invoice_settings.default_payment_method`. Inserts `payment_methods`. Audit `payment.method_added`. |
| `apps/patient/app/api/payments/set-default/route.ts` | POST | Body `{ id }` (DB row id). → `{ success: true }`; 400/401/404/500. | Updates Stripe customer default PM; sets all user rows `is_default=false` then the chosen one `true`. Audit `payment.method_set_default`. No try/catch around Stripe call. |
| `apps/patient/app/api/payments/[id]/route.ts` | DELETE | Path `id`. → `{ success: true }`; 401/404. | `stripe.paymentMethods.detach`, deletes the DB row, promotes the most recent remaining card to default if the deleted one was default. Audit `payment.method_removed`. No try/catch (a Stripe error becomes an unhandled 500). |
| `apps/patient/app/api/payments/create-intent/route.ts` | POST | Body `{ caseId }`. → `{ clientSecret, customerSessionClientSecret, amount, hospitalName, defaultPaymentMethodId }`; 400 (bad status / already paid / invalid amount), 401, 404, 500. | Verifies case ownership and status `treatment_confirmed`; amount = selected option `cost_breakdown.total` (AUD, cents). Gets/creates Stripe Customer, self-heals `allow_redisplay` on the default card, creates a **CustomerSession** (Payment Element shows saved cards). Reuses an existing pending `full_payment` PaymentIntent if present (re-attaching the default PM) or creates a new one with metadata `case_id`, `patient_id`, `treatment_option_id`, `reference_number`. Persists via `upsertPendingPayment` (`@iha/db/payments`); if a concurrent request already stored a different intent, cancels the new one and uses the winner. Audit `payment.intent_created`. |
| `apps/patient/app/api/payments/consultation-intent/route.ts` | POST | Body `{ consultationRequestId }`. → `{ clientSecret, customerSessionClientSecret, amount, defaultPaymentMethodId }`; 400/401/404/500. | Same pattern as `create-intent` for a `consultation_requests` row owned by the patient in status `slot_selected`; amount `CONSULTATION_FEE_AUD` (200); metadata `consultation_request_id`, `case_id`, `patient_id`; persisted with `upsertPendingConsultationPayment`. |
| `apps/patient/app/api/payments/webhook/route.ts` | POST | Raw Stripe event body + `stripe-signature` header. → `{ received: true }`; 400 invalid signature; 500 if secret unset. | Uses **`createServiceClient()`** (bypasses RLS). `payment_intent.succeeded`: marks `payments` row `completed` (`gateway_reference`, `paid_at`) by `stripe_payment_intent_id`, with a metadata fallback (pending row by `consultation_request_id`/`case_id` + `payment_type`). Consultation intents → `handleConsultationPaymentSucceeded`: atomically flips `consultation_requests` `slot_selected → scheduled`, creates a Zoom meeting (`createZoomMeeting`) for the slot, stores `zoom_link`, dispatches email/SMS via `dispatchCaseStatusAlerts(…, 'consultation_status_updated')`, audit `consultation.scheduled`. Treatment intents → conditional update `cases.status treatment_confirmed → payment_confirmed`; if it matched, dispatches `payment_confirmed` alerts and sets the linked `treatment_plans.status = 'patient_confirmed'`. Always inserts an `audit_logs` row (`payment.completed` / `consultation.payment_completed`). `payment_intent.payment_failed`: sets `payments.status = 'failed'`. In-portal notifications come from DB triggers, not this code. |
| `apps/patient/app/api/payments/invoice/route.ts` | GET | `?intentId=` (+ optional `download`). → `application/pdf` (inline or attachment, filename `invoice-<ref>.pdf`); 400/401/403/404/500. | Loads the **completed** `payments` row with joins (`cases`, `patients`, `treatment_options → treatment_plans → hospitals`), verifies ownership, and draws an A4 invoice with `pdf-lib` (logo from `public/logo.png`, meta band, hospital/billing address, line items: doctor fees, hospital fees, cost breakdown items, "IHA Service Fee"). Audit `payment.invoice_downloaded`. |
| `apps/patient/app/api/payments/receipt/route.ts` | GET | `?intentId=` → `{ receiptUrl }` from the Stripe charge; 400/401/403/404/500. | Ownership check, then `stripe.paymentIntents.retrieve(…, { expand: ['latest_charge'] })`. Not referenced by any UI component currently. |

### 4.8 `lib/actions/` — Server Actions (`'use server'`)

All return `Result<T>` (`{ data, error }` from `@iha/validations`) with translated `actionErrors.*` messages, re-validate input with Zod where applicable, and write audit events via `logAuditEvent` (`@iha/db/audit`, `app: 'patient'`).

| File | Exports and behaviour |
|---|---|
| `apps/patient/lib/actions/auth.ts` | `signInWithEmail` (password login; on `email_not_confirmed` returns `/verify` redirect; signs out and rejects if no `patients` row; → `/dashboard`), `signUpWithEmail` (pre-checks `checkEmailAlreadyRegistered` from `@iha/db/auth-lookup` (RPC), `auth.signUp` with `full_name` metadata and `emailRedirectTo=/auth/callback`; → `/verify?email=`), `verifyOtp` (`auth.verifyOtp type 'email'`; inserts a `welcome` notification; → `/profile/setup`), `resendVerificationOtp` (`auth.resend type 'signup'`; flags rate-limit), `requestPasswordReset` (always succeeds; redirect `/auth/callback?next=/reset-password`), `resetPassword` (`auth.updateUser`, then signs out; → `/login`), `signInWithOAuth(provider)` (redirects to provider URL), `signOut` (audit + sign-out + redirect `/login`). Audit actions `auth.*`. |
| `apps/patient/lib/actions/cases.ts` | `submitCase({ medicalDetails, documents })` → `insertCase`, `insertCaseDocuments`, `insertNotification('case_submitted')`; `addDocumentsToCase(caseId, docs)`; `updateTravelAssistance(caseId, travel, stay, transport)` → `updateCaseTravelAssistance` (maps `case_not_travel_ready`, `unauthorized`); `addPatientDocuments(docs, caseId?)` → `insertPatientDocuments` (medical/visa category, optional case link); `linkDocumentToCase(documentId, caseId)` → `updateDocumentCaseLink`. Every document is re-verified against real Storage metadata via `getStorageObjectMeta(supabase, 'case-documents', path)` (allowed: pdf/jpeg/png/webp, ≤ 10 MB). Files are renamed to `<REFERENCE>-<document_type>[-n].<ext>`. All from `@iha/db/cases` / `@iha/db/storage`. |
| `apps/patient/lib/actions/upload.ts` | `uploadDocumentFile(formData)` → `UploadedDocument`. FormData fields `file`, `bucket` (`case-documents` or `visa-documents`), optional `subPath`. Validates extension + MIME + 10 MB, builds a server-controlled path `<patient.id or user.id>/<subPath>/<timestamp>-<sanitised name>` and uploads with the user's Supabase client. Comment states it is meant to be the single place client code writes to Storage (see Notes). |
| `apps/patient/lib/actions/profile.ts` | `updatePersonalInfo`, `updateMedicalBackground` (sensitive, never logged), `updateEmergencyContact` → `updatePatient*` in `@iha/db/patients`; `updateAvatarUrl(ext)` verifies the object at `avatars/<userId>/avatar.<ext>` (mime match, ≤ 5 MB) then stores its public URL; `updateNotificationPreferences({ email_notifications_enabled, sms_notifications_enabled })`; `deletePatientAccountAction()` calls RPC **`delete_patient_account`**, audits, then `signOut()`. All `revalidatePath('/profile')`. |
| `apps/patient/lib/actions/treatments.ts` | `selectTreatmentOption(optionId, caseId)` → `confirmTreatmentOption` RPC wrapper (`@iha/db/treatments`; maps `case_not_in_treatment_plan_status`, `treatment_option_not_found`, `unauthorized`); dispatches `case_status_updated` email/SMS; creates the pending `full_payment` row via `upsertPendingPayment`. Revalidates case, `/treatments`, `/payments`. |
| `apps/patient/lib/actions/consultations.ts` | `requestConsultation(optionId, caseId)` → `requestOnlineConsultation`, patient notification `consultation_requested`, `dispatchConsultationRequestAlertsToDoctor` (doctor in-portal notification is a DB trigger). `chooseConsultationSlot(requestId, slotId, caseId)` → `selectConsultationSlot`, `dispatchCaseStatusAlerts('consultation_status_updated')`, `upsertPendingConsultationPayment` (AUD 200). |
| `apps/patient/lib/actions/visa.ts` | `submitVisaForm(caseId, formData, pendingDocuments)` → re-validates with `visaFormSchema`, verifies docs in `visa-documents`, calls `submitVisaApplicationRpc`, notification `visa_application_submitted`. `addVisaDocument(params)` → `insertVisaDocument` + lawyer notification `visa_document_uploaded` (best-effort via `fetchLawyerUserIdForCase`). `addVisaDocumentsForCase(caseId|null, docs)` → `insertUnlinkedVisaDocuments` or `addVisaDocumentsForCaseRpc` (maps `case_not_eligible_for_visa_documents`) + lawyer notification. `linkVisaDocumentToCase(documentId, caseId)` → `linkVisaDocumentToCaseRpc`. `generateVisaDocumentSignedUrl(filePath)` → 1-hour signed URL via `createVisaDocumentSignedUrl` (RLS-scoped user client). Passport data is flagged as sensitive and never logged. |
| `apps/patient/lib/actions/chat.ts` | `sendChatMessage(threadId, body)` → `sendPatientChatMessage`; `markChatMessagesAsRead(threadId)` → `markChatMessagesRead`; `requestThreadReopen(threadId, reason)` → `requestChatThreadReopen` (all `@iha/db/chat`). |
| `apps/patient/lib/actions/notifications.ts` | `markNotificationAsRead(id)`, `markAllNotificationsAsRead()` (`@iha/db/notifications`); `resolveNotificationHref({ case_id, type })` → `/cases/<id>`, or for visa types (`VISA_NOTIFICATION_TYPES`) `/visa-travel/<submissionId>` (via `fetchVisaSubmissionForCase`) or `/visa-travel?tab=visa`. |
| `apps/patient/lib/actions/locale.ts` | `setLocale('en'|'zh')` → sets `locale` cookie (1 year) and revalidates the root layout. Requires a session. |

### 4.9 `lib/repositories/` — server-side read helpers

| File | Description |
|---|---|
| `apps/patient/lib/repositories/patients.ts` | `fetchPatientByUserId(userId)` (explicit column list from `patients`), `fetchCurrentPatientContext()` (auth user + patient + metadata name in one call), `syncPatientNameFromAuth(fullName)` (→ `updatePatientFullName`). |
| `apps/patient/lib/repositories/cases.ts` | `fetchCasesForPatientId`, `fetchCasesForCurrentUser`, `fetchCaseForCurrentUser` (RLS-scoped), `fetchCaseDocumentsForCase`, `fetchAllDocumentsForPatientId` (tags rows `origin: 'case_documents'`). Type `DocumentWithCase`. Wraps `@iha/db/cases`. |
| `apps/patient/lib/repositories/treatments.ts` | `fetchTreatmentOptionsForCurrentCase(caseId)`, `fetchAllTreatmentOptionsForCurrentUser()`; re-exports `TreatmentOptionWithDetails`, `TreatmentOptionWithCaseInfo` (`@iha/db/treatments`). |
| `apps/patient/lib/repositories/consultations.ts` | `fetchConsultationRequestsForOptions(optionIds)` → map keyed by `treatment_option_id` (`@iha/db/consultations`). |
| `apps/patient/lib/repositories/visa.ts` | `fetchAllVisaApplicationDocumentsForPatientId(patientId)` maps `visa_documents` rows to the `DocumentWithCase` shape (`document_category: 'visa'`, `origin: 'visa_documents'`). |

### 4.10 `lib/` — utilities

| File | Description |
|---|---|
| `apps/patient/lib/stripe.ts` | Exports `stripe`: a `Proxy` that lazily constructs `new Stripe(STRIPE_SECRET_KEY)` on first use so builds don't fail without the key. |
| `apps/patient/lib/zoom.ts` | `createZoomMeeting({ topic, startTimeIso, durationMinutes? })` → `{ joinUrl }`. Gets an account-credentials OAuth token and POSTs `/v2/users/me/meetings` (scheduled, UTC, join-before-host). |
| `apps/patient/lib/draft-storage.ts` | `loadDraft`, `saveDraft`, `clearDraft`, `clearAllDrafts` — sessionStorage (`patient-draft:` prefix) for wizard drafts; `clearAllDrafts` runs on logout. |
| `apps/patient/lib/notification-routing.ts` | `VISA_NOTIFICATION_TYPES` set (`document_requested`, `visa_status_updated`, `visa_application_submitted`, `visa_document_available`). |
| `apps/patient/lib/format-relative-time.ts` | `formatRelativeTime(iso)` — English-only "just now / n minutes ago / Yesterday / date". |
| `apps/patient/lib/format-slot.ts` | `DOCTOR_TIME_ZONE = 'Australia/Sydney'`, `formatZonedDateTime`, `getTimeZoneLabel`. |
| `apps/patient/lib/image-dimensions.ts` | `getImageDimensions(file)`, `isValidPassportPhotoAspectRatio(file)` (35:45 ± 10 %). |
| `apps/patient/lib/specialty-label.ts` | `getSpecialtyLabel(name, locale, map)` → `label_en`/`label_zh` from `SpecialtyLabelMap`. |
| `apps/patient/lib/auth/sync-patient-profile.ts` | `syncPatientProfileFromAuthUser(user)` — derives a full name from metadata/identity data (e.g. Apple first login) and syncs it to `patients`. |
| `apps/patient/lib/auth/constants.ts` | English auth message constants. **Unused** (actions use translations instead). |
| `apps/patient/lib/validations/auth.ts` | Re-exports auth schemas/types from `@iha/validations/auth`. **Unused** (actions import the package directly). |
| `apps/patient/lib/utils.ts` | `cn()` (clsx + tailwind-merge). **Unused** (components use `cn` from `@iha/ui`). |

### 4.11 `hooks/`

| File | Description |
|---|---|
| `apps/patient/hooks/use-notifications-channel.tsx` | `NotificationsChannelProvider({ userId })` owns a single Supabase Realtime channel `notifications:<userId>` (INSERT on `public.notifications` filtered by `user_id`) after `realtime.setAuth(access_token)`, and fans rows out to subscribers. `useNotificationsChannel()` returns `{ subscribe(listener) }`. |
| `apps/patient/hooks/.gitkeep`, `apps/patient/components/.gitkeep` | Empty placeholders. |

### 4.12 `components/auth/`

Thin client adapters binding `@iha/ui/auth` forms to server actions; show sonner toasts (`authToasts.*`) and `router.push(redirectTo)` + `router.refresh()`.

| File | Description |
|---|---|
| `apps/patient/components/auth/login-page-client.tsx` | `LoginPageClient` — `LoginForm` → `signInWithEmail`; OAuth → `signInWithOAuth`. |
| `apps/patient/components/auth/register-page-client.tsx` | `RegisterPageClient` — `RegisterForm` → `signUpWithEmail`; OAuth. |
| `apps/patient/components/auth/verify-otp-page-client.tsx` | `VerifyOtpPageClient({ email })` — `VerifyOtpForm` → `verifyOtp`, resend → `resendVerificationOtp`. |
| `apps/patient/components/auth/forgot-password-page-client.tsx` | `ForgotPasswordPageClient` — `ForgotPasswordForm` → `requestPasswordReset`. |
| `apps/patient/components/auth/reset-password-page-client.tsx` | `ResetPasswordPageClient` — `ResetPasswordForm` → `resetPassword`; "back to login" → `signOut`. |

### 4.13 `components/layout/`, language switcher, phone input

| File | Description |
|---|---|
| `apps/patient/components/layout/dashboard-shell.tsx` | `DashboardShell` (client). Collapsible desktop sidebar + mobile drawer with nav (Dashboard, Case management, Messages (unread badge), Documents, Treatment, Visa & travel, Payments, Account settings); header with `LanguageSwitcher`, `NotificationBell`, avatar/name; logout confirmation dialog whose form posts to `signOut` and calls `clearAllDrafts()`. Wraps everything in `NotificationsChannelProvider`. `/cases/*/visa` highlights "Visa & travel". |
| `apps/patient/components/layout/navigation-progress.tsx` | `NavigationProgressProvider` renders an indeterminate top bar while any tracked link is pending; `LinkProgressReporter` (placed inside each nav `<Link>`) uses Next's `useLinkStatus` to increment/decrement the counter. Covers middleware latency that `loading.tsx` cannot. |
| `apps/patient/components/language-switcher.tsx` | `LanguageSwitcher({ currentLocale })` — EN / 中文 toggle calling `setLocale` in a transition. |
| `apps/patient/components/phone-input.tsx` | `PhoneInput` — `react-phone-number-input` (international, default AU) with a shadcn-styled input. |

### 4.14 `components/dashboard/`

| File | Description |
|---|---|
| `apps/patient/components/dashboard/active-case-section.tsx` | `ActiveCaseSection({ cases })`, type `ActiveCaseSummary`. Carousel (`@iha/ui` `Carousel`) of in-progress cases with an 11-step journey progress bar and stat pills (documents/payment/visa), plus a "Next action required" card driven by `getNextAction(status)` (e.g. `treatment_confirmed` → pay, `payment_confirmed` → visa form, `travel_ready` → `/visa-travel`). |

### 4.15 `components/cases/`

| File | Description |
|---|---|
| `apps/patient/components/cases/case-submission-wizard.tsx` | `CaseSubmissionWizard({ patientId, specialties })` — 3 steps (condition → documents → review), sessionStorage draft `case-wizard:<patientId>` with a hydration gate, calls `submitCase`, then shows `SubmissionSuccess`. |
| `apps/patient/components/cases/condition-details-step.tsx` | Step 1 form: `SpecialtyCombobox`, optional "Other" free text, description (≤ 2000 chars) using `getMedicalDetailsSchema` with translated messages. |
| `apps/patient/components/cases/document-upload-step.tsx` | Step 2: drag-and-drop up to 10 files (client accepts pdf/jpeg/png ≤ 10 MB), each uploaded through `uploadDocumentFile` (`case-documents`), per-file `DOCUMENT_TYPES` select. |
| `apps/patient/components/cases/review-step.tsx` | Step 3: summary of condition/docs, disclosure, submit/back. |
| `apps/patient/components/cases/submission-success.tsx` | Success screen with reference number, next-step icons, links to case and dashboard. |
| `apps/patient/components/cases/specialty-combobox.tsx` | Searchable dropdown over `SpecialtyOption[]` with locale-aware labels. |
| `apps/patient/components/cases/case-documents-section.tsx` | Case detail document table (download via `/api/documents/<id>?download=1`) and inline upload (`uploadDocumentFile` → `addDocumentsToCase`), max 10 per case; uploads locked from `treatment_plan` onwards. |
| `apps/patient/components/cases/case-letters-section.tsx` | Shows hospital-generated `hospital_invitation` / `appointment_confirmation` letters (generated vs pending) with download through `generateVisaDocumentSignedUrl`. |
| `apps/patient/components/cases/case-status-badge.tsx` | Server component `CaseStatusBadge` (translated label); helpers `getStatusColor`, `getStatusConfig`, `isInProgress` (everything except `completed`, `closed`, `visa_rejected`). |
| `apps/patient/components/cases/case-status-listener.tsx` | `CaseStatusListener({ caseId })` — Realtime UPDATE on `cases` (`id=eq.<caseId>`) → `router.refresh()`. |
| `apps/patient/components/cases/case-timeline.tsx` | Server component: converts case notifications into a dated status timeline by matching the English titles written by the `notify_case_status_change` DB trigger (`TITLE_TO_STATUS`). |
| `apps/patient/components/cases/status-timeline.tsx` | Server component: vertical 11-step lifecycle with done/current/future styling. |
| `apps/patient/components/cases/travel-assistance-section.tsx` | Three checkboxes (travel, stay booking, transportation) saved via `updateTravelAssistance`; shown only for `travel_ready`. |

### 4.16 `components/treatments/`

| File | Description |
|---|---|
| `apps/patient/components/treatments/treatment-options-section.tsx` | Case-detail grid of `TreatmentOptionCard`s; after selection collapses to the selected option plus any with a live consultation; "Go to payment" banner for `treatment_confirmed`; opens `TreatmentDetailModal`. |
| `apps/patient/components/treatments/treatments-list-client.tsx` | `/treatments` grouped view (compact cards) with the same modal. |
| `apps/patient/components/treatments/treatment-option-card.tsx` | Card: hospital, doctor, consultation status chip, summary, total AUD, "View details" (disabled when locked). |
| `apps/patient/components/treatments/treatment-detail-modal.tsx` | Full option detail (doctor, hospital, overview, diagnosis, timeline, cost breakdown, care team, aftercare) + `ConsultationPanel`; confirm dialog calls `selectTreatmentOption` then navigates to `/cases/<id>/payment`. |
| `apps/patient/components/treatments/consultation-panel.tsx` | Consultation state machine UI: `null` → request (`requestConsultation`); `requested`; `slots_proposed` → pick slot (`chooseConsultationSlot`); `slot_selected` → pay fee link / change time; `scheduled` → Zoom join button enabled from 15 min before start until end; `cancelled`. |
| `apps/patient/components/treatments/consultation-requests-listener.tsx` | Realtime `*` on `consultation_requests` (`case_id=eq.<caseId>`) → `router.refresh()`. |
| `apps/patient/components/treatments/slot-time-zones.tsx` | Shows a slot in Sydney time and, if different, the browser's time zone. |

### 4.17 `components/payments/`

| File | Description |
|---|---|
| `apps/patient/components/payments/payment-client.tsx` | `PaymentClient` — cost summary; React Query POST `/api/payments/create-intent`; Stripe `Elements` with `clientSecret` + `customerSessionClientSecret`; `confirmPayment` with `return_url=/cases/<id>/payment`; success / failed states from `redirect_status`; collapsible bank-transfer instructions (hard-coded details). |
| `apps/patient/components/payments/consultation-payment-client.tsx` | `ConsultationPaymentClient` — same flow against `/api/payments/consultation-intent`, return URL is the consultation payment page. |
| `apps/patient/components/payments/payments-history-client.tsx` | Searchable (by case reference), paginated (10/page) payment table; completed → view invoice (blob in new tab) / download (`/api/payments/invoice?…&download=1`); pending → "Pay now"; failed → "Retry" (routes to the consultation or treatment payment page by `payment_type`). |

### 4.18 `components/documents/`

| File | Description |
|---|---|
| `apps/patient/components/documents/documents-client.tsx` | `DocumentsClient` — Medical / Visa tabs. `UploadPanel` (dialog): default type/category, optional case link (filtered by tab-specific lock statuses), passport-photo ratio check, uploads via `uploadDocumentFile` (`case-documents` with `subPath: standalone`, or `visa-documents` with `subPath: <caseId|unlinked>/<category>`), then `addPatientDocuments` or `addVisaDocumentsForCase`. `DocumentsTable` with preview (`DocumentPreviewModal` from `@iha/ui` using `/api/documents/...`), download, and `LinkCaseDialog` (`linkDocumentToCase` / `linkVisaDocumentToCase`). |

### 4.19 `components/visa/` and `components/visa-travel/`

| File | Description |
|---|---|
| `apps/patient/components/visa/visa-page-client.tsx` | `VisaPageClient` (~1460 lines). 8-step wizard: traveler details, medical information, Australian provider, financial details (`FinancialStep`, conditional docs by source of funds), travel details, visa documents (passport + passport photo), legal compliance, companion (`CompanionStep`). Defaults are pre-filled from the patient profile; schema from `getVisaFormSchema`; per-step validation in `handleNext`; draft in sessionStorage `visa-form:<caseId>`. Documents are uploaded **directly from the browser** to `visa-documents/<userId>/<caseId>/<category>/…` and sent as `pendingDocuments` to `submitVisaForm`. Locked/read-only once status is `documents_submitted` or later; shows status badge/banner. |
| `apps/patient/components/visa/visa-detail-documents.tsx` | `VisaDetailDocuments` for `/visa-travel/[id]`: lists documents and open lawyer requests; upload (category select, passport-photo check, 10 MB check) **directly to Storage** then `addVisaDocument`; downloads through `generateVisaDocumentSignedUrl`. Locked from `application_submitted` onwards. |
| `apps/patient/components/visa/approved-visa-banner.tsx` | Green banner with signed-URL download for the lawyer-issued `approved_visa` document. |
| `apps/patient/components/visa/document-category.tsx` | Accordion for one visa document category with upload/download. **Not imported anywhere**; contains hard-coded English strings. |
| `apps/patient/components/visa-travel/tab-bar.tsx` | Server component with "Travel guide" / "Visa management" link tabs. |
| `apps/patient/components/visa-travel/travel-guide.tsx` | Static, translated travel guide (visa 602 info + official link, document checklist, airports, accommodation, transport, pre-arrival checklist). |
| `apps/patient/components/visa-travel/visa-management.tsx` | Server component listing visa submissions (status, view, start application if letters received) and eligible cases with no submission yet. Calls `fetchSpecialtyLabelMap` itself. |

### 4.20 `components/chat/` and `components/notifications/`

| File | Description |
|---|---|
| `apps/patient/components/chat/chat-thread.tsx` | `ChatThread({ thread, initialMessages })` — message list, Realtime INSERT on `chat_messages` (`thread_id=eq.<id>`), auto mark-read of admin messages (`markChatMessagesAsRead`), send via `sendChatMessage` (Enter to send), closed-thread banner with "request reopen". |
| `apps/patient/components/chat/request-reopen-modal.tsx` | Dialog form (`getReopenRequestSchema`) → `requestThreadReopen`. |
| `apps/patient/components/notifications/notification-bell.tsx` | Header bell: unread badge, desktop dropdown (latest 5) / mobile link to `/notifications`; subscribes to the notifications channel to prepend rows, bump the count and show a custom toast with "View"; click marks read and navigates via `resolveNotificationHref`; "mark all read". |
| `apps/patient/components/notifications/notifications-list.tsx` | Full list with realtime prepend, mark-read on click, mark-all-read. |
| `apps/patient/components/notifications/notification-row.tsx` | Presentational row (title, message, relative time, unread dot). |

### 4.21 `components/profile/`

| File | Description |
|---|---|
| `apps/patient/components/profile/profile-setup-wizard.tsx` | `ProfileSetupWizard` — three react-hook-form instances; each step saves immediately (`updatePersonalInfo`, `updateMedicalBackground`, `updateEmergencyContact`); draft `profile-wizard:<patientId>`; on finish → `/dashboard`. |
| `apps/patient/components/profile/personal-info-step.tsx` | Step 1 fields (name, DOB, gender, nationality, residence, read-only email, phone, address) + avatar upload (direct browser upload to `avatars/<userId>/avatar.<ext>` with upsert, then `updateAvatarUrl`). |
| `apps/patient/components/profile/medical-background-step.tsx` | Step 2: medical history, allergies/medications (`TagInput`), past surgeries; "shared with hospitals" notice. |
| `apps/patient/components/profile/emergency-contact-step.tsx` | Step 3: contact name, relationship (fixed list), phone. |
| `apps/patient/components/profile/profile-client.tsx` | `/profile` tab container (URL state `?tab=` via nuqs): personal, notifications, payment, security, delete. |
| `apps/patient/components/profile/personal-details-card.tsx` | View/edit personal details + avatar change (same direct upload + `updateAvatarUrl`). |
| `apps/patient/components/profile/medical-background-card.tsx` | View/edit medical background. |
| `apps/patient/components/profile/emergency-contact-card.tsx` | View/edit emergency contact. |
| `apps/patient/components/profile/notifications-tab.tsx` | Email/SMS toggles saved immediately via `updateNotificationPreferences` (reverts on error). |
| `apps/patient/components/profile/payment-billing-tab.tsx` | Saved cards (React Query over `/api/payments/cards`), set default (`/api/payments/set-default`), remove (`DELETE /api/payments/<id>`), add card with Stripe `CardElement` → `createPaymentMethod` → `/api/payments/add-card`. |
| `apps/patient/components/profile/security-tab.tsx` | Change password client-side: re-authenticates with `signInWithPassword(currentPassword)` then `auth.updateUser({ password })` (no audit event). |
| `apps/patient/components/profile/delete-account-tab.tsx` | Type `DELETE` to confirm → `deletePatientAccountAction` (RPC `delete_patient_account` + sign-out). |
| `apps/patient/components/profile/tag-input.tsx` | `TagInput` — chips with Enter/comma to add, Backspace to remove, max 20 tags. |

---

## 5. Key flows

### 5.1 Registration and email OTP verification
1. `/register` → `RegisterPageClient` → `signUpWithEmail` (`lib/actions/auth.ts`): Zod validation, `checkEmailAlreadyRegistered` RPC, `supabase.auth.signUp` with `full_name` metadata. (A `patients` row is expected to be created by DB-side logic on sign-up; the app only reads it.)
2. Redirect to `/verify?email=`; `VerifyOtpPageClient` → `verifyOtp` (`type: 'email'`), which inserts a `welcome` notification and returns `/profile/setup`. Resend → `resendVerificationOtp` (rate-limit aware).
3. OAuth (`signInWithOAuth`) and email links return through `app/auth/callback/route.ts`, which exchanges the code, syncs the display name to `patients`, and routes unverified users to `/verify`.
4. Login (`signInWithEmail`) rejects accounts with no `patients` row (shared auth across portals) and sends unconfirmed users to `/verify`.
5. Password reset: `requestPasswordReset` → email → `/auth/callback?next=/reset-password` → `resetPassword` updates password and signs out → `/login`.

### 5.2 Profile setup (onboarding)
1. Middleware lets a verified user in; the `(dashboard)` layout redirects to `/profile/setup` until `date_of_birth` and `emergency_contact_name` exist.
2. `ProfileSetupWizard` saves each step server-side (`lib/actions/profile.ts`), optionally uploads an avatar (`updateAvatarUrl` verifies the object), keeps a sessionStorage draft, and finally routes to `/dashboard`.

### 5.3 Case creation
1. `/cases/new` (complete profile required) → `CaseSubmissionWizard`.
2. Step 2 uploads each file via `uploadDocumentFile` → `case-documents/<patientId>/<ts>-<name>`.
3. Submit → `submitCase`: verifies each object's real mime/size in Storage, `insertCase` (DB generates `reference_number`), `insertCaseDocuments` with renamed `REF-type[-n].ext` names, `case_submitted` notification, audit `case.submitted`.
4. More documents can be added from the case page (`addDocumentsToCase`) until a treatment plan exists, or from `/documents` (`addPatientDocuments`, optionally unlinked, later `linkDocumentToCase`).

### 5.4 Treatment selection and consultation
1. Once a case reaches `treatment_plan`, the case page shows `TreatmentOptionsSection` (options from `@iha/db/treatments`).
2. Optional consultation: `requestConsultation` → doctor proposes slots (realtime refresh via `ConsultationRequestsListener`) → `chooseConsultationSlot` creates a pending `consultation_fee` payment (AUD 200).
3. Consultation payment: `/cases/<id>/consultations/<requestId>/payment` → `ConsultationPaymentClient` → `POST /api/payments/consultation-intent` → Stripe Payment Element → Stripe redirects back with `redirect_status`.
4. Webhook `payment_intent.succeeded` (consultation metadata) → payment `completed`, consultation `scheduled`, Zoom meeting created and `zoom_link` stored, email/SMS dispatched. `ConsultationPanel` enables "Join Zoom" 15 minutes before the slot.
5. Confirm option: `TreatmentDetailModal` → `selectTreatmentOption` (`confirmTreatmentOption` RPC sets case `treatment_confirmed`), creates a pending `full_payment` row, navigates to the payment page.

### 5.5 Treatment payment via Stripe
1. `/cases/<id>/payment` → `PaymentClient` → `POST /api/payments/create-intent`: ownership + status check, Stripe Customer get/create, CustomerSession for saved cards, reuse-or-create PaymentIntent (metadata `case_id`, `treatment_option_id`), `upsertPendingPayment` with race handling.
2. `stripe.confirmPayment` → `return_url` with `redirect_status`.
3. Webhook: payment `completed`; case `treatment_confirmed → payment_confirmed` (conditional, idempotent); `payment_confirmed` alerts; treatment plan → `patient_confirmed` (fires doctor/hospital notification trigger); audit row. Failure events mark the payment `failed` (shown with "Retry" on `/payments`).
4. Invoices: `/payments` → `GET /api/payments/invoice` generates a PDF on the fly.
5. Saved cards are managed in Profile → Payment (`add-card`, `set-default`, `DELETE /api/payments/[id]`, `cards`).

### 5.6 Visa submission
1. After `payment_confirmed`, the hospital sends `hospital_invitation` and `appointment_confirmation` letters (visible in `CaseLettersSection`); only then is "Start visa application" enabled (case page, `/visa-travel?tab=visa`, and guarded in `/cases/<id>/visa`).
2. `VisaPageClient` collects the 8 steps, uploading passport/photo/financial/companion documents directly to `visa-documents`; draft kept in sessionStorage.
3. Submit → `submitVisaForm`: Zod re-validation, Storage verification, `submitVisaApplicationRpc` (creates/updates submission + documents), `visa_application_submitted` notification.
4. Follow-up on `/visa-travel/<submissionId>`: lawyer document requests listed; extra uploads via `VisaDetailDocuments` → `addVisaDocument` (notifies lawyer); approved visa downloadable via `ApprovedVisaBanner`. Visa notifications deep-link here through `resolveNotificationHref`.
5. At `travel_ready` the patient can request travel/stay/transport assistance (`updateTravelAssistance`).

### 5.7 Chat / messaging
`/messages` loads the single patient↔admin thread. `ChatThread` subscribes to `chat_messages` inserts, marks admin messages read, sends via `sendChatMessage`. Closed threads show a banner and `RequestReopenModal` → `requestThreadReopen`. The sidebar unread badge is computed server-side in the dashboard layout (not realtime).

### 5.8 Notifications and realtime
- Server: notifications are inserted by server actions (`insertNotification`) and by DB triggers (case status, consultation status, etc.). Email/SMS fan-out is done by `@iha/db` dispatch helpers honouring the patient's preferences.
- Client: `NotificationsChannelProvider` (in `DashboardShell`) holds one Realtime subscription; `NotificationBell` (toast + badge) and `NotificationsList` subscribe to it. Clicking resolves the destination via `resolveNotificationHref`.
- Page-level realtime refresh: `CaseStatusListener` (cases) and `ConsultationRequestsListener` (consultation_requests) call `router.refresh()`.

### 5.9 Document upload and download
- Upload: preferred path is `uploadDocumentFile` (server-controlled bucket prefix, type/size checks), followed by a metadata action that re-verifies the stored object (`getStorageObjectMeta`). Visa wizard, visa detail page and avatar uploads currently write to Storage from the browser (see Notes).
- Download: case and visa documents in tables stream through `/api/documents/[id]` and `/api/documents/visa/[id]` (no storage path exposed); hospital letters, approved visa and visa-detail downloads use `generateVisaDocumentSignedUrl` (1-hour signed URL handed to the browser).

### 5.10 Account deletion
Profile → Delete account → type `DELETE` → `deletePatientAccountAction` → RPC `delete_patient_account` (soft delete; sets `patients.is_deleted`/scheduling fields) → audit → `signOut()` → `/login`. Any surviving session is blocked by the middleware soft-delete check, which signs the user out.

---

## 6. Notes

### Patterns
- **Thin pages, fat packages**: pages call repository wrappers (`lib/repositories/*`) or `@iha/db/*` functions directly; mutations go through Server Actions returning `Result<T>`; Stripe/PDF/document streaming live in route handlers.
- **Defense in depth**: middleware + layout auth checks; RLS-scoped queries with explicit ownership checks in route handlers; server re-validation of every client-reported file against Storage metadata.
- **Audit logging** on every mutation (`logAuditEvent`), plus direct `audit_logs` inserts in the webhook.
- **In-portal notifications via DB triggers**, while the app only dispatches email/SMS (comments explicitly call this out to avoid duplicates).
- **Race-safe payments**: PaymentIntent reuse and loser-cancellation in intent routes; conditional `UPDATE … WHERE status = …` in the webhook as an idempotency gate.
- **Session-scoped drafts** for wizards (cleared on logout) to avoid persisting PII on shared devices.
- Supabase typed-client limitations are worked around with locally declared `SimpleClient`-style casts in route handlers.

### TODOs / incomplete items observed
- `components/payments/payment-client.tsx`: bank-transfer details are hard-coded placeholders (`ANZ`, BSB `012-345`, account `123456789`).
- `components/visa/visa-page-client.tsx`: the "Download visa" button in the approved state has no `onClick` handler (the working download is `ApprovedVisaBanner` on other pages).
- `app/api/payments/receipt/route.ts` is not used by any UI.
- Unused files: `types/index.ts`, `lib/utils.ts`, `lib/auth/constants.ts`, `lib/validations/auth.ts`, `components/visa/document-category.tsx` (the latter also has untranslated English strings).

### Potential issues
1. **Direct browser uploads to Storage** in `visa-page-client.tsx`, `visa-detail-documents.tsx`, `personal-details-card.tsx` and `personal-info-step.tsx` contradict the stated rule in `lib/actions/upload.ts` ("Client Components must never mutate Supabase Storage directly"). They rely on bucket RLS; the visa wizard also uses `upsert: true`, has no client-side size check, and orphaned objects remain if the user abandons the wizard.
2. **Client/server file-type mismatch**: client pickers accept pdf/jpeg/png only while server actions also allow webp.
3. **Dashboard payment label bug**: `getPaymentDisplay` checks `latestPayment.status === 'succeeded'`, but payment rows use `completed`/`pending`/`failed`/`refunded`. Since a pending row is created at treatment confirmation, `treatment_confirmed` cases show "Processing" rather than "Pending".
4. **Redirect target inconsistency**: middleware `postAuthPath` is `/cases`, whereas login returns `/dashboard` and the OAuth callback defaults to `/dashboard`.
5. `/profile` and `/cases/new` `redirect('/login')` when no patient row exists, the same loop risk that `/profile/setup` explicitly avoids (in practice the dashboard layout redirects first).
6. `DELETE /api/payments/[id]` and `POST /api/payments/set-default` lack try/catch around Stripe calls; DB writes after Stripe calls are not error-checked in some branches (`[id]` delete result is ignored).
7. `generateVisaDocumentSignedUrl(filePath)` accepts an arbitrary client-supplied path; it relies entirely on `visa-documents` storage RLS (user-session client) and returns a 1-hour URL, unlike the proxying document routes that avoid exposing storage paths. Avatar public URLs also embed the user id.
8. The invoice route does not filter by `payment_type`; consultation-fee invoices fall back to a generic "Treatment Payment" line with no hospital.
9. **i18n gaps**: `formatRelativeTime`, many `toLocaleDateString('en-AU')` calls, notification titles/messages (DB triggers and server actions), lawyer notification texts, and `document-category.tsx` are English-only. `CaseTimeline` depends on exact English trigger titles, so changing trigger text silently breaks the timeline.
10. Realtime covers notification INSERTs only; read-state changes and the chat unread badge do not sync across tabs until navigation.
11. `addDocumentsToCase` / `addPatientDocuments` do not enforce the 10-document limit server-side (client-only).
12. Password change (`security-tab.tsx`) is performed entirely client-side with no audit event, unlike other account mutations.
