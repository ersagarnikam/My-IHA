# `apps/visa` — Visa Lawyer Portal

> Port **3002** · Next.js 15 App Router · package name `visa`

## 1. Overview

The visa portal is used by **immigration lawyers** (individual lawyers or law firms) who handle the visa side of a patient's medical-tourism case. A lawyer:

1. self-registers through a 5-step wizard (account → email OTP → professional details → documents → agreement) and waits for MTA Admin approval;
2. once approved, works the visa cases assigned to them (`visa_submissions.assigned_lawyer_id`): reads the patient's visa application, requests extra documents from the patient, keeps confidential case notes, and moves the visa status forward (including rejection with a mandatory reason);
3. uploads the approved visa document for approved cases, which notifies the patient;
4. chats with MTA Admin through a single provider message thread and receives real-time in-portal notifications;
5. maintains their profile and notification preferences.

The UI brand is "MTA Visa Lawyer Portal" (cyan accent colour).

### Key dependencies (`apps/visa/package.json`)

| Dependency | Why it matters |
|---|---|
| `next` ^15.3, `react`/`react-dom` ^19.1 | App Router, Server Components, Server Actions. |
| `@iha/db` | Supabase server/browser clients, auth middleware, and data-access modules (`visa`, `visa-status`, `notifications`, `provider-messages`, `cases`, `audit`, `storage`, `auth-lookup`, `account-lookup`). |
| `@iha/ui` | Shared shadcn-style components (Card, Table, Dialog, Select, Form, `WizardLayout`, `AccountStep`, `AgreementStep`, `DocumentUploadField`, `ProviderMessageThread`, `NotificationsChannelProvider`, `SecurityTab`, …) and `@iha/ui/auth` forms/shell. |
| `@iha/validations` | Shared Zod schemas (`auth`, `provider-registration`, `phone`, `caseNoteBodySchema`, `messageBodySchema`) and the `Result<T>` type. |
| `@iha/logger` | `createLogger('visa:*')` structured server-side logging in server actions. |
| `@supabase/ssr` | Cookie-based Supabase auth (used indirectly through `@iha/db`). |
| `@tanstack/react-query` | `QueryClientProvider` mounted in `app/providers.tsx` (no `useQuery` calls in the app yet). |
| `nuqs` | URL query-state; used for the `?tab=` on Account & Settings. |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Forms with Zod validation (registration, resubmit, account settings). |
| `react-phone-number-input` | International phone input (its CSS is imported in `globals.css`; component is `PhoneInput` from `@iha/ui`). |
| `sonner` | Toasts (global `<Toaster>` and custom notification toasts). |
| `lucide-react` | Icons. |
| `clsx`, `tailwind-merge` | `cn()` helper (`lib/utils.ts`). |
| Dev: `@iha/config`, `tailwindcss` 3, `postcss`, `autoprefixer`, `eslint` 9, `typescript` 5.8 | Shared preset/configs and toolchain. |

## 2. Configuration

### Scripts (`package.json`)

| Script | Command |
|---|---|
| `dev` | `next dev --port 3002` |
| `build` | `next build` |
| `start` | `next start --port 3002` |
| `lint` | `next lint` |

### `next.config.ts`

- `output: 'standalone'` — self-contained server bundle for container deployment.
- `transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations']` — workspace packages ship TypeScript source.

### `middleware.ts`

Delegates to `handleAuthMiddleware` from `@iha/db/middleware` with:

```ts
publicPrefixes: ['/login', '/register', '/forgot-password', '/reset-password', '/verify', '/auth', '/api'],
postAuthPath: '/dashboard',
requireEmailVerification: true,
```

Matcher excludes `_next/static`, `_next/image`, `favicon.ico` and image files (`svg|png|jpg|jpeg|gif|webp`).

Behaviour of `handleAuthMiddleware` (evaluated in order):

1. Builds a Supabase server client over request/response cookies and calls `auth.getUser()` (refreshing the session cookie). A thrown error (e.g. stale refresh token) is logged and treated as signed-out.
2. `/` → redirect to `/dashboard` if signed in, otherwise `/login`.
3. A path is **public** if it equals or starts with one of `publicPrefixes` + `/`. Every other path (`/dashboard`, `/visa-cases/**`, `/messages`, `/documents`, `/notifications`, `/account-settings`, `/pending-approval`) is **protected**.
4. Signed-out user on a protected path → redirect to `/login`.
5. Signed-in user whose `email_confirmed_at` is null on a protected path → redirect to `/verify?email=<email>`.
6. Signed-in user on `/login`, `/verify` or `/forgot-password` → redirect to `/dashboard`. (`/register` and `/reset-password` are deliberately not in this list.)

**Approval gating is not in the middleware.** The middleware only knows about authentication and email verification. Lawyer-account existence and approval status are enforced by:

- `app/(dashboard)/layout.tsx` — no `lawyers` row → `/register`; `status !== 'approved'` → `/pending-approval`.
- `app/register/page.tsx` — signed-in user with a `lawyers` row → `/dashboard` (approved) or `/pending-approval`.
- `app/pending-approval/page.tsx` — no row → `/register`; approved → `/dashboard`.
- `lib/actions/auth.ts#postAuthRedirect` — post-login/OTP destination.

### Styling and tooling

| File | Purpose |
|---|---|
| `tailwind.config.ts` | Uses `@iha/config/tailwind.preset`; content globs `app/**`, `components/**` and `../../packages/ui/src/**`. |
| `postcss.config.mjs` | `tailwindcss` + `autoprefixer`. |
| `eslint.config.mjs` | Re-exports `@iha/config/eslint-next`. |
| `tsconfig.json` | Extends `@iha/config/tsconfig.base.json`, adds Next plugin and `@/*` → `./*` path alias. |
| `app/globals.css` | Imports `react-phone-number-input/style.css`, Tailwind layers, shadcn-style HSL CSS variables (background, primary, muted, destructive, border, radius…). |

### Environment variables (`.env.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (default `http://localhost:3002`; used for auth email redirect URLs), `NEXT_PUBLIC_NOTIFICATION_APP_URL` (default `http://localhost:3000`; consumed by `@iha/db/cases` to build patient-portal links in email/SMS alerts), `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (email/SMS dispatch via `@iha/notifications`, triggered from `insertNotification`).

## 3. Routing map

"Approved lawyer" = signed in + email verified (middleware) + `lawyers` row with `status = 'approved'` (dashboard layout).

| URL | File | Purpose | Auth requirement | Main data loaded |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Root redirect | None (middleware redirects first) | — redirects to `/login` (middleware sends signed-in users to `/dashboard`) |
| `/login` | `app/(auth)/login/page.tsx` | Email/password + OAuth login | Public; signed-in users bounced to `/dashboard` | — |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request reset email | Public; signed-in users bounced | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | Set new password (recovery session) | Public (reached via `/auth/callback?next=/reset-password`) | — |
| `/verify?email=` | `app/(auth)/verify/page.tsx` | Email OTP verification | Public; redirects to `/register` if `email` missing | — |
| `/register` | `app/register/page.tsx` | 5-step lawyer registration wizard | Public; signed-in users with an existing `lawyers` row are redirected | `getAccountForUser` (`lawyers`) |
| `/pending-approval` | `app/pending-approval/page.tsx` | Approval status + resubmit form | Signed in + verified; must have a non-approved `lawyers` row | `getAccountForUser`, `fetchLawyerRegistrationDetails` (`lawyers`) |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth / email-link code exchange (Route Handler, GET) | Public | `auth.exchangeCodeForSession` |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Welcome, stat cards, 5 recent cases | Approved lawyer | `fetchCasesForLawyer` (`visa_submissions` + `patients` + `cases`) |
| `/visa-cases?status=` | `app/(dashboard)/visa-cases/page.tsx` | Tabbed, searchable, paginated case list | Approved lawyer | `fetchCasesForLawyer` |
| `/visa-cases/[caseId]` | `app/(dashboard)/visa-cases/[caseId]/page.tsx` | Case detail: patient, application form, notes, documents, requests, treatment plan, status change | Approved lawyer (+ RLS case access) | `fetchCaseDetailForLawyer`, `fetchVisaDocumentsForCase`, `fetchDocumentRequestsForCase`, `fetchCaseNotes`, `createVisaDocumentSignedUrl` |
| `/messages` | `app/(dashboard)/messages/page.tsx` | Conversation with MTA Admin | Approved lawyer | `fetchProviderThread('lawyer', id)`, `fetchProviderMessages` |
| `/documents` | `app/(dashboard)/documents/page.tsx` | Upload/replace approved visa per approved case | Approved lawyer | `fetchCasesForLawyer` (filtered `approved`), `fetchLawyerIssuedDocumentsForCases`, `createVisaDocumentSignedUrl` |
| `/notifications` | `app/(dashboard)/notifications/page.tsx` | Full notification history | Approved lawyer | `fetchNotificationsForUser` |
| `/account-settings?tab=` | `app/(dashboard)/account-settings/page.tsx` | Personal info, security, notification prefs | Approved lawyer | `fetchLawyerAccountSettings` (`lawyers`) |

The `(dashboard)` layout additionally loads, for every dashboard page: provider thread + unread message count, the user's notifications (first 5 shown in the bell) and unread notification count.

## 4. File reference

All paths are relative to the repository root.

### Root configuration

| File | Description |
|---|---|
| `apps/visa/package.json` | Workspace manifest: scripts on port 3002, dependencies listed in §1. |
| `apps/visa/next.config.ts` | Standalone output, transpiles `@iha/ui`, `@iha/db`, `@iha/validations`. |
| `apps/visa/middleware.ts` | Exports `middleware` (calls `handleAuthMiddleware`) and `config.matcher`. See §2. |
| `apps/visa/tailwind.config.ts` | Tailwind config built on the shared preset; scans `packages/ui` sources. |
| `apps/visa/postcss.config.mjs` | PostCSS plugins (tailwind, autoprefixer). |
| `apps/visa/eslint.config.mjs` | Re-exports the shared Next ESLint flat config. |
| `apps/visa/tsconfig.json` | Extends the shared base; `@/*` alias. |
| `apps/visa/.env.example` | Env var template (names in §2). |

### `app/` — root

| File | Description |
|---|---|
| `apps/visa/app/layout.tsx` | Root layout. Loads Geist / Geist Mono fonts, sets metadata (`MTA Visa Lawyer Portal`), wraps children in `Providers`. |
| `apps/visa/app/providers.tsx` | Client component `Providers`: `QueryClientProvider` (staleTime 60 s), `NuqsAdapter`, and sonner `<Toaster richColors closeButton position="top-center">`. |
| `apps/visa/app/globals.css` | Phone-input CSS import, Tailwind directives, theme CSS variables. |
| `apps/visa/app/page.tsx` | `HomePage` — `redirect('/login')` (normally pre-empted by middleware). |
| `apps/visa/app/error.tsx` | Root error boundary (`GlobalError`): logs `[visa:GlobalError]` digest/message, shows "Try again" (`reset`). |
| `apps/visa/app/icon.png` | App favicon (Next file-based icon). |

### `app/(auth)/` — unauthenticated pages (wrapped in `AuthShell`)

| File | Description |
|---|---|
| `apps/visa/app/(auth)/layout.tsx` | Wraps pages in `AuthShell` from `@iha/ui/auth` (split layout with illustration). |
| `apps/visa/app/(auth)/error.tsx` | Error boundary for auth pages (`[visa:AuthError]`). |
| `apps/visa/app/(auth)/login/page.tsx` | Renders `LoginPageClient`. |
| `apps/visa/app/(auth)/forgot-password/page.tsx` | Renders `ForgotPasswordPageClient`. |
| `apps/visa/app/(auth)/reset-password/page.tsx` | Renders `ResetPasswordPageClient`. |
| `apps/visa/app/(auth)/verify/page.tsx` | Async server page; reads `searchParams.email`, redirects to `/register` if absent, otherwise renders `VerifyOtpPageClient` with the decoded email. |

Note: there is no `(auth)/register`; registration lives at `app/register` because it uses its own wizard layout.

### `app/auth/callback/`

| File | Description |
|---|---|
| `apps/visa/app/auth/callback/route.ts` | `GET` Route Handler. Exchanges `?code` for a session (`auth.exchangeCodeForSession`); on missing code/error redirects to `/login?error=auth_callback`. Back-fills `user_metadata.full_name` from OAuth identity data via `auth.updateUser`. Unverified users → `/verify?email=`; otherwise redirects to `?next` (default `/dashboard`). Used for OAuth, signup email links and password-reset links. |

### `app/register/` and `app/pending-approval/`

| File | Description |
|---|---|
| `apps/visa/app/register/page.tsx` | Server page. If a signed-in user already has a `lawyers` row (`getAccountForUser`), redirects to `/dashboard` or `/pending-approval`. Otherwise renders `LawyerRegistrationWizard` starting at step 3 (if already signed in) or step 1. |
| `apps/visa/app/pending-approval/layout.tsx` | `AuthShell` with a wider `max-w-2xl` content column. |
| `apps/visa/app/pending-approval/page.tsx` | Server page. Requires a user and a non-approved `lawyers` row. Shows status copy for `pending` / `more_info_requested` / `rejected`, the admin note (`rejection_reason` or `more_info_message`), and — for rejected/more-info — a `LawyerResubmitForm` prefilled via `fetchLawyerRegistrationDetails`. Includes a sign-out form (`signOut` server action). |

### `app/(dashboard)/` — approved-lawyer area

| File | Description |
|---|---|
| `apps/visa/app/(dashboard)/layout.tsx` | Gatekeeper + shell. `getAuthUser()` (cached, `@iha/db/server`) → `/login`; unverified → `/verify`; `getAccountForUser` → `/register` if none, `/pending-approval` if not approved. Loads `fetchProviderThread` + `fetchUnreadProviderMessageCount` (`@iha/db/provider-messages`) and `fetchNotificationsForUser` + `fetchUnreadNotificationCount` (`@iha/db/notifications`). Renders `NavigationProgressProvider` (`@iha/ui`) → `DashboardShell`. |
| `apps/visa/app/(dashboard)/error.tsx` | Dashboard error boundary (`[visa:DashboardError]`). |
| `apps/visa/app/(dashboard)/dashboard/page.tsx` | "Welcome, {name}", three `StatCard`s (New / In Progress / Approved via `getVisaStatusBucket`) and a "Recent Cases" table (top 5) linking to `/visa-cases/{case_id}`. Data: `fetchCasesForLawyer`. |
| `apps/visa/app/(dashboard)/dashboard/loading.tsx` | Skeleton for stat cards and table. |
| `apps/visa/app/(dashboard)/visa-cases/page.tsx` | Case list. `TABS` (all/new/under_review/docs_pending/in_progress/approved/rejected) rendered with `CaseTabs` (`@iha/ui`) as `?status=` links; filters server-side by bucket, then renders `VisaCasesTable`. |
| `apps/visa/app/(dashboard)/visa-cases/loading.tsx` | Skeleton for tabs + table. |
| `apps/visa/app/(dashboard)/visa-cases/[caseId]/page.tsx` | Case detail. Loads `fetchCaseDetailForLawyer` (404 via `notFound()` if no submission visible), then documents, document requests and notes in parallel; signs each document URL with `createVisaDocumentSignedUrl`. Renders: gradient header with avatar, `VisaStatusBadge` and `UpdateStatusDialog`; Patient Details; seven `CollapsibleSection`s of the patient's `form_data` (traveler, medical, Australian provider, financial, travel, legal, companion — only when `travelling_with_companion === 'Yes'`); Rejection Reason card; `CaseNotesSection`; Documents card (`VisaDocumentsList` + pending, unfulfilled requests) with `RequestDocumentDialog` shown only when status is not `documents_submitted` and not in `DOCUMENT_REQUESTS_CLOSED_STATUSES` (`application_submitted`, `processing`, `approved`, `rejected`); Treatment Plan logistics section. |
| `apps/visa/app/(dashboard)/visa-cases/[caseId]/loading.tsx` | Skeleton mirroring the detail layout. |
| `apps/visa/app/(dashboard)/messages/page.tsx` | Loads the lawyer's provider thread and messages; renders `ProviderMessageThread` (`@iha/ui`) wired to `sendProviderMessageAction`, `markProviderMessagesReadAction`, `requestProviderThreadReopenAction`. Renders nothing below the header if no thread exists. |
| `apps/visa/app/(dashboard)/messages/loading.tsx` | Chat-panel skeleton. |
| `apps/visa/app/(dashboard)/documents/page.tsx` | Approved-visa management. Filters lawyer cases to `status === 'approved'`, batch-loads lawyer-issued docs (`fetchLawyerIssuedDocumentsForCases`), signs URLs, renders `ApprovedVisaDocumentsTable` or an empty state. |
| `apps/visa/app/(dashboard)/documents/loading.tsx` | Table skeleton. |
| `apps/visa/app/(dashboard)/notifications/page.tsx` | Full list via `fetchNotificationsForUser` → `NotificationsList`. |
| `apps/visa/app/(dashboard)/notifications/loading.tsx` | List skeleton. |
| `apps/visa/app/(dashboard)/account-settings/page.tsx` | Loads `fetchLawyerAccountSettings(user.id)`; renders `AccountSettingsClient` with the login email. |
| `apps/visa/app/(dashboard)/account-settings/loading.tsx` | Settings skeleton. |

### `components/auth/`

Thin client adapters binding `@iha/ui/auth` forms to server actions (byte-identical to the admin app's versions).

| File | Description |
|---|---|
| `apps/visa/components/auth/login-page-client.tsx` | `LoginPageClient`: `LoginForm` → `signInWithEmail`; on success `router.push(redirectTo)` + `refresh()`. OAuth via `signInWithOAuth`. |
| `apps/visa/components/auth/forgot-password-page-client.tsx` | `ForgotPasswordPageClient`: `ForgotPasswordForm` → `requestPasswordReset`. |
| `apps/visa/components/auth/reset-password-page-client.tsx` | `ResetPasswordPageClient`: `ResetPasswordForm` → `resetPassword`, toast, push to `/login`; "Back to login" calls `signOut`. |
| `apps/visa/components/auth/verify-otp-page-client.tsx` | `VerifyOtpPageClient({ email })`: `VerifyOtpForm` → `verifyOtp` / `resendVerificationOtp`. |

### `components/registration/`

| File | Description |
|---|---|
| `apps/visa/components/registration/lawyer-registration-wizard.tsx` | `LawyerRegistrationWizard({ initialStep, userId })`. Steps: 1 Account (`AccountStep` from `@iha/ui` → `signUpForRegistration(values, 'visa_lawyer')`), 2 Verify Email, 3 Details, 4 Document, 5 Agreement (`AgreementStep` → `submitLawyerRegistration`). Persists `{step, draft, userId, email}` to sessionStorage (`lib/draft-storage`) and restores it before rendering steps. Final submit flattens the three upload slots into `certificates[]`, clears the draft and navigates to the returned `redirectTo`. Uses `WizardLayout`. |
| `apps/visa/components/registration/verify-email-step.tsx` | `VerifyEmailStep`: `VerifyOtpForm` (no logo) → `verifyOtp`; on success just advances (ignores `redirectTo`). Resend surfaces `rateLimited`. Establishes the real session needed for uploads and the `register_lawyer` RPC. |
| `apps/visa/components/registration/lawyer-details-step.tsx` | `LawyerDetailsStep`: RHF + `lawyerDetailsStepSchema`. Fields: registration type toggle (individual/law firm), name (label switches to "Firm Name"), registration/licence number, ABN, immigration-law certification details, `PhoneInput`, address, city/state, zip. Optional Back button. |
| `apps/visa/components/registration/lawyer-documents-step.tsx` | `LawyerDocumentsStep`: three `DocumentUploadField`s into Storage bucket `registration-documents` under `pathPrefix = userId` — licence certificate (1 file, required), immigration-law certification (1 file, required), other documents (multiple). Validated with `lawyerDocumentsStepSchema`. |
| `apps/visa/components/registration/lawyer-resubmit-form.tsx` | `LawyerResubmitForm({ lawyerId, userId, defaultValues })`: single-page form using the combined `lawyerRegistrationSchema` (all details + a single `certificates` `DocumentUploadField`) → `resubmitLawyerRegistration`; toast and `router.refresh()` on success. Described in code as a stand-in until a full profile editor exists. |

### `components/cases/`

| File | Description |
|---|---|
| `apps/visa/components/cases/visa-status-badge.tsx` | Exports `getVisaStatusColor`, `getVisaStatusLabel`, `getVisaStatusBucket`, type `VisaStatusBucket`, and `VisaStatusBadge`. Maps `visa_submissions.status` → label/bucket: `documents_submitted`→New, `under_review`→Under Review, `additional_docs_requested`→Docs Pending, `application_submitted`/`processing`→In Progress, `approved`, `rejected`. Header comment marks the mapping as **provisional**. |
| `apps/visa/components/cases/visa-cases-table.tsx` | `VisaCasesTable({ cases })` (client): local search over patient name, reference number, country; 15 rows/page via `Pagination`; View link to case detail. |
| `apps/visa/components/cases/update-status-dialog.tsx` | `UpdateStatusDialog({ caseId, currentStatus })`: options from `VISA_STATUS_TRANSITIONS[currentStatus]` (`@iha/db/visa-status`, client-safe); hidden when there are none. Requires a rejection reason textarea when choosing `rejected`. Calls `updateVisaStatusAction`. |
| `apps/visa/components/cases/request-document-dialog.tsx` | `RequestDocumentDialog({ caseId })`: category select (`REQUESTABLE_DOCUMENT_CATEGORY_LABELS`), document-type input, instructions textarea → `requestDocumentAction`. |
| `apps/visa/components/cases/case-notes-section.tsx` | `CaseNotesSection({ caseId, initialNotes })`: confidential notes log ("Only visible to you"), add via `addCaseNoteAction`, prepends optimistically from the returned row; timestamps formatted `en-AU`. |
| `apps/visa/components/cases/visa-documents-list.tsx` | `VisaDocumentsList({ documents })` and type `VisaDocumentWithUrl`; lists `visa_documents` rows with category label + filename and a Preview button opening `DocumentPreviewModal` (`@iha/ui`); shows "Unavailable" if signing failed. |
| `apps/visa/components/cases/collapsible-section.tsx` | `CollapsibleSection({ title, icon, defaultOpen })`: client accordion card; `icon` is a rendered element (serialisable across the RSC boundary). |
| `apps/visa/components/cases/document-category-labels.ts` | `DOCUMENT_CATEGORY_LABELS` (passport, photograph, hospital invitation, appointment confirmation, bank statement, sponsorship letter, employer letter, companion passport, proof of relationship, approved visa), `getDocumentCategoryLabel`, and `REQUESTABLE_DOCUMENT_CATEGORY_LABELS` (excludes hospital-generated letters and `approved_visa`). Local copy of the patient app's i18n labels. |

### `components/documents/`

| File | Description |
|---|---|
| `apps/visa/components/documents/approved-visa-documents-table.tsx` | `ApprovedVisaDocumentsTable({ cases })` and type `ApprovedCaseRow` (`LawyerCaseListItem` + optional `LawyerIssuedDocument` with `signedUrl`). Search + 15-row pagination; renders `ApprovedVisaCell` per row. |
| `apps/visa/components/documents/approved-visa-cell.tsx` | `ApprovedVisaCell`: "Upload" button when no document; otherwise "Uploaded" badge + date, Preview (`DocumentPreviewModal`) and Replace (re-opens the upload dialog). |
| `apps/visa/components/documents/upload-approved-visa-dialog.tsx` | `UploadApprovedVisaDialog({ caseId, patientName, trigger })`: drag-and-drop picker (PDF/JPEG/PNG/WEBP, ≤10 MB, mirrors bucket limits). Uploads directly from the browser with `createClient()` from `@iha/db/client` to bucket `visa-documents` at `lawyer-issued/{caseId}/{timestamp}-{sanitizedName}`, then calls `uploadApprovedVisaDocumentAction` and `router.refresh()`. Dialog cannot be closed mid-upload. |

### `components/notifications/`

| File | Description |
|---|---|
| `apps/visa/components/notifications/notification-bell.tsx` | `NotificationBell({ initialNotifications })`: subscribes via `useNotificationsChannel` (`@iha/ui`, Supabase Realtime) and shows a custom sonner toast with a "View" link to `/visa-cases/{case_id}`. Desktop dropdown (last 5, mark one/all read via server actions, "View all" → `/notifications`); mobile renders a link to `/notifications`. Unread badge capped at "99+". |
| `apps/visa/components/notifications/notifications-list.tsx` | `NotificationsList`: full list with realtime prepend, click-to-read + navigate to the case, "Mark all as read". Uses `NotificationRow` from `@iha/ui`. |

### `components/layout/`

| File | Description |
|---|---|
| `apps/visa/components/layout/dashboard-shell.tsx` | `DashboardShell`: wraps content in `NotificationsChannelProvider(userId, initialUnreadCount)`. Collapsible desktop sidebar (`w-52`/`w-14`), mobile overlay sidebar, sticky header with `NotificationBell`, avatar initial, display name and role, and a sign-out confirmation modal posting to `signOut`. Nav items: Dashboard, Visa Cases, Messages (unread badge), Documents, Account & Settings. Each link includes `LinkProgressReporter`. Logo `/logo.png`. |

### `components/account-settings/`

| File | Description |
|---|---|
| `apps/visa/components/account-settings/account-settings-client.tsx` | `AccountSettingsClient({ lawyer, email })`: tabbed UI (`personal-info`, `security`, `notifications`) with the active tab in `?tab=` via `nuqs` (`parseAsStringLiteral`, shallow). Security tab is `SecurityTab` from `@iha/ui`. |
| `apps/visa/components/account-settings/lawyer-basic-info-card.tsx` | `LawyerBasicInfoCard`: read view + edit form (`lawyerAccountBasicInfoSchema`) for name, registration number, ABN, phone, city, zip, address; email shown read-only. Saves via `updateLawyerBasicInfo`. |
| `apps/visa/components/account-settings/lawyer-professional-details-card.tsx` | `LawyerProfessionalDetailsCard`: read/edit registration type and immigration-law certification (`lawyerAccountProfessionalSchema`) → `updateLawyerProfessionalDetails`. |
| `apps/visa/components/account-settings/notifications-tab.tsx` | `NotificationsTab({ emailEnabled, smsEnabled })`: two `ToggleSwitch` rows saved immediately via `updateLawyerNotificationPreferences`; reverts to initial values on error. |

`apps/visa/components/.gitkeep` and `apps/visa/hooks/.gitkeep` are placeholders (no custom hooks exist).

### `lib/actions/` — server actions (`'use server'`)

| File | Exports and behaviour |
|---|---|
| `apps/visa/lib/actions/auth.ts` | `postAuthRedirect(userId)` (`/register` / `/pending-approval` / `/dashboard`); `signInWithEmail` (password login; if no `lawyers` row **and** `findOtherRoleAccount` (`@iha/db/account-lookup`) finds a patient/hospital/doctor account, signs out and returns the generic invalid-credentials error); `verifyOtp` (type `email`); `resendVerificationOtp` (flags `over_email_send_rate_limit`); `requestPasswordReset` (redirect `/auth/callback?next=/reset-password`); `resetPassword` (updates password then signs out); `signInWithOAuth`; `signOut`. All validate with `@iha/validations/auth` and log via `logAuditEvent` (`@iha/db/audit`, app `visa`). |
| `apps/visa/lib/actions/registration.ts` | `signUpForRegistration(values, 'visa_lawyer')`: validates `registrationAccountStepSchema`, checks `checkEmailAlreadyRegistered` (`@iha/db/auth-lookup`) to defeat silent GoTrue enumeration protection, then `auth.signUp` with `options.data.role` (so the patient-creation trigger skips this user). `submitLawyerRegistration(values)`: verifies each uploaded file against real Storage metadata (`getStorageObjectMeta`, bucket `registration-documents`; extension, MIME allow-list, 10 MB), calls RPC **`register_lawyer`**, syncs `full_name` to auth metadata, audits `registration.lawyer_submitted`, returns `postAuthRedirect`. `resubmitLawyerRegistration(lawyerId, values)`: same verification, RPC **`resubmit_lawyer_registration`**, audits `registration.resubmitted`. |
| `apps/visa/lib/actions/cases.ts` | `updateVisaStatusAction(caseId, status, rejectionReason?)`: validates target against `VISA_STATUS_TRANSITIONS`, requires reason for `rejected`, calls `updateVisaSubmissionStatusRpc` (RPC **`update_visa_submission_status`**). Then notifies the patient (`insertNotification`, type `visa_status_updated`) for `under_review`, `application_submitted`, `processing`, `approved`, `rejected`, and — only for `approved`/`rejected` — the hospital and doctor user ids from `fetchCaseProviderUserIds` (RPC **`get_case_provider_user_ids`**). Notification failures are logged, not surfaced. `addCaseNoteAction(caseId, body)`: validates `caseNoteBodySchema`, inserts into **`visa_case_notes`** (`case_id`, `lawyer_id`, `body`) and returns the new `CaseNote`. Both `revalidatePath('/visa-cases/{id}')`. |
| `apps/visa/lib/actions/documents.ts` | `requestDocumentAction(caseId, category, documentType, instructions)`: RPC **`request_visa_document`** (creates a `visa_document_requests` row and sets status `additional_docs_requested`; raises `case_not_under_review` unless status is `under_review`/`additional_docs_requested`), then notifies the patient (`document_requested`). `uploadApprovedVisaDocumentAction(caseId, doc)`: `recordLawyerVisaDocument` → RPC **`record_lawyer_visa_document`** (upserts a `visa_documents` row with `source='lawyer_issued'`, `category='approved_visa'`; errors `unauthorized` / `not_found` / `visa_not_approved` mapped to friendly copy), then notifies the patient (`visa_document_available`). Revalidates `/documents` and the case page. |
| `apps/visa/lib/actions/messages.ts` | `sendProviderMessageAction(threadId, body)` (`messageBodySchema`, `sendProviderMessage(threadId, 'lawyer', userId, body)`, audit `provider_message.sent`); `markProviderMessagesReadAction(threadId)`; `requestProviderThreadReopenAction(threadId, reason)` (audit `provider_message.reopen_requested`). All from `@iha/db/provider-messages`; revalidate `/messages`. |
| `apps/visa/lib/actions/notifications.ts` | `markNotificationAsRead(id)`, `markAllNotificationsAsRead()` — wrap `@iha/db/notifications` helpers scoped to the current user; revalidate `/notifications`. |
| `apps/visa/lib/actions/account-settings.ts` | `updateLawyerBasicInfo` (RPC **`update_lawyer_basic_info`**), `updateLawyerProfessionalDetails` (RPC **`update_lawyer_professional_details`**), `updateLawyerNotificationPreferences` (direct `lawyers` update of `email_notifications_enabled` / `sms_notifications_enabled` by `user_id`). Each audits (`lawyer.profile_updated`, `lawyer.professional_details_updated`, `lawyer.notification_preferences_updated`) and revalidates `/account-settings`. Uses hand-written client types because migration `20260902010000_add_lawyer_account_settings.sql` is not yet reflected in generated DB types. |

### `lib/data/` — server-side reads

| File | Exports and behaviour |
|---|---|
| `apps/visa/lib/data/cases.ts` | `fetchPatientUserIdForCase(caseId)` (`visa_submissions` → `patients.user_id`, for notifications); `fetchCasesForLawyer(lawyerId)` + type `LawyerCaseListItem` (`visa_submissions` with `patients(full_name, country_of_residence)` and `cases(id, reference_number)`, newest first; RLS is the real boundary); `fetchCaseDetailForLawyer(caseId)` + type `LawyerCaseDetail` (parallel query of `visa_submissions` (status, rejection reason, `form_data`, case, patient) and the latest `treatment_plans` row limited to logistics: hospital, doctor, specialties, procedure, dates); `fetchCaseNotes(caseId)` + type `CaseNote` (`visa_case_notes`, newest first). |
| `apps/visa/lib/data/documents.ts` | `fetchVisaDocumentsForCase(caseId)` (`visa_documents`, oldest first); re-exports `fetchDocumentRequestsForCase` and `DocumentRequestWithStatus` from `@iha/db/visa`. |
| `apps/visa/lib/data/registration-details.ts` | `fetchLawyerRegistrationDetails(userId)` → `{ id, values: LawyerRegistrationInput }` from `lawyers` for prefilling the resubmit form. |
| `apps/visa/lib/data/account-settings.ts` | `fetchLawyerAccountSettings(userId)` + type `LawyerAccountSettings`: selects profile fields, decrypted `registration_number`/`abn_number` computed columns, `certificates`, and notification flags from `lawyers`. |

### `lib/auth/`, `lib/validations/`, other `lib/`

| File | Description |
|---|---|
| `apps/visa/lib/auth/account.ts` | `getAccountForUser(userId)` → `Account` (`role: 'lawyer'`, `id`, `displayName`, `status`, `rejectionReason`, `moreInfoMessage`) from `lawyers` by `user_id`, or `null`. The single lookup behind every redirect/gate. |
| `apps/visa/lib/auth/constants.ts` | `INVALID_CREDENTIALS_MESSAGE`, `GENERIC_AUTH_ERROR`, `EMAIL_ALREADY_REGISTERED_MESSAGE`, `VERIFY_EMAIL_MESSAGE` (the last is currently unused). |
| `apps/visa/lib/validations/lawyer-registration.ts` | Lawyer Zod schemas: `lawyerDetailsStepSchema` (type, name ≥2, registration number 4–20 alnum/hyphen, **ABN with weighted mod-89 checksum** via `isValidAbn`, certification, `isValidPhone`, address/city/zip), `lawyerDocumentsStepSchema`, `lawyerRegistrationSchema` (details + `certificates` ≥1), `fileMetaSchema`, `documentCategories`, `lawyerTypes`, `lawyerTypeLabels`, types `UploadedFileMeta`, `DocumentCategory`, `LawyerRegistrationInput`. |
| `apps/visa/lib/validations/account-settings.ts` | `lawyerAccountBasicInfoSchema` and `lawyerAccountProfessionalSchema` (both `.pick()` from `lawyerDetailsStepSchema` to keep rules identical), `lawyerNotificationPreferencesSchema`, and inferred input types. |
| `apps/visa/lib/validations/auth.ts` | Re-exports auth schemas/types from `@iha/validations/auth` (actions import the package directly, so this file is currently unused). |
| `apps/visa/lib/draft-storage.ts` | `loadDraft`, `saveDraft`, `clearDraft` — sessionStorage helpers with prefix `visa-draft:` (tab-scoped so half-filled registrations don't persist on shared devices). |
| `apps/visa/lib/utils.ts` | `cn(...)` (clsx + tailwind-merge). Currently unused — components import `cn` from `@iha/ui`. |

### `types/`

| File | Description |
|---|---|
| `apps/visa/types/index.ts` | `CaseStatus`, `AssignmentStatus`, `LawyerStatus` (`pending`/`approved`/`rejected`/`more_info_requested`), `AccountRole` (`'lawyer'`), `TreatmentPlanStatus`. Only `LawyerStatus` is used (by `lib/auth/account.ts`). |

### `public/` assets

| File | Description |
|---|---|
| `apps/visa/public/logo.png` | MTA logo used in the dashboard sidebar and by `AuthLogo` (default `/logo.png`). |
| `apps/visa/public/auth-illustration.png` | Illustration shown by `AuthSidebar` inside `AuthShell` (default `/auth-illustration.png`). |

## 5. Key flows

### 5.1 Registration → pending approval

1. **Account (step 1)** — `/register` renders `LawyerRegistrationWizard` (step 1 for anonymous visitors). `AccountStep` submits to `signUpForRegistration` (`lib/actions/registration.ts`), which rejects already-registered emails and calls `auth.signUp` with `data.role = 'visa_lawyer'`.
2. **Verify email (step 2)** — `VerifyEmailStep` → `verifyOtp` establishes a live session (required for Storage uploads and the RPC).
3. **Details (step 3)** — `LawyerDetailsStep` validates with `lawyerDetailsStepSchema` (ABN checksum, phone validity). Signed-in users without a `lawyers` row who revisit `/register` start here.
4. **Documents (step 4)** — `LawyerDocumentsStep` uploads files to `registration-documents/{userId}/…` via `DocumentUploadField`.
5. **Agreement (step 5)** — `AgreementStep` → `submitLawyerRegistration`: server re-verifies each file's real MIME/size from Storage, calls `register_lawyer` (row always created as `pending`), syncs `full_name`, audits, and returns `/pending-approval`. The sessionStorage draft is cleared.
6. **Waiting** — `/pending-approval` shows status copy. MTA Admin (outside this app) sets `lawyers.status` to `approved`, `rejected` (with `rejection_reason`) or `more_info_requested` (with `more_info_message`).
7. **Resubmission** — for rejected/more-info, `LawyerResubmitForm` → `resubmitLawyerRegistration` → `resubmit_lawyer_registration` reopens the same row; `router.refresh()` re-renders the page.
8. **Approved** — on next login `postAuthRedirect` returns `/dashboard`; the dashboard layout admits the user.

### 5.2 Login

`LoginPageClient` → `signInWithEmail`. Wrong-role accounts (a positive match in another role table) are signed out with the same generic error as a bad password, so role membership is not leaked. Lawyers mid-registration (no row, no other role) are sent to `/register` (wizard resumes at step 3). OAuth logins go through `/auth/callback` and land on `/dashboard`, where the layout performs the same `/register` / `/pending-approval` routing.

### 5.3 Visa case handling and status updates

1. Cases appear once a `visa_submissions` row is assigned to the lawyer (`assigned_lawyer_id`; assignment is done outside this app). RLS limits visibility to assigned cases.
2. `/dashboard` and `/visa-cases` bucket cases with `getVisaStatusBucket`.
3. On `/visa-cases/[caseId]`, `UpdateStatusDialog` offers only allowed next statuses (`VISA_STATUS_TRANSITIONS` in `@iha/db/visa-status`):

   | From | Allowed targets |
   |---|---|
   | `documents_submitted` (New) | `under_review` |
   | `under_review` | `processing` |
   | `additional_docs_requested` | `under_review`, `processing` |
   | `application_submitted` (legacy) | `processing`, `approved`, `rejected` |
   | `processing` | `approved`, `rejected` |
   | `approved`, `rejected` | — (terminal; dialog hidden) |

4. `updateVisaStatusAction` re-validates and calls `update_visa_submission_status`, which enforces the same transition allow-list in SQL (`invalid_transition`) and requires a reason for rejection (`rejection_reason_required`). Per the migrations, a rejection also moves `cases.status` to `visa_rejected`.
5. Notifications: patient for every lawyer-driven status; hospital + doctor only for approved/rejected. The rejection reason appears in the notification text and on the case page (red "Rejection Reason" card).

### 5.4 Document requests

1. The Request Document button is shown only while the case is `under_review` or `additional_docs_requested` (the UI hides it for `documents_submitted` with a hint to move to Under Review first, and for closed statuses).
2. `RequestDocumentDialog` → `requestDocumentAction` → `request_visa_document` RPC: inserts `visa_document_requests` and sets status `additional_docs_requested` (Docs Pending).
3. The action notifies the patient (`document_requested`) with the category label, document type and instructions.
4. Unfulfilled requests appear as amber "Requested" rows under Documents; once the patient uploads, the document itself appears in `VisaDocumentsList`.

### 5.5 Case notes

`CaseNotesSection` → `addCaseNoteAction` inserts into `visa_case_notes`. RLS (migration `20260903000000`) restricts read access to the assigned lawyer; notes are never shown to the patient. The list is a newest-first timestamped log.

### 5.6 Issuing the approved visa document

1. After a case reaches `approved`, it appears on `/documents`.
2. `UploadApprovedVisaDialog` uploads the file from the browser to `visa-documents/lawyer-issued/{caseId}/…` (Storage policies gate this on case access).
3. `uploadApprovedVisaDocumentAction` → `record_lawyer_visa_document` upserts one `visa_documents` row per case (`source = 'lawyer_issued'`, `category = 'approved_visa'`) and stamps `sent_to_patient_at`; it raises `visa_not_approved` if the case is not approved.
4. The patient receives `visa_document_available` and can download the visa from the patient portal's Visa & Travel section. Replacing uploads a new file and overwrites the row.

### 5.7 Messaging with MTA Admin

Each lawyer has one `provider_message_threads` row (auto-created by a DB trigger, migration `20260902000000_add_lawyer_provider_messaging.sql`). `/messages` renders `ProviderMessageThread`, which sends via `sendProviderMessageAction`, marks messages read, and can request reopening of a closed thread. The sidebar shows the unread count computed in the dashboard layout.

### 5.8 Notifications

`insertNotification` (`@iha/db/cases`) writes a `notifications` row (deduplicated per user/type/case within 60 s) and then sends email/SMS alerts according to the **patient's** preferences in `patients`. In the lawyer portal, `NotificationsChannelProvider` + `useNotificationsChannel` subscribe to Realtime inserts for the user, power the bell badge and toasts, and keep `/notifications` live. Clicking a notification marks it read and navigates to the related case.

### 5.9 Account settings

`/account-settings` → tabs: Personal Info (two editable cards backed by RPCs), Security (shared `SecurityTab`), Notifications (email/SMS toggles saved to `lawyers`).

## 6. Notes

- **Defence in depth.** Gating is layered: middleware (session + email verified) → dashboard layout (lawyer row + approval) → each page re-checks `getAccountForUser` → RLS and `SECURITY DEFINER` RPCs (`lawyer_has_access_to_case`) are the real security boundary. Pages call `supabase.auth.getUser()` and `getAccountForUser` again even though the layout already did (the layout uses the cached `getAuthUser`), so each request runs repeated `lawyers` lookups.
- **Hand-typed Supabase clients.** Several modules cast the client to hand-written interfaces (`AccountSettingsRpcClient`, `NotificationPreferencesClient`, `InsertCaseNoteClient`, `LawyerAccountSettingsClient`) because generated `Database` types are behind the migrations (`20260902010000`) or resolve inserts to `never`. Regenerating types would allow removing these casts.
- **Provisional status model.** `visa-status-badge.tsx` is explicitly marked provisional. `application_submitted` and `processing` share the "In Progress" label; `application_submitted` is now only a legacy source state.
- **Notification side-effects are best-effort.** All post-RPC notifications log failures but never fail the action. Admin is not notified on visa outcomes because no admin identity model exists in the schema yet (comments in `lib/actions/cases.ts` and migrations).
- **Lawyer email/SMS preferences appear unused by dispatch.** `insertNotification`'s alert dispatch reads preferences from the `patients` table only, so the toggles saved in `lawyers.email_notifications_enabled` / `sms_notifications_enabled` are not consulted by that path (no code in this app sends notifications to lawyers). The upload dialog text promises the patient "in-portal, email, and SMS" notification, which depends on the patient's own preferences.
- **Orphaned Storage objects.** The approved-visa upload writes to Storage before the RPC. If the RPC fails (e.g. `visa_not_approved`), or a document is replaced (new timestamped path), the earlier file is never deleted. Registration uploads abandoned mid-wizard are also left in `registration-documents`.
- **OAuth role check gap.** The wrong-role rejection exists only in `signInWithEmail`. An OAuth login of a patient/hospital/doctor account goes through `/auth/callback` → `/dashboard` → `/register`, rather than being rejected with the generic error.
- **Latent middleware redirect loop.** For a signed-in but unverified user, protected routes redirect to `/verify`, while `/verify` redirects signed-in users to `/dashboard`. This is normally unreachable because Supabase refuses password sign-in for unconfirmed emails, but it would loop if such a session ever existed.
- **Unused or stale code:** `lib/utils.ts` (`cn`), `lib/validations/auth.ts`, `VERIFY_EMAIL_MESSAGE`, and most of `types/index.ts` are unused. `CaseStatus` there lacks `visa_documents_submitted` and `visa_rejected`, which the DB now allows. `@tanstack/react-query` is mounted but not used for queries. `hooks/` is empty.
- **Two import paths for transitions.** The client dialog imports `VISA_STATUS_TRANSITIONS` from `@iha/db/visa-status` (client-safe), and the server action imports it via `@iha/db/visa` (re-export). This is intentional, so the client bundle doesn't pull in server code.
- **Document categories are duplicated.** `document-category-labels.ts` is a local copy of the patient app's labels (the code comment notes 9 real categories vs the SOW's 8) and must be kept in sync manually.
- **No `/notifications` nav item.** It is reachable only from the bell ("View all", or the bell link on mobile).
- `lawyers.lead_lawyer_id` is reserved for future law-firm member management (Module 02). The resubmit form is described as a stand-in for that module's full profile editor.
