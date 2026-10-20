# `apps/admin` — MTA Admin Portal (work in progress)

> Port **3003** · Next.js 15 App Router · package name `admin`
>
> **Status:** an intentional work-in-progress scaffold. Authentication is complete, but the dashboard is still a placeholder. The gaps listed below are a roadmap, not defects.

## 1. Overview

The admin portal is for **MTA / IHA platform staff**. They will coordinate cases across patients, hospitals, doctors and visa lawyers: approving provider registrations, assigning doctors and lawyers, reviewing treatment plans, opening chat threads, and messaging providers. So far the app provides:

- the full email/password + OAuth auth stack (login, register, OTP verify, forgot/reset password, auth callback), which mirrors the other portals;
- an authenticated `(dashboard)` area containing a single placeholder page ("Platform overview" card of skeletons).

The UI brand is "MTA Admin Portal".

### Key dependencies (`apps/admin/package.json`)

| Dependency | Why it matters |
|---|---|
| `next` ^15.3, `react`/`react-dom` ^19.1 | App Router, Server Components, Server Actions. |
| `@iha/db` | `createClient` (`@iha/db/server`), `handleAuthMiddleware` (`@iha/db/middleware`), `logAuditEvent` (`@iha/db/audit`). Future features will use its data modules. |
| `@iha/ui` | `Card`, `Skeleton` and the `@iha/ui/auth` forms and `AuthShell`. |
| `@iha/validations` | Auth Zod schemas (`@iha/validations/auth`) and the `Result<T>` type. |
| `@iha/logger` | Declared but not yet imported anywhere. |
| `@supabase/ssr` | Cookie-based Supabase auth (via `@iha/db`). |
| `@tanstack/react-query` | `QueryClientProvider` mounted in `providers.tsx` (not used yet). |
| `nuqs` | `NuqsAdapter` mounted for URL query state (not used yet). |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Form stack (the auth forms in `@iha/ui` use it). |
| `sonner` | Toasts (`<Toaster>` plus a success toast on password reset). |
| `clsx`, `tailwind-merge` | `cn()` helper in `lib/utils.ts`. |
| Dev: `@iha/config`, `tailwindcss` 3, `postcss`, `autoprefixer`, `eslint` 9, `typescript` 5.8 | Shared presets and toolchain. |

Unlike `apps/visa`, it has no `lucide-react` and no `react-phone-number-input` yet.

## 2. Configuration

### Scripts

| Script | Command |
|---|---|
| `dev` | `next dev --port 3003` |
| `build` | `next build` |
| `start` | `next start --port 3003` |
| `lint` | `next lint` |

### `next.config.ts`

`output: 'standalone'`; `transpilePackages: ['@iha/ui', '@iha/db', '@iha/validations']`. This is identical to the other portals.

### `middleware.ts`

Calls `handleAuthMiddleware` from `@iha/db/middleware` with:

```ts
publicPrefixes: ['/login', '/register', '/forgot-password', '/reset-password', '/verify', '/auth', '/api'],
postAuthPath: '/dashboard',
requireEmailVerification: true,
```

The matcher excludes `_next/static`, `_next/image`, `favicon.ico` and image files.

The middleware runs these checks in order:

1. Refresh the session and call `auth.getUser()`. Errors are treated as signed-out.
2. `/` → `/dashboard` (signed in) or `/login`.
3. Signed-out user on any non-public path → `/login`.
4. Signed-in user with unconfirmed email on a non-public path → `/verify?email=…`.
5. Signed-in user on `/login`, `/verify` or `/forgot-password` → `/dashboard`.

There is **no role or approval check**. The middleware and the dashboard layout only check that a user is authenticated and has a verified email. Self-registration at `/register` is open. As a result, any person who signs up and verifies an email can reach `/dashboard`. Today that is harmless because the dashboard shows no data. Admin authorisation still has to be built, and the schema has no `admin_users` table or admin role yet (see §6).

### Styling and tooling

| File | Purpose |
|---|---|
| `tailwind.config.ts` | Shared `@iha/config/tailwind.preset`; scans `app/**`, `components/**`, `packages/ui/src/**`. |
| `postcss.config.mjs` | `tailwindcss` + `autoprefixer`. |
| `eslint.config.mjs` | Re-exports `@iha/config/eslint-next`. |
| `tsconfig.json` | Extends `@iha/config/tsconfig.base.json`; Next plugin; `@/*` alias. |
| `app/globals.css` | Tailwind layers + shadcn-style HSL theme variables (no phone-input CSS). |

### Environment variables (`.env.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (default `http://localhost:3003`; auth redirect URLs), `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`. The Resend/Twilio keys are not used by any admin code yet. They are in place for future notification dispatch through `@iha/db` / `@iha/notifications`. The service-role key will probably matter here: several DB features are only readable by the service role today, for example the `registration_requests` view.

## 3. Routing map

| URL | File | Purpose | Auth requirement | Main data loaded |
|---|---|---|---|---|
| `/` | `app/page.tsx` | Redirect to `/login` (middleware sends signed-in users to `/dashboard`) | None | — |
| `/login` | `app/(auth)/login/page.tsx` | Email/password + OAuth login | Public; signed-in users bounced to `/dashboard` | — |
| `/register` | `app/(auth)/register/page.tsx` | Open self-registration (full name, email, password) | Public | — |
| `/verify?email=` | `app/(auth)/verify/page.tsx` | Email OTP verification; redirects to `/register` without `email` | Public; signed-in users bounced | — |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request reset email | Public; signed-in users bounced | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | Set a new password with the recovery session | Public | — |
| `/auth/callback` | `app/auth/callback/route.ts` | OAuth / email-link code exchange (GET Route Handler) | Public | `auth.exchangeCodeForSession` |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Placeholder "Platform overview" | Signed in + email verified | None (static skeletons) |

## 4. File reference

All paths are relative to the repository root.

### Root configuration

| File | Description |
|---|---|
| `apps/admin/package.json` | Workspace manifest; scripts on port 3003; dependencies in §1. |
| `apps/admin/next.config.ts` | Standalone output; transpiles workspace packages. |
| `apps/admin/middleware.ts` | Exports `middleware` → `handleAuthMiddleware` and `config.matcher` (§2). |
| `apps/admin/tailwind.config.ts` | Tailwind config on the shared preset. |
| `apps/admin/postcss.config.mjs` | PostCSS plugins. |
| `apps/admin/eslint.config.mjs` | Shared Next ESLint flat config. |
| `apps/admin/tsconfig.json` | Shared base TS config + `@/*` alias. |
| `apps/admin/.env.example` | Env var template (§2). |

### `app/` — root

| File | Description |
|---|---|
| `apps/admin/app/layout.tsx` | Root layout: Geist fonts, metadata (`MTA Admin Portal` / "MTA platform administration"), wraps children in `Providers`. |
| `apps/admin/app/providers.tsx` | `Providers` (client): `QueryClientProvider` (staleTime 60 s), `NuqsAdapter`, sonner `<Toaster>` (top-center, rich colours, close button). |
| `apps/admin/app/globals.css` | Tailwind directives and theme CSS variables. |
| `apps/admin/app/page.tsx` | `HomePage` → `redirect('/login')`. |
| `apps/admin/app/error.tsx` | Root error boundary; logs `[admin:GlobalError]`; "Try again" calls `reset`. |

### `app/(auth)/`

| File | Description |
|---|---|
| `apps/admin/app/(auth)/layout.tsx` | Wraps auth pages in `AuthShell` (`@iha/ui/auth`). |
| `apps/admin/app/(auth)/error.tsx` | Auth-segment error boundary (`[admin:AuthError]`). |
| `apps/admin/app/(auth)/login/page.tsx` | Renders `LoginPageClient`. |
| `apps/admin/app/(auth)/register/page.tsx` | Renders `RegisterPageClient`. |
| `apps/admin/app/(auth)/verify/page.tsx` | Async page; requires `?email` (else redirects to `/register`); renders `VerifyOtpPageClient`. |
| `apps/admin/app/(auth)/forgot-password/page.tsx` | Renders `ForgotPasswordPageClient`. |
| `apps/admin/app/(auth)/reset-password/page.tsx` | Renders `ResetPasswordPageClient`. |

### `app/auth/callback/`

| File | Description |
|---|---|
| `apps/admin/app/auth/callback/route.ts` | `GET` handler: exchanges `?code` for a session (otherwise redirects to `/login?error=auth_callback`). Back-fills `user_metadata.full_name` from OAuth identity data, sends unverified users to `/verify`, then redirects to `?next` (default `/dashboard`). Identical to the visa app's handler. |

### `app/(dashboard)/`

| File | Description |
|---|---|
| `apps/admin/app/(dashboard)/layout.tsx` | Server layout. `createClient().auth.getUser()` → `/login` if missing; unverified → `/verify`. Renders a minimal header ("MTA Admin Portal" / "Dashboard") and `<main>`. It has no sidebar or navigation yet and no role check. |
| `apps/admin/app/(dashboard)/error.tsx` | Dashboard error boundary (`[admin:DashboardError]`). |
| `apps/admin/app/(dashboard)/dashboard/page.tsx` | `DashboardPage`: one `Card` titled "Platform overview" with the description "Monitor cases, users, and pending platform tasks." and two `Skeleton` blocks. It loads no data. |
| `apps/admin/app/(dashboard)/dashboard/loading.tsx` | Skeleton matching the placeholder card. |

### `components/auth/`

These are client adapters that bind `@iha/ui/auth` forms to the server actions in `lib/actions/auth.ts`. Apart from the register component, they are byte-identical to the visa app's versions.

| File | Description |
|---|---|
| `apps/admin/components/auth/login-page-client.tsx` | `LoginPageClient`: `LoginForm` → `signInWithEmail`, push `redirectTo` + `router.refresh()`; OAuth via `signInWithOAuth`. |
| `apps/admin/components/auth/register-page-client.tsx` | `RegisterPageClient`: `RegisterForm` → `signUpWithEmail` (then `/verify?email=`); OAuth via `signInWithOAuth`. |
| `apps/admin/components/auth/verify-otp-page-client.tsx` | `VerifyOtpPageClient({ email })`: `VerifyOtpForm` → `verifyOtp` / `resendVerificationOtp`. |
| `apps/admin/components/auth/forgot-password-page-client.tsx` | `ForgotPasswordPageClient`: `ForgotPasswordForm` → `requestPasswordReset`. |
| `apps/admin/components/auth/reset-password-page-client.tsx` | `ResetPasswordPageClient`: `ResetPasswordForm` → `resetPassword`, success toast, push `/login`; "Back to login" → `signOut`. |

`apps/admin/components/.gitkeep` and `apps/admin/hooks/.gitkeep` are empty placeholders.

### `lib/`

| File | Description |
|---|---|
| `apps/admin/lib/actions/auth.ts` | `'use server'`. Exports `signInWithEmail` (→ `/dashboard`; audits `auth.login_failed` / `auth.login_succeeded`), `signUpWithEmail` (`auth.signUp` with `full_name` metadata and `emailRedirectTo` `/auth/callback`; audits `auth.signup`; → `/verify?email=`), `verifyOtp` (type `email`; → `/dashboard`), `resendVerificationOtp`, `requestPasswordReset` (redirect `/auth/callback?next=/reset-password`), `resetPassword` (update password, sign out, → `/login`), `signInWithOAuth`, `signOut`. Inputs are validated with `@iha/validations/auth` schemas. Audit events go through `logAuditEvent` with `app: 'admin'`. Signup sets no role in the user metadata. |
| `apps/admin/lib/auth/constants.ts` | `INVALID_CREDENTIALS_MESSAGE`, `GENERIC_AUTH_ERROR`, `VERIFY_EMAIL_MESSAGE` (unused). |
| `apps/admin/lib/validations/auth.ts` | Re-exports auth schemas/types from `@iha/validations/auth` (including `registerSchema`). It is unused because the actions import the package directly. |
| `apps/admin/lib/utils.ts` | `cn()` helper (unused so far). |

### `types/`

| File | Description |
|---|---|
| `apps/admin/types/index.ts` | `CaseStatus`, `AssignmentStatus`, `TreatmentPlanStatus` unions (the latter includes the admin-side states `submitted_to_iha`, `iha_review_in_progress`, `iha_approved`, `rejected_by_iha`). Not imported anywhere yet; `CaseStatus` predates `visa_documents_submitted` / `visa_rejected`. |

### `public/` assets

| File | Description |
|---|---|
| `apps/admin/public/logo.svg` | Admin logo (SVG). |
| `apps/admin/public/auth-illustration.png` | Illustration used by `AuthSidebar` in `AuthShell`. |

## 5. Key flows

### 5.1 Implemented: authentication

1. **Register** — `/register` → `RegisterForm` → `signUpWithEmail`. This creates a Supabase auth user with `full_name` and audits the signup, then redirects to `/verify?email=`.
2. **Verify** — `VerifyOtpForm` → `verifyOtp`. On success the user goes to `/dashboard`. Resend uses `auth.resend({ type: 'signup' })`.
3. **Login** — `signInWithEmail` → `/dashboard`. OAuth goes through `signInWithOAuth` → provider → `/auth/callback` → `/dashboard`.
4. **Forgot / reset password** — the reset email links to `/auth/callback?next=/reset-password`. The callback exchanges the code for a recovery session, and `resetPassword` updates the password, then signs out and redirects to `/login`.
5. **Dashboard access** — the middleware and the `(dashboard)` layout check only for an authenticated user with a verified email.

### 5.2 Planned: features already prepared in the database

Database comments state that these DB-side features have no consumer yet besides the future Admin Portal. Migration file names are under `packages/db/supabase/migrations/`.

| Planned feature | DB support already present |
|---|---|
| **Provider registration approvals** (hospitals, doctors) | `registration_requests` view (`20260714112710_add_registration_requests_view.sql`) is described as the queue for the admin dashboard's "Total Requests"; in practice only the service role can read it. Admin sets `status` to `approved` / `rejected` (+ reason) / `more_info_requested` (+ message). Provider portals already handle each state (`/pending-approval`, resubmit RPCs). |
| **Visa lawyer approvals** | `lawyers.status`, `rejection_reason` and `more_info_message` (`20260826010000_create_lawyers_table.sql`) are consumed by the visa portal's `/pending-approval`. Lawyers are not part of the `registration_requests` view, so a separate query or a view update will be needed. |
| **Doctor case assignment** | Admin-created rows in `doctor_case_assignments` (`20260717131615`). A notification trigger (`20260907000000_add_case_assignment_notification_trigger.sql`) is dormant until the admin insert path exists. |
| **Visa lawyer case assignment** | `visa_submissions.assigned_lawyer_id` drives all lawyer case access (`20260826020000_add_lawyer_case_access.sql`); new cases enter the lawyer queue as `documents_submitted` "straight from admin assignment". |
| **Provider ↔ Admin messaging** | `provider_message_threads` / messages for hospitals, doctors and lawyers (`20260717131620`, `20260902000000`). Threads are auto-created and opening is admin-gated, with reopen requests from providers (`20260728000000`). `notify_provider_on_admin_message` triggers already notify providers when an admin message arrives. |
| **Patient ↔ coordinator chat** | `chat_threads` (`20260618000001_create_chat_tables.sql`). Threads are created `closed` and only an admin can open them, so patients cannot send until this portal exists. |
| **Treatment plan review** | `submit_treatment_plan_to_admin` RPC and `TreatmentPlanStatus` states `submitted_to_iha` → `iha_review_in_progress` → `iha_approved` / `rejected_by_iha` (`20260721020000`, `20260722000000`). |
| **Platform fee settings** | `platform_fee_settings` (`20260826000000`) is "Admin-editable"; it is currently edited directly in the Supabase Table Editor until an admin UI exists. |
| **Audit log review** | `audit_logs` (`20260612000005`), written by every portal through `logAuditEvent`. |
| **Admin notifications / visibility** | Several migrations and visa-portal comments say admin is *not* notified, and has no RLS read access (for example on `visa_case_notes`), "until an admin identity model exists". |

The dashboard placeholder copy ("Monitor cases, users, and pending platform tasks") matches this roadmap.

## 6. Notes

- **Missing admin identity and authorisation model (prerequisite).** The schema has no `admin_users` table, no admin role claim and no admin RLS policies. Registration is open, signup sets no role, login has no role check (unlike the visa portal's `findOtherRoleAccount` guard), and the dashboard layout checks only authentication. Before any real data is shown, the portal needs these pieces:
  - an admin identity, and gating on it in the middleware or layout;
  - probably removal of public self-registration;
  - server-only use of the service-role client (or admin RLS policies) for cross-tenant reads such as `registration_requests`.
- **Shared auth code.** The auth actions and callback largely duplicate the visa/hospital/doctor implementations. Admin's version is simpler: there is no post-auth account routing (everything goes to `/dashboard`) and no rate-limit flag on OTP resend.
- **Possibly broken auth logo.** `AuthLogo` in `@iha/ui/auth` defaults to `/logo.png`, but `apps/admin/public` contains only `logo.svg`. The logo on the admin login/register/verify pages will 404 unless a `logoSrc` is passed or a `logo.png` is added.
- **Latent middleware redirect loop** (shared with the other portals). A signed-in user with an unverified email is sent from protected routes to `/verify`, and `/verify` sends signed-in users to `/dashboard`. This is normally unreachable because Supabase rejects password logins for unconfirmed emails.
- **Unused scaffolding:** `@iha/logger`, React Query, `nuqs`, `lib/utils.ts`, `lib/validations/auth.ts`, `VERIFY_EMAIL_MESSAGE`, `types/index.ts`, plus the empty `components/` and `hooks/` folders, are in place for upcoming work.
- **No `app/icon.png`.** Unlike the visa app, admin has no favicon or app icon file.
