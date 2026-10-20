# apps/hospital — Hospital Portal

> Scope: everything under `apps/hospital/` except `node_modules`, `.next`, `.turbo`. Paths below are relative to the repo root.

---

## 1. Overview

**Purpose.** The Hospital Portal ("MTA Hospital Portal") is the Next.js 15 App Router app that a hospital administrator uses to:

- register a hospital with MTA/IHA (multi-step wizard with document upload) and wait for admin approval;
- see the doctors affiliated with the hospital, the patients and cases those doctors route to the hospital, and each case's treatment plan;
- generate visa-support letters (Hospital Invitation Letter, Appointment Confirmation Letter) as PDFs and send them to the patient;
- message MTA Admin (one provider thread per account), receive real-time notifications, and manage account settings.

**Who uses it.** Hospital accounts only (a row in `hospitals` keyed by `user_id`). Doctors have their own app (`apps/doctor`, port 3004); a doctor or any other role that signs in here is signed out and sent to `/login`.

**Port.** `3001` (`next dev --port 3001` / `next start --port 3001`).

**Key dependencies (`apps/hospital/package.json`).**

| Dependency | Why it matters |
|---|---|
| `next@^15.3.3`, `react@^19.1`, `react-dom@^19.1` | App Router, server components, server actions. |
| `@iha/db` (workspace) | Supabase server client (`@iha/db/server`), shared auth middleware (`@iha/db/middleware`), and data-access modules (`cases`, `case-assignments`, `patients`, `treatment-plans`, `visa`, `notifications`, `provider-messages`, `specialties`, `audit`, `storage`, `auth-lookup`, `account-lookup`, `types`). Almost all reads/writes go through it or through direct Supabase queries with RLS. |
| `@iha/ui` (workspace) | Shared UI kit: `AuthShell` and auth forms (`@iha/ui/auth`), `WizardLayout`/`AccountStep`/`AgreementStep`, `DocumentUploadField`, tables, `CaseAssignmentsTable`, `CaseTabs`, `TreatmentPlanSummary`, `ProviderMessageThread`, `NotificationsChannelProvider`, `SecurityTab`, `NavigationProgressProvider`, etc. |
| `@iha/validations` (workspace) | Zod schemas for auth (`@iha/validations/auth`), provider registration account step, phone validation, message body/decline/additional-info schemas, and the `Result<T>` type returned by every server action. |
| `@iha/logger` (workspace) | `createLogger()` (pino) for structured server-side error logs. |
| `@supabase/ssr` | Cookie-based Supabase session (used indirectly through `@iha/db`). |
| `zod`, `react-hook-form`, `@hookform/resolvers` | Client-side form validation for registration and account settings, sharing schemas with server actions. |
| `pdf-lib` | Server-side generation of the two visa letters (`lib/pdf/case-letters.ts`). |
| `nuqs` | URL query-state for the Account & Settings tab (`?tab=`). |
| `sonner` | Toast notifications. |
| `@tanstack/react-query` | `QueryClientProvider` is mounted in `app/providers.tsx`, but no `useQuery`/`useMutation` usage exists in this app. |
| `react-phone-number-input`, `libphonenumber-js` | Phone input and country list (registration/location step, resubmit form); CSS imported in `globals.css`. |
| `lucide-react` | Icons. |
| `clsx`, `tailwind-merge` | Class utilities (not imported directly in app code; consumed via `@iha/ui`'s `cn`). |
| Dev: `@iha/config`, `tailwindcss@3`, `postcss`, `autoprefixer`, `eslint@9`, `typescript@5.8` | Shared Tailwind preset, ESLint config and base tsconfig. |

---

## 2. Configuration

### 2.1 `package.json` scripts

| Script | Command |
|---|---|
| `dev` | `next dev --port 3001` |
| `build` | `next build` |
| `start` | `next start --port 3001` |
| `lint` | `next lint` |

### 2.2 `next.config.ts`

- `output: 'standalone'` — self-contained server build for deployment.
- `transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations']` — workspace packages ship TypeScript source.
- `images.remotePatterns` — if `NEXT_PUBLIC_SUPABASE_URL` is set, allows `next/image` to load `https://<supabase-host>/storage/v1/object/public/**` (patient avatars, doctor photos).

### 2.3 `middleware.ts` (auth / redirect logic)

`apps/hospital/middleware.ts` delegates to `handleAuthMiddleware` from `packages/db/src/middleware.ts` with:

```ts
publicPrefixes: ['/login', '/forgot-password', '/reset-password', '/verify', '/register', '/auth', '/api'],
postAuthPath: '/dashboard',
requireEmailVerification: true,
```

Matcher: every path except `_next/static`, `_next/image`, `favicon.ico`, and image files (`svg|png|jpg|jpeg|gif|webp`).

The shared middleware evaluates, in order:

1. Creates a Supabase server client bound to request/response cookies and calls `auth.getUser()` (refreshes the session cookie). If the call throws (stale refresh token), the user is treated as unauthenticated.
2. `checkPatientSoftDelete` is **not** set here, so no `patients` lookup is performed.
3. `pathname === '/'` → redirect to `/dashboard` if signed in, otherwise `/login`.
4. A path is *public* if it equals or starts with `<prefix>/` for one of `publicPrefixes`. Everything else (including `/pending-approval` and all `(dashboard)` routes) is protected.
5. No user + protected path → redirect to `/login`.
6. User whose email is not confirmed (`email_confirmed_at` null) + protected path → redirect to `/verify?email=<email>`.
7. Signed-in user on `/login`, `/verify` or `/forgot-password` (first path segment) → redirect to `/dashboard`. `/register`, `/reset-password` and `/auth/*` are deliberately not redirected.

**Approval and role gating are not done in middleware.** They are enforced server-side in:

- `app/(dashboard)/layout.tsx` — requires user, confirmed email, an account (`hospitals` or `doctors` row via `getAccountForUser`), `role === 'hospital'` (otherwise signs out and redirects to `/login`), and `status === 'approved'` (otherwise `/pending-approval`).
- `app/pending-approval/page.tsx` — redirects to `/register` (no account) or `/dashboard` (already approved).
- `app/register/page.tsx` — redirects users that already have an account.
- `lib/actions/auth.ts#postAuthRedirect` and `app/auth/callback/route.ts` — compute the landing page after login/OTP/OAuth.

Because `/api` is public in middleware, API route handlers must authenticate themselves (the one route does).

### 2.4 Tailwind / PostCSS / ESLint / TypeScript

- `tailwind.config.ts` — uses `@iha/config/tailwind.preset`; content globs: `./app/**`, `./components/**`, `../../packages/ui/src/**`.
- `postcss.config.mjs` — `tailwindcss` + `autoprefixer`.
- `eslint.config.mjs` — re-exports `@iha/config/eslint-next` (flat config).
- `tsconfig.json` — extends `@iha/config/tsconfig.base.json`, Next plugin, `baseUrl: '.'`, path alias `@/*` → `./*`.
- `app/globals.css` — imports `react-phone-number-input/style.css`, Tailwind layers, an `animate-nav-progress` keyframe utility (indeterminate top progress bar used by `NavigationProgressProvider`), and shadcn-style HSL CSS variables (`--background`, `--primary`, … `--radius`).

### 2.5 Environment variables (`apps/hospital/.env.example`)

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase clients, middleware, `next.config.ts` image host. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase clients, middleware. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service client inside `@iha/db` (e.g. `checkEmailAlreadyRegistered` → `email_already_registered` RPC). |
| `NEXT_PUBLIC_APP_URL` | Auth redirect URLs (`/auth/callback`), callback origin. Default `http://localhost:3001`. |
| `NEXT_PUBLIC_NOTIFICATION_APP_URL` | Used inside `@iha/db/cases` (`dispatchCaseStatusAlerts`) to build patient-portal links in emails/SMS. |
| `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` | Email delivery via `@iha/notifications` (transitively through `@iha/db`). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS delivery via `@iha/notifications`. |

---

## 3. Routing map

Auth legend: **Public** = no session needed; **Session** = middleware requires signed-in + verified email; **Approved hospital** = additionally gated by `(dashboard)/layout.tsx` (hospital role + `status = 'approved'`).

| URL | File | Purpose | Auth | Main data loaded |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Redirects to `/login` (middleware redirects first: `/dashboard` if signed in). | Public | — |
| `/login` | `app/(auth)/login/page.tsx` | Email/password + OAuth sign-in. | Public (signed-in users bounced to `/dashboard`) | — |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request a password reset email. | Public (signed-in bounced) | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | Set a new password using the recovery session. | Public | — |
| `/verify?email=` | `app/(auth)/verify/page.tsx` | Enter the 6-digit email OTP; redirects to `/register` if `email` missing. | Public (signed-in bounced) | — |
| `/register` | `app/register/page.tsx` | 7-step hospital registration wizard (starts at step 3 if already signed in without an account). | Public | `getAccountForUser`, `fetchActiveSpecialties` (`specialties`). |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth / email-link / password-recovery code exchange. | Public | `getAccountForUser`. |
| `/pending-approval` | `app/pending-approval/page.tsx` | Status screen for `pending` / `more_info_requested` / `rejected`; resubmit form for the latter two. | Session | `getAccountForUser`, `fetchHospitalRegistrationDetails` (`hospitals`), `fetchActiveSpecialties`. |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Welcome, shortcuts, stat cards (doctors, patients, cases), 5 most recent cases. | Approved hospital | `fetchAffiliatedDoctors`, `fetchPatientsForHospitalDoctors`, `fetchAssignmentsForHospitalDoctors`. |
| `/doctor-management` | `app/(dashboard)/doctor-management/page.tsx` | Searchable/paginated list of affiliated doctors. | Approved hospital | `fetchAffiliatedDoctors` (`doctor_hospital_affiliations`, `doctors`). |
| `/doctor-management/[doctorId]` | `app/(dashboard)/doctor-management/[doctorId]/page.tsx` | Read-only doctor profile, case stats, schedule. | Approved hospital | `fetchAffiliatedDoctorDetail`, `fetchDoctorCaseStatsForHospital`. |
| `/patient-management` | `app/(dashboard)/patient-management/page.tsx` | Patients with cases routed to the hospital's doctors. | Approved hospital | `fetchPatientsForHospitalDoctors` (`doctor_case_assignments`, `cases`, `patients`). |
| `/patient-management/[patientId]` | `app/(dashboard)/patient-management/[patientId]/page.tsx` | Clinical patient profile and their cases visible to the hospital. | Approved hospital | `fetchPatientDetailForHospital`, `fetchCasesForHospitalPatient`. |
| `/case-management?status=&range=` | `app/(dashboard)/case-management/page.tsx` | Case assignments with status tabs (All / Awaiting Patient / Treatment Confirmed / Completed / Declined) and date-range filter. | Approved hospital | `fetchAssignmentsForHospitalDoctors` (+ `hospital_treatment_plan_statuses` RPC). |
| `/case-management/[caseId]?assignmentId=` | `app/(dashboard)/case-management/[caseId]/page.tsx` | Case details: patient info, case summary, assigned doctor, treatment plan, visa letters section. | Approved hospital | `fetchHospitalAssignmentById` / `fetchAssignmentForHospitalCase`, `fetchCaseById`, `fetchTreatmentPlanStatusesForHospital`, `fetchHospitalGeneratedDocumentsForCase`, `fetchPatientForCase`, `fetchTreatmentPlanForCase`. |
| `/documents` | `app/(dashboard)/documents/page.tsx` | Generate / preview / download / send visa letters across all eligible cases. | Approved hospital | `fetchVisaEligibleCasesForHospital`, `fetchHospitalGeneratedDocumentsForCases` (`visa_documents`). |
| `/messages` | `app/(dashboard)/messages/page.tsx` | Conversation thread with MTA Admin. | Approved hospital | `fetchProviderThread`, `fetchProviderMessages`. |
| `/notifications` | `app/(dashboard)/notifications/page.tsx` | Full notification history. | Approved hospital | `fetchNotificationsForUser`. |
| `/account-settings?tab=` | `app/(dashboard)/account-settings/page.tsx` | Profile (basic info + hospital details), Security, Notifications tabs. | Approved hospital | `fetchHospitalAccountSettings`, `fetchActiveSpecialties`. |
| `GET /api/documents/[documentId]` | `app/api/documents/[documentId]/route.ts` | Streams a `case_documents` file (doctor-only check — see Notes). | Self-checked (middleware treats `/api` as public) | `doctors`, `case_documents`, `doctor_case_assignments`, `case-documents` bucket. |

---

## 4. File reference

### 4.1 Root configuration

| File | Description |
|---|---|
| `apps/hospital/package.json` | Package `hospital`; scripts and dependencies described in §1/§2. |
| `apps/hospital/.env.example` | Template of env variable names (§2.5). |
| `apps/hospital/next.config.ts` | Standalone output, workspace transpilation, Supabase public-storage image host (§2.2). |
| `apps/hospital/middleware.ts` | Exports `middleware` (calls `handleAuthMiddleware` from `@iha/db/middleware`) and `config.matcher` (§2.3). |
| `apps/hospital/tailwind.config.ts` | Tailwind config using the shared `@iha/config/tailwind.preset`; scans app, components and `packages/ui/src`. |
| `apps/hospital/postcss.config.mjs` | PostCSS with `tailwindcss` and `autoprefixer`. |
| `apps/hospital/eslint.config.mjs` | Re-exports `@iha/config/eslint-next`. |
| `apps/hospital/tsconfig.json` | Extends shared base tsconfig; `@/*` alias to app root. |

### 4.2 `app/` (root)

| File | Description |
|---|---|
| `apps/hospital/app/layout.tsx` | Root layout. Loads Geist / Geist Mono fonts as CSS variables, sets metadata (`MTA Hospital Portal`), wraps children in `<Providers>`. |
| `apps/hospital/app/providers.tsx` | Client component `Providers`: a `QueryClient` (60s `staleTime`), `NuqsAdapter` for URL state, and a global `sonner` `<Toaster>` (top-center, rich colors). |
| `apps/hospital/app/page.tsx` | `HomePage` — server `redirect('/login')` (normally pre-empted by middleware's `/` rule). |
| `apps/hospital/app/error.tsx` | Root error boundary (`GlobalError`): logs `[hospital:GlobalError]` with digest/message and shows a "Try again" button calling `reset()`. |
| `apps/hospital/app/not-found.tsx` | 404 page with a link back to `/dashboard`. |
| `apps/hospital/app/globals.css` | Global styles, phone-input CSS, `animate-nav-progress` utility, theme CSS variables (§2.4). |
| `apps/hospital/app/icon.png` | App favicon/icon (Next.js file-convention metadata). |

### 4.3 `app/(auth)/` — unauthenticated auth pages

| File | Description |
|---|---|
| `apps/hospital/app/(auth)/layout.tsx` | Wraps auth pages in `AuthShell` from `@iha/ui/auth` (split layout using `/auth-illustration.png`). |
| `apps/hospital/app/(auth)/error.tsx` | Error boundary for the auth group (`[hospital:AuthError]`), inline "Try again". |
| `apps/hospital/app/(auth)/login/page.tsx` | Renders `LoginPageClient`. |
| `apps/hospital/app/(auth)/forgot-password/page.tsx` | Renders `ForgotPasswordPageClient`. |
| `apps/hospital/app/(auth)/reset-password/page.tsx` | Renders `ResetPasswordPageClient`. |
| `apps/hospital/app/(auth)/verify/page.tsx` | Async server page; reads `searchParams.email`, redirects to `/register` if missing, otherwise renders `VerifyOtpPageClient` with the decoded email. |

### 4.4 `app/auth/` and `app/api/` — route handlers

| File | Description |
|---|---|
| `apps/hospital/app/auth/callback/route.ts` | **`GET /auth/callback?code=&next=`.** Origin = `NEXT_PUBLIC_APP_URL` or request origin. Missing code or failed `exchangeCodeForSession` → `302 /login?error=auth_callback`. Backfills `user_metadata.full_name` from OAuth identity data if absent (`auth.updateUser`). Unconfirmed email → `/verify?email=`. If `next` is provided (e.g. `/reset-password` from password recovery) → redirect there. Otherwise `getAccountForUser`: non-hospital account → `signOut()` then `/login`; no account → `/register`; approved → `/dashboard`; else `/pending-approval`. |
| `apps/hospital/app/api/documents/[documentId]/route.ts` | **`GET /api/documents/:documentId[?download=1]`.** Proxies a case document so the browser never sees the storage path. Checks: user (401), a `doctors` row for the user (403), `case_documents` row (404), an `invited`/`accepted` row in `doctor_case_assignments` for that doctor and case (404). Then `createCaseDocumentSignedUrl(file_path, 60)` (`@iha/db/cases`, `case-documents` bucket), fetches the file and streams it with `Content-Type`, `Content-Disposition` (`inline` or `attachment`) and `Cache-Control: private, no-store`. Errors: 500 (sign failure, logged), 502 (fetch failure). **Note:** written for doctors; a hospital user has no `doctors` row, so it always returns 403 here and nothing in this app calls it. |

### 4.5 `app/register/` and `app/pending-approval/`

| File | Description |
|---|---|
| `apps/hospital/app/register/page.tsx` | Server page. If signed in and an account exists, redirects to `/dashboard` (approved) or `/pending-approval`. Loads `fetchActiveSpecialties()` and renders `HospitalRegistrationWizard` with `initialStep = user ? 3 : 1` (signed-in user without a hospitals row skips Account/Verify) and `userId`. |
| `apps/hospital/app/pending-approval/layout.tsx` | Wraps the page in `AuthShell` with `contentClassName="w-full max-w-2xl"`. |
| `apps/hospital/app/pending-approval/page.tsx` | Server page. Requires user; no account → `/register`; approved → `/dashboard`. Shows copy per status (`pending`, `more_info_requested`, `rejected`) and the admin note (`rejection_reason` or `more_info_message`). For `rejected`/`more_info_requested`, loads `fetchHospitalRegistrationDetails` + `fetchActiveSpecialties` and renders `HospitalResubmitForm`. Includes a "Log out" form bound to the `signOut` server action. |

### 4.6 `app/(dashboard)/` — authenticated, approved-hospital area

| File | Description |
|---|---|
| `apps/hospital/app/(dashboard)/layout.tsx` | Gatekeeper and shell. Uses cached `getAuthUser()`; redirects: no user → `/login`; unverified → `/verify`; no account → `/register`; non-hospital role → `signOut()` + `/login` (avoids a redirect loop with middleware); not approved → `/pending-approval`. Loads the provider thread + unread message count (`fetchProviderThread`, `fetchUnreadProviderMessageCount`), and notifications + unread count (`fetchNotificationsForUser`, `fetchUnreadNotificationCount`). Renders `NavigationProgressProvider` → `DashboardShell` with the first 5 notifications. |
| `apps/hospital/app/(dashboard)/error.tsx` | Dashboard-group error boundary (`[hospital:DashboardError]`). |
| `apps/hospital/app/(dashboard)/dashboard/page.tsx` | Dashboard. Local `StatCard` component. Parallel-loads affiliated doctors, patients and assignments; shows 3 nav cards, 3 stats (doctor count, patient count, distinct case count) and a "Recent Cases" table (first 5 assignments, `CaseRowStatusBadge`, View link to `/case-management/:caseId?assignmentId=`). |
| `apps/hospital/app/(dashboard)/dashboard/loading.tsx` | Skeleton for the dashboard. |
| `apps/hospital/app/(dashboard)/doctor-management/page.tsx` | Lists affiliated doctors via `fetchAffiliatedDoctors`; shows an inline error string on failure, else `DoctorManagementTable`. |
| `apps/hospital/app/(dashboard)/doctor-management/loading.tsx` | Table skeleton. |
| `apps/hospital/app/(dashboard)/doctor-management/[doctorId]/page.tsx` | Doctor detail. `fetchAffiliatedDoctorDetail` (404 via `notFound()` if not affiliated) and `fetchDoctorCaseStatsForHospital`. Renders header with `DoctorStatusBadge`, total/active/completed stats, personal, professional (specialties, AHPRA licence, affiliations), additional (languages, bio) and weekly schedule cards. Uses label maps from `lib/validations/doctor-registration.ts` and `lib/validations/account-settings.ts`; local `TIME_LABELS` converts `HH:MM` to 12-hour labels. |
| `apps/hospital/app/(dashboard)/doctor-management/[doctorId]/loading.tsx` | Detail skeleton. |
| `apps/hospital/app/(dashboard)/patient-management/page.tsx` | Lists patients via `fetchPatientsForHospitalDoctors`; error string or `PatientManagementTable`. |
| `apps/hospital/app/(dashboard)/patient-management/loading.tsx` | Table skeleton. |
| `apps/hospital/app/(dashboard)/patient-management/[patientId]/page.tsx` | Patient detail (clinical data only — DOB, gender, country, medical history, allergies, medications, past surgeries) via `fetchPatientDetailForHospital` (RLS-scoped; `notFound()` if invisible) and the patient's visible cases via `fetchCasesForHospitalPatient` with `CaseStatusBadge` and links to `/case-management/:id` (no `assignmentId`). |
| `apps/hospital/app/(dashboard)/patient-management/[patientId]/loading.tsx` | Detail skeleton. |
| `apps/hospital/app/(dashboard)/case-management/page.tsx` | Case list. Defines `TABS`, `TREATMENT_CONFIRMED_STATUSES` (`payment_confirmed`, `visa_documents_submitted`, `visa_processing`, `travel_ready`), `matchesStatusTab()` (Declined = plan `rejected_by_iha`, assignment `cancelled`, or case `visa_rejected`), `RANGES` (all/7/30/90 days, filtered on `cases.created_at`) and `buildHref()`. Filters in memory and renders `CaseTabs`, `CaseAssignmentsTable` (doctor column, `viewHrefDisambiguateAssignment`) and `CaseDateFilter` from `@iha/ui`. |
| `apps/hospital/app/(dashboard)/case-management/loading.tsx` | Tabs + table skeleton. |
| `apps/hospital/app/(dashboard)/case-management/[caseId]/page.tsx` | Case detail. Picks the assignment by `?assignmentId=` (must match `caseId`) else falls back to `fetchAssignmentForHospitalCase` (confirmed-plan doctor, else latest invited); `notFound()` if none. Loads case, plan statuses (RPC `hospital_treatment_plan_statuses`), visa letters, patient, and the doctor's treatment plan (errors logged). Renders status badge (`CaseRowStatusBadge` incl. plan status), patient info, case summary, `TreatmentPlanSummary`, and `VisaLettersSection` only when case status ∈ `VISA_ELIGIBLE_STATUSES` **and** plan status is `patient_confirmed`. |
| `apps/hospital/app/(dashboard)/case-management/[caseId]/loading.tsx` | Detail skeleton. |
| `apps/hospital/app/(dashboard)/documents/page.tsx` | Documents hub. `fetchVisaEligibleCasesForHospital` → `fetchHospitalGeneratedDocumentsForCases(caseIds)` (`visa_documents`), grouped into a `Map<caseId, docs[]>`; empty-state copy or `DocumentsTable`. |
| `apps/hospital/app/(dashboard)/documents/loading.tsx` | Table skeleton. |
| `apps/hospital/app/(dashboard)/messages/page.tsx` | Loads the account's provider thread (`fetchProviderThread(role, id)`) and its messages; renders `ProviderMessageThread` from `@iha/ui` wired to `sendProviderMessageAction`, `markProviderMessagesReadAction`, `requestProviderThreadReopenAction`. Renders nothing below the header if no thread exists. |
| `apps/hospital/app/(dashboard)/messages/loading.tsx` | Chat bubble skeleton. |
| `apps/hospital/app/(dashboard)/notifications/page.tsx` | Loads `fetchNotificationsForUser(user.id)` and renders `NotificationsList`. |
| `apps/hospital/app/(dashboard)/notifications/loading.tsx` | List skeleton. |
| `apps/hospital/app/(dashboard)/account-settings/page.tsx` | Loads `fetchHospitalAccountSettings(user.id)` and `fetchActiveSpecialties()`; renders `HospitalAccountSettingsClient` with the login email. |
| `apps/hospital/app/(dashboard)/account-settings/loading.tsx` | Form skeleton. |

### 4.7 `components/`

| File | Description |
|---|---|
| `apps/hospital/components/.gitkeep` | Placeholder (empty). |

**`components/auth/`** — thin client wrappers binding `@iha/ui/auth` forms to server actions.

| File | Description |
|---|---|
| `apps/hospital/components/auth/login-page-client.tsx` | `LoginPageClient`: `LoginForm` → `signInWithEmail`; on `/verify` redirect shows `EMAIL_NOT_CONFIRMED_MESSAGE` toast; `router.push(redirectTo)` + `refresh()`. OAuth buttons call `signInWithOAuth`. |
| `apps/hospital/components/auth/forgot-password-page-client.tsx` | `ForgotPasswordPageClient`: `ForgotPasswordForm` → `requestPasswordReset`. |
| `apps/hospital/components/auth/reset-password-page-client.tsx` | `ResetPasswordPageClient`: `ResetPasswordForm` → `resetPassword`, success toast and redirect to `/login`; "Back to login" calls `signOut`. |
| `apps/hospital/components/auth/verify-otp-page-client.tsx` | `VerifyOtpPageClient({ email })`: `VerifyOtpForm` → `verifyOtp` (then redirect) and `resendVerificationOtp` (propagates `rateLimited`). |

**`components/registration/`**

| File | Description |
|---|---|
| `apps/hospital/components/registration/hospital-registration-wizard.tsx` | `HospitalRegistrationWizard({ initialStep, userId, specialties })`. 7 steps in `WizardLayout`: 1 Account (`AccountStep` → `signUpForRegistration(values,'hospital')`), 2 Verify Email, 3 Basic Information, 4 Location, 5 Hospital Details, 6 Document (requires `userId`, uploads under `<userId>/`), 7 Agreement (`AgreementStep` → `submitHospitalRegistration`, which merges licence + registration certificate + other docs into `certificates`). Persists `{ step, draft, userId, email }` to sessionStorage (`hospital-draft:hospital-registration-wizard`) and restores it before mounting step forms; clears on success and navigates to the returned `redirectTo`. |
| `apps/hospital/components/registration/verify-email-step.tsx` | `VerifyEmailStep({ email, onNext })`: in-wizard OTP step using `VerifyOtpForm`, `verifyOtp` and `resendVerificationOtp`; establishes the real session needed for uploads and the `register_hospital` RPC, then advances instead of navigating. |
| `apps/hospital/components/registration/hospital-basic-info-step.tsx` | `HospitalBasicInfoStep`: RHF form for name, registration number, ABN, phone (`PhoneInput`) validated by `hospitalBasicInfoStepSchema`. |
| `apps/hospital/components/registration/hospital-location-step.tsx` | `HospitalLocationStep`: country `Select` (from `react-phone-number-input` country list, English names), city/state, address, zip code; `hospitalLocationStepSchema`. |
| `apps/hospital/components/registration/hospital-details-step.tsx` | `HospitalDetailsStep`: hospital type (multi/single specialty), specialties (`MultiSelectDropdown` of active specialties), bed count, room types (`TagInput`), licence number, accreditation body; `hospitalDetailsStepSchema`. |
| `apps/hospital/components/registration/hospital-documents-step.tsx` | `HospitalDocumentsStep({ uploadPathPrefix })`: three `DocumentUploadField`s writing to the `registration-documents` bucket — hospital licence (`license`, 1 file), registration certificate (`registration_certificate`, 1 file), other documents (`other`, many); `hospitalDocumentsStepSchema`. |
| `apps/hospital/components/registration/hospital-resubmit-form.tsx` | `HospitalResubmitForm({ hospitalId, userId, defaultValues, specialties })`: single-page form over the full `hospitalRegistrationSchema` (all fields plus a `certificates` `DocumentUploadField`) prefilled with current values; submits `resubmitHospitalRegistration` and refreshes. Comment notes it is a stand-in for a future "Module 02" profile edit form. |

**`components/layout/`**

| File | Description |
|---|---|
| `apps/hospital/components/layout/dashboard-shell.tsx` | `DashboardShell`: client shell wrapped in `NotificationsChannelProvider` (realtime notifications for `userId`). Collapsible desktop sidebar and mobile overlay with nav items (Dashboard, Doctor/Patient/Case Management, Documents, Messages with unread badge, Account & Settings), `LinkProgressReporter` per link, header with `NotificationBell`, avatar initial, display name, role, and a sign-out confirmation modal posting to `signOut`. Uses `/logo.png`. |

**`components/notifications/`**

| File | Description |
|---|---|
| `apps/hospital/components/notifications/notification-bell.tsx` | `NotificationBell({ initialNotifications })`: subscribes via `useNotificationsChannel()` to new rows (prepends, keeps 5, shows a custom toast with "View" → `/case-management/:caseId[?assignmentId=]`). Mobile: link to `/notifications`; desktop: dropdown with `NotificationRow`s, click-outside close, "Mark all as read" (`markAllNotificationsAsRead`), per-item read (`markNotificationAsRead`) and navigation. |
| `apps/hospital/components/notifications/notifications-list.tsx` | `NotificationsList`: full-page list with realtime prepend, per-item mark-read + navigation, "Mark all as read", empty state. |

**`components/cases/`**

| File | Description |
|---|---|
| `apps/hospital/components/cases/visa-letters-section.tsx` | `VisaLettersSection({ caseId, documents })`: server-renderable card mapping existing `visa_documents` by `category` to two `LetterCard`s (`hospital_invitation`, `appointment_confirmation`). |
| `apps/hospital/components/cases/letter-card.tsx` | `LetterCard`: per-letter card using `useHospitalLetter` — Generate button, generated date, inline iframe preview toggle, Download, and "Send to Patient" with a confirmation dialog (or "Sent to patient on …"). |
| `apps/hospital/components/cases/use-hospital-letter.ts` | Hook `useHospitalLetter(caseId, documentType, label, initialDocument)` shared by `LetterCard` and `DocumentStatusCell`: `generate()` → `generateHospitalVisaDocumentAction` (optimistically constructs the doc record), `loadPreviewUrl()`/`download()` → `generateHospitalLetterSignedUrlAction(file_path)`, `send()` → `sendVisaDocumentToPatientAction`; exposes loading flags. |
| `apps/hospital/components/cases/case-assignment-actions.tsx` | `CaseAssignmentActions`: Accept/Decline (optional reason) for `invited`, Withdraw for `accepted`, via `respondToCaseAssignmentAction`. **Not referenced anywhere in this app** (doctor-side leftover). |
| `apps/hospital/components/cases/request-additional-info-dialog.tsx` | `RequestAdditionalInfoDialog({ caseId })`: checklist of document types + message, composes text and calls `requestAdditionalInfoAction`. **Unused in this app.** |
| `apps/hospital/components/cases/assignment-status-badge.tsx` | `AssignmentStatusBadge({ status })`: coloured pill for `invited/accepted/declined/withdrawn`. **Unused in this app.** |

**`components/doctor-management/`**

| File | Description |
|---|---|
| `apps/hospital/components/doctor-management/doctor-management-table.tsx` | `DoctorManagementTable({ doctors })`: client-side search (name, specialty, department), pagination (15/page), columns Name / Specialties / Department-Role / Contact / Experience / Status / Action (→ `/doctor-management/:id`). |
| `apps/hospital/components/doctor-management/doctor-status-badge.tsx` | `DoctorStatusBadge({ status })`: pill for `pending/approved/rejected/more_info_requested`. |

**`components/patient-management/`**

| File | Description |
|---|---|
| `apps/hospital/components/patient-management/patient-management-table.tsx` | `PatientManagementTable({ patients })`: search (name or latest case ref), pagination (15/page), columns Name / Date of Birth / Gender / Country / Cases / Latest Case (link to `/case-management/:latestCaseId`) / Action (→ `/patient-management/:id`). |

**`components/documents/`**

| File | Description |
|---|---|
| `apps/hospital/components/documents/documents-table.tsx` | `DocumentsTable({ cases, documentsByCase })`: search (patient or case ID), pagination (15/page), columns Case ID (link to case detail with `assignmentId`) / Patient / Status (`CaseStatusBadge`) / one `DocumentStatusCell` per letter type. |
| `apps/hospital/components/documents/document-status-cell.tsx` | `DocumentStatusCell`: compact version of `LetterCard` using `useHospitalLetter` — "Generate" button or Generated/Sent pill with date and icon actions (preview in a modal dialog, download, send with confirmation). |

**`components/account-settings/`**

| File | Description |
|---|---|
| `apps/hospital/components/account-settings/hospital-account-settings-client.tsx` | `HospitalAccountSettingsClient`: tabbed page (Profile / Security / Notifications) with tab in `?tab=` via `nuqs` `useQueryState` (shallow); mobile dropdown nav. Profile renders `HospitalBasicInfoCard` + `HospitalDetailsCard`; Security renders shared `SecurityTab` from `@iha/ui`; Notifications renders `HospitalNotificationsTab`. |
| `apps/hospital/components/account-settings/hospital-basic-info-card.tsx` | `HospitalBasicInfoCard`: view/edit card for name, registration number, ABN, phone, address, city, country, zip; email shown read-only. Submits `updateHospitalBasicInfo` (schema `hospitalAccountBasicInfoSchema`). |
| `apps/hospital/components/account-settings/hospital-details-card.tsx` | `HospitalDetailsCard`: view/edit for hospital type, specialties, bed count, room types, licence number, accreditation body; submits `updateHospitalDetails`. |
| `apps/hospital/components/account-settings/hospital-notifications-tab.tsx` | `HospitalNotificationsTab`: email/SMS `ToggleSwitch`es that immediately call `updateHospitalNotificationPreferences`; reverts to initial values on error. |

### 4.8 `hooks/`

| File | Description |
|---|---|
| `apps/hospital/hooks/.gitkeep` | Placeholder; no custom hooks live here (the only hook is `components/cases/use-hospital-letter.ts`). |

### 4.9 `lib/auth/`

| File | Description |
|---|---|
| `apps/hospital/lib/auth/account.ts` | Exports `Account` (discriminated union `role: 'hospital' \| 'doctor'` with `id`, `displayName`, `status`, `rejectionReason`, `moreInfoMessage`) and `getAccountForUser(userId)`: queries `hospitals` by `user_id`, then `doctors`; returns `null` if neither. Not memoised — called several times per request. |
| `apps/hospital/lib/auth/constants.ts` | User-facing auth strings: `INVALID_CREDENTIALS_MESSAGE`, `GENERIC_AUTH_ERROR`, `EMAIL_ALREADY_REGISTERED_MESSAGE`, `VERIFY_EMAIL_MESSAGE`, `EMAIL_NOT_CONFIRMED_MESSAGE`. |

### 4.10 `lib/actions/` — server actions (`'use server'`)

All return `Result<T>` (`{ data, error }`) unless noted, and write audit events through `logAuditEvent` (`log_audit_event` RPC) with `app: 'hospital'`.

| File | Exports and behaviour |
|---|---|
| `apps/hospital/lib/actions/auth.ts` | `postAuthRedirect(userId)` → `/register` (no account), `/login` after `signOut()` (non-hospital), `/dashboard` (approved) or `/pending-approval`. `signInWithEmail` — validates `loginSchema`, `signInWithPassword`; on error logs `auth.login_failed` and returns `/verify?email=` for `email_not_confirmed` or the generic invalid-credentials message; then rejects (signs out, same generic message) a doctor account or any other-role account found by `findOtherRoleAccount(supabase, id, ['hospital','doctor'])`; logs `auth.login_succeeded`. `verifyOtp` — `auth.verifyOtp({type:'email'})`, logs `auth.email_verified`. `resendVerificationOtp(email)` — `auth.resend({type:'signup'})`, flags `rateLimited` on `over_email_send_rate_limit`. `requestPasswordReset` — `resetPasswordForEmail` with redirect `/auth/callback?next=/reset-password` (always succeeds to avoid enumeration). `resetPassword` — `updateUser({password})`, then signs out and returns `/login`. `signInWithOAuth(provider)` — redirects to the provider URL (callback `/auth/callback`). `signOut()` — audit `auth.logout`, sign out, redirect `/login`. |
| `apps/hospital/lib/actions/registration.ts` | `signUpForRegistration(values, 'hospital')` — validates `registrationAccountStepSchema`; checks `checkEmailAlreadyRegistered` (service-role `email_already_registered` RPC) to defeat GoTrue's silent duplicate signup; `auth.signUp` with `options.data.role='hospital'` (so the patient-creation trigger skips) and `emailRedirectTo /auth/callback`. `submitHospitalRegistration(values)` — validates `hospitalRegistrationSchema`, re-verifies every uploaded file against Storage metadata (`getStorageObjectMeta` on `registration-documents`: extension, real MIME in PDF/JPEG/PNG/DOC/DOCX, ≤10 MB), calls RPC **`register_hospital`** (contact email forced to the login email), syncs `full_name` to auth metadata, audits `registration.hospital_submitted`, returns `postAuthRedirect`. `resubmitHospitalRegistration(hospitalId, values)` — same validation, RPC **`resubmit_hospital_registration`**, audit `registration.resubmitted`. |
| `apps/hospital/lib/actions/account-settings.ts` | `updateHospitalBasicInfo` (RPC **`update_hospital_basic_info`**, contact email = login email; audit `hospital.profile_updated`), `updateHospitalDetails` (RPC **`update_hospital_details`**; audit `hospital.details_updated`), `updateHospitalNotificationPreferences` (direct update of `hospitals.email_notifications_enabled` / `sms_notifications_enabled`; audit `hospital.notification_preferences_updated`). All revalidate `/account-settings`. RPC signatures are hand-typed via `AccountSettingsRpcClient` because generated DB types lag the migrations. |
| `apps/hospital/lib/actions/visa-documents.ts` | `generateHospitalVisaDocumentAction(caseId, documentType)` — requires a hospital account; loads assignment (`fetchAssignmentForHospitalCase`), case, letterhead (`fetchHospitalById`), patient and treatment plan; builds the PDF via `lib/pdf/case-letters.ts`; uploads to `visa-documents` bucket at `hospital-generated/<caseId>/<type>.pdf` (`upsert: true`); records it via `recordGeneratedVisaDocument` (RPC **`generate_hospital_visa_document`**; error codes `unauthorized`, `plan_not_selected`, `case_not_payment_confirmed`, `invalid_document_type` mapped to messages); audit `visa_document.generated`; revalidates case detail and `/documents`. `sendVisaDocumentToPatientAction(documentId, caseId)` — `markVisaDocumentSentToPatient` (RPC **`send_visa_document_to_patient`**), looks up the patient's `user_id` in `patients` and inserts a `visa_document_available` row via `insertNotification`; audit `visa_document.sent_to_patient`. `generateHospitalLetterSignedUrlAction(filePath)` — 1-hour signed URL from `visa-documents` (`createVisaDocumentSignedUrl`, user-scoped client so Storage RLS applies). |
| `apps/hospital/lib/actions/messages.ts` | `sendProviderMessageAction(threadId, body)` (`messageBodySchema`, `sendProviderMessage` → `provider_messages`; audit `provider_message.sent`), `markProviderMessagesReadAction(threadId)` (returns void), `requestProviderThreadReopenAction(threadId, reason)` (`requestProviderThreadReopen` → `provider_message_threads`; audit `provider_message.reopen_requested`). All revalidate `/messages`. |
| `apps/hospital/lib/actions/notifications.ts` | `markNotificationAsRead(id)` and `markAllNotificationsAsRead()` → `markNotificationRead` / `markAllNotificationsRead` on `notifications`; return `{ error }`; revalidate `/notifications`. |
| `apps/hospital/lib/actions/cases.ts` | `respondToCaseAssignmentAction` (RPC `respond_to_case_assignment`), `requestAdditionalInfoAction` (RPC `request_case_additional_info` + `dispatchCaseStatusAlerts(…,'additional_info_requested')`), `startCaseEvaluationAction` (RPC `start_case_evaluation`), `markCaseCompletedAction` (RPC `mark_case_completed` + alerts). Map RPC error codes to messages, audit, and revalidate `/cases`, `/cases/:id`, `/dashboard`. **Doctor-workflow actions carried over from when doctors used this app — only referenced by the two unused components; the `/cases` paths do not exist here.** |

### 4.11 `lib/data/` — server-side read helpers

| File | Description |
|---|---|
| `apps/hospital/lib/data/doctor-management.ts` | `fetchAffiliatedDoctorIds(hospitalId)` (from `doctor_hospital_affiliations` — the scoping filter for doctor/patient/case lists). `fetchAffiliatedDoctors` (→ `AffiliatedDoctor[]` from `doctors`, ordered by name). `fetchAffiliatedDoctorDetail(hospitalId, doctorId)` (re-checks affiliation; loads profile, all affiliations with hospital names, and `availability_schedule` or a schedule derived from `working_days`). `fetchDoctorCaseStatsForHospital(doctorId)` (counts `doctor_case_assignments` visible under hospital RLS; active = total − completed). |
| `apps/hospital/lib/data/case-management.ts` | `VISA_ELIGIBLE_STATUSES` (`payment_confirmed`, `visa_documents_submitted`, `visa_processing`, `travel_ready`, `completed`). Types `AssignmentWithCaseAndDoctor`, `VisaEligibleCase`. `fetchAssignmentsForHospitalDoctors(hospitalId)` — `doctor_case_assignments` for affiliated doctors with embedded `cases(…, patients(full_name))` and `doctors(full_name)`, ordered by `invited_at` desc, each annotated with `treatmentPlanStatus` from RPC `hospital_treatment_plan_statuses`. `fetchAssignmentForHospitalCase(caseId)` — prefers the assignment whose `treatment_plans.status = 'patient_confirmed'`, else latest. `fetchHospitalAssignmentById(assignmentId)`. `fetchVisaEligibleCasesForHospital(hospitalId)` — one row per case with eligible status and confirmed plan. |
| `apps/hospital/lib/data/patient-management.ts` | `fetchPatientsForHospitalDoctors(hospitalId)` — aggregates assignments → cases per patient (case count, latest case), then loads `patients` rows; sorted by name. `fetchPatientDetailForHospital(patientId)` — clinical fields only (no contact details), RLS-scoped. `fetchCasesForHospitalPatient(patientId, hospitalId)` — `cases` with embedded assignments/doctors, choosing the doctor with the confirmed plan. |
| `apps/hospital/lib/data/account-settings.ts` | `deriveAvailabilityFromWorkingDays(workingDays)` (maps `mon…sun` codes to full-day `AvailabilityDay[]`, 09:00–17:00). Type `HospitalAccountSettings` and `fetchHospitalAccountSettings(userId)` (from `hospitals`). |
| `apps/hospital/lib/data/registration-details.ts` | `fetchHospitalRegistrationDetails(userId)` — returns `{ id, values: HospitalRegistrationInput }` from `hospitals`, used to prefill the resubmit form. |
| `apps/hospital/lib/data/hospitals.ts` | `fetchHospitalById(hospitalId)` → `HospitalLetterheadInfo` (letterhead fields from `hospitals`). Also `fetchHospitalOptions()` and `fetchHospitalOptionsForDoctor(doctorId)` (doctor-registration/treatment-plan helpers), which are **unused in this app**. |

### 4.12 `lib/pdf/`

| File | Description |
|---|---|
| `apps/hospital/lib/pdf/case-letters.ts` | Type `CaseLetterInput` and two `pdf-lib` builders returning `Uint8Array`: `buildHospitalInvitationLetterPdf` ("To Whom It May Concern", patient/doctor/diagnosis/admission date/length of stay table, visa request paragraph) and `buildAppointmentConfirmationLetterPdf` ("Dear <patient>", department/procedure/admission/completion dates, arrival instructions). Shared A4 letterhead (hospital name, right-aligned contact lines, date), word-wrapping paragraph helper, signature block and footer with case reference. Uses Helvetica standard fonts only (non-WinAnsi characters in names would fail to encode). |

### 4.13 `lib/validations/`

| File | Description |
|---|---|
| `apps/hospital/lib/validations/hospital-registration.ts` | `UploadedFileMeta`, `fileMetaSchema`, `documentCategories`, `hospitalTypes` + labels; step schemas `hospitalBasicInfoStepSchema` (name, registration number 4–20 alnum/hyphen, ABN with modulus-89 checksum `isValidAbn`, phone via `isValidPhone`), `hospitalLocationStepSchema`, `hospitalDetailsStepSchema`, `hospitalDocumentsStepSchema`; combined `hospitalRegistrationSchema` (+ `certificates` ≥1) and `HospitalRegistrationInput`. |
| `apps/hospital/lib/validations/account-settings.ts` | Doctor display constants (`doctorGenders`/labels, `availabilityDays`/labels, `availabilityDaySchema`, `AvailabilityDay`) used by Doctor Management; hospital schemas `hospitalAccountBasicInfoSchema` (basic + location), `hospitalAccountDetailsSchema`, `hospitalNotificationPreferencesSchema` and their input types. |
| `apps/hospital/lib/validations/doctor-registration.ts` | Doctor registration schemas (`doctorRoles`/labels, `workingDays`/labels, step schemas incl. AHPRA licence regex, `doctorRegistrationSchema`). Only `doctorRoleLabels`, `doctorRoles` and `workingDays` are used here (doctor detail page, availability derivation); the schemas are leftovers. |

### 4.14 Other `lib/`, `types/`, `public/`

| File | Description |
|---|---|
| `apps/hospital/lib/draft-storage.ts` | `loadDraft<T>(name)`, `saveDraft(name, value)`, `clearDraft(name)` — sessionStorage helpers with prefix `hospital-draft:`, SSR-safe, drop corrupt JSON. |
| `apps/hospital/types/index.ts` | String-union types `CaseStatus`, `AssignmentStatus`, `MessageThreadStatus`, `SenderType`, `HospitalDoctorStatus`, `AccountRole`, `TreatmentPlanStatus`. Only `HospitalDoctorStatus` (account.ts) and `AssignmentStatus` (unused component) are imported; `CaseStatus` is stale (lacks `visa_documents_submitted`, `visa_rejected`). |
| `apps/hospital/public/` (`logo.png`, `auth-illustration.png`) | Static assets: the MTA logo used in the dashboard sidebar, and the illustration rendered by `@iha/ui`'s auth sidebar (`AuthShell`). |

---

## 5. Key flows

### 5.1 Registration → pending approval → approval/resubmission

1. Visitor opens `/register` (`app/register/page.tsx`); with no session the wizard starts at step 1.
2. **Account** (`AccountStep`) → `signUpForRegistration` (`lib/actions/registration.ts`): duplicate-email check via service-role RPC, then `auth.signUp` with `role: 'hospital'`. Supabase emails an OTP.
3. **Verify Email** (`verify-email-step.tsx`) → `verifyOtp`, which creates a live session (needed for Storage RLS and the RPC's `auth.uid()` guard). Its returned `redirectTo` is ignored; the wizard advances.
4. Steps 3–5 collect basic info, location, hospital details (validated client-side by the step schemas). Step 6 uploads files directly from the browser to `registration-documents/<userId>/…` via `DocumentUploadField`. Wizard state is mirrored to sessionStorage after every change so a refresh resumes at the same step.
5. **Agreement** → `submitHospitalRegistration`: server re-validates the full schema, verifies each file's real MIME/size from Storage, calls `register_hospital` (creates the `hospitals` row with `status = 'pending'`), syncs `full_name`, audits, and returns `postAuthRedirect` → `/pending-approval`.
6. `/pending-approval` shows "under review". When MTA Admin (admin app) sets `more_info_requested` or `rejected`, the page shows the note and `HospitalResubmitForm`; submitting calls `resubmit_hospital_registration` and refreshes.
7. Once admin sets `approved`, the `(dashboard)` layout lets the user through; `/pending-approval` itself redirects to `/dashboard`.
8. A signed-in user without a `hospitals` row (e.g. abandoned mid-wizard in another tab, or OAuth signup) is routed to `/register`, which starts at step 3.

### 5.2 Login / OTP / password reset / OAuth

- **Email login:** `LoginPageClient` → `signInWithEmail`. Unconfirmed email → toast + `/verify?email=`. Wrong password, doctor account, or patient/lawyer account (detected by `findOtherRoleAccount`) → generic "Invalid email or password" (other roles are signed out first). Success → `postAuthRedirect` (`/register`, `/pending-approval` or `/dashboard`).
- **OTP:** `/verify` → `VerifyOtpPageClient` → `verifyOtp` → `postAuthRedirect`; resend via `resendVerificationOtp` with rate-limit flag.
- **Forgot/reset:** `requestPasswordReset` emails a link to `/auth/callback?next=/reset-password`; the callback exchanges the code and redirects to `/reset-password`; `resetPassword` updates the password, signs out and sends the user to `/login`.
- **OAuth:** `signInWithOAuth(provider)` → provider → `/auth/callback` → name backfill → role/approval-based redirect (non-hospitals signed out).
- **Guards:** middleware enforces session + verified email; `(dashboard)/layout.tsx` enforces hospital role and approval.

### 5.3 Case management

1. Visibility is driven by data, not by hospital actions: a doctor affiliated with the hospital (`doctor_hospital_affiliations`) gets a case assigned by admin and submits a treatment plan naming this hospital. Hospital-scoped RLS (migration `20260730060000`, `hospital_has_access_to_assignment`) only exposes assignments/patients once that plan leaves draft.
2. `/case-management` (`fetchAssignmentsForHospitalDoctors`) loads all such assignments and annotates each with its plan status from `hospital_treatment_plan_statuses`; tabs bucket them into Awaiting Patient, Treatment Confirmed, Completed or Declined; a date filter applies to `cases.created_at`.
3. "View" links include `?assignmentId=` because one case can be routed to two of the hospital's doctors in parallel. Entry points without it (notifications, patient detail) fall back to the confirmed-plan assignment.
4. The detail page shows patient clinical info, the case summary, the assigned doctor and the read-only `TreatmentPlanSummary`. The hospital has **no workflow actions** on the case (accept/decline/evaluate/complete are doctor-side); its only write action is generating visa letters.

### 5.4 Assigning doctors / doctor management

- The hospital **does not assign doctors** in this app. Doctors choose hospital affiliations during their own registration (doctor app), and MTA Admin assigns cases to doctors. The hospital portal is read-only for doctors.
- `/doctor-management` lists `doctors` whose ids appear in `doctor_hospital_affiliations` for this hospital (any approval status, shown via `DoctorStatusBadge`). The detail page re-checks affiliation, then shows the profile, other affiliations, case stats (RLS-limited to cases with a plan naming this hospital) and the weekly schedule (stored schedule, or one derived from registration working days).

### 5.5 Patient management

- `/patient-management` aggregates patients from assignments of affiliated doctors (one row per patient, with case count and latest case).
- `/patient-management/[patientId]` reads `patients` (clinical fields only — contact details are intentionally excluded) and the cases visible under RLS; each case links to the case detail page.

### 5.6 Documents (visa letters)

1. A case becomes eligible when its status is in `VISA_ELIGIBLE_STATUSES` and this hospital's doctor's plan is `patient_confirmed` (the patient selected this hospital and paid).
2. From `/documents` (`DocumentStatusCell`) or the case detail (`LetterCard`), **Generate** → `generateHospitalVisaDocumentAction`: builds the PDF with `pdf-lib`, uploads to `visa-documents/hospital-generated/<caseId>/<type>.pdf` (upsert, so regenerating overwrites), and records it through `generate_hospital_visa_document` (which enforces authorisation, confirmed-plan and payment status server-side).
3. **Preview/Download** → `generateHospitalLetterSignedUrlAction` → 1-hour signed URL (iframe preview or `<a download>`).
4. **Send to Patient** → `sendVisaDocumentToPatientAction`: `send_visa_document_to_patient` marks it sent, then an in-portal `visa_document_available` notification is inserted for the patient's user.

### 5.7 Messaging (with MTA Admin)

- Each provider account has one thread in `provider_message_threads` (looked up by role + account id). The layout computes the unread count for the sidebar badge.
- `/messages` renders `@iha/ui`'s `ProviderMessageThread` with the three server actions in `lib/actions/messages.ts` (send, mark read, request reopen of a closed thread with a reason). If no thread row exists yet, the page shows only the header.

### 5.8 Notifications

- The layout pre-loads the latest notifications and unread count; `DashboardShell` mounts `NotificationsChannelProvider` (Supabase realtime on `notifications` for the user).
- `NotificationBell` (header) and `NotificationsList` (`/notifications`) subscribe to new rows, show toasts, mark items read (`markNotificationAsRead`/`markAllNotificationsAsRead`) and deep-link to `/case-management/:caseId[?assignmentId=]`.
- Email/SMS preferences for the hospital are toggled in Account & Settings → Notifications (`hospitals.email_notifications_enabled` / `sms_notifications_enabled`); actual delivery happens in `@iha/db` / `@iha/notifications` code triggered by other apps' events.

### 5.9 Account settings

- `/account-settings?tab=profile|security|notifications`. Profile cards call `update_hospital_basic_info` / `update_hospital_details` RPCs (validated with the same step schemas as registration; contact email is always the login email). Security is the shared `SecurityTab` (password change). Notifications toggles save immediately.

---

## 6. Notes — patterns, TODOs and potential issues

**Patterns**

- **Server-first pages.** Every page is an async server component that re-checks the user/account and loads data in parallel with `Promise.all`; client components receive plain props and call server actions, followed by `router.refresh()` or `revalidatePath`.
- **Uniform `Result<T>` actions** with Zod validation, RPC error-code → friendly-message maps, structured logging (`createLogger('hospital:…')`) and audit events on every mutation.
- **RLS-centric authorisation.** Most hospital scoping is enforced by Postgres RLS / SECURITY DEFINER RPCs (`register_hospital`, `generate_hospital_visa_document`, `send_visa_document_to_patient`, `hospital_treatment_plan_statuses`); the app adds explicit affiliation filtering on top for lists.
- **No patient IDs in storage URLs** (route-handler proxy pattern) and server-side re-verification of uploaded file metadata.
- **Redirect-loop avoidance:** non-hospital accounts are always signed out before being sent to `/login` (layout, callback, `postAuthRedirect`).

**Potential issues / leftovers**

1. **`app/api/documents/[documentId]/route.ts` is doctor-only.** It requires a `doctors` row and a doctor assignment, so it always returns 403 for hospital users, and nothing in this app calls it. Likely copied from `apps/doctor`; remove it or rewrite it for hospital access.
2. **Dead doctor-workflow code:** `lib/actions/cases.ts`, `components/cases/case-assignment-actions.tsx`, `components/cases/request-additional-info-dialog.tsx`, `components/cases/assignment-status-badge.tsx`, `fetchHospitalOptions*` in `lib/data/hospitals.ts`, most of `lib/validations/doctor-registration.ts`, and most of `types/index.ts` are not used. `lib/actions/cases.ts` revalidates `/cases` routes that do not exist in this app.
3. **Non-existent redirect target:** `case-management/page.tsx`, `case-management/[caseId]/page.tsx` and `documents/page.tsx` `redirect('/cases')` for non-hospital roles. This is unreachable in practice because the layout already signs those users out, but it would 404. A comment in `case-management/page.tsx` also points to a non-existent `apps/hospital/app/(dashboard)/cases/page.tsx`.
4. **Redundant account lookups:** `getAccountForUser` (2 queries worst case) is called in the layout and again in each page and many actions, and pages call `supabase.auth.getUser()` instead of the cached `getAuthUser()`. Wrapping `getAccountForUser` in React `cache()` would remove duplicate round-trips.
5. **Pages trust the layout for approval.** Individual pages check role but not `status === 'approved'`. That is fine while all of them live under `(dashboard)`, but server actions (for example `updateHospital*` and the visa actions) do not check approval themselves and rely on RLS/RPC guards.
6. **`generateHospitalLetterSignedUrlAction(filePath)`** signs any client-supplied path in the `visa-documents` bucket. It uses the user-scoped client, so Storage RLS is the only guard. Consider accepting a document id and resolving the path server-side.
7. **`sendVisaDocumentToPatientAction`** does not check the hospital role in app code (it relies on the RPC). It inserts only an in-portal notification, while the `LetterCard` dialog copy says the patient is notified "by email/SMS". Unlike the case actions, no `dispatchCaseStatusAlerts`-style fan-out happens here unless a DB trigger does it; this should be checked.
8. **Hand-typed RPCs:** `update_hospital_basic_info` / `update_hospital_details` are cast through `AccountSettingsRpcClient` because generated Supabase types were not regenerated. Regenerate `@iha/db` types and remove the cast.
9. **PDF fonts:** `pdf-lib` StandardFonts (WinAnsi) cannot encode many non-Latin characters, so patient or hospital names in other scripts would make generation throw (caught and reported as a generic failure). Embedding a Unicode TTF would fix this.
10. **Unused providers/deps:** the React Query `QueryClientProvider` is mounted but unused; `clsx`, `tailwind-merge` and `libphonenumber-js` are not imported directly.
11. **In-memory filtering/pagination:** case, patient, doctor and document lists load all rows and filter/paginate on the client or server in memory. This is fine at current scale but will not scale indefinitely.
12. **Minor:** the dashboard `loading.tsx` skeleton shows a 4-column stats row while the page has 3. Links from patient detail and the patient table's "Latest Case" omit `assignmentId` and rely on the fallback selection. `HospitalResubmitForm` is documented as a temporary stand-in for a future "Module 02" profile-edit form.
