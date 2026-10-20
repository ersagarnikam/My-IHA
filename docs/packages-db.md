# `@iha/db` — Database Access Package

> Scope: `packages/db` excluding `packages/db/supabase/migrations` (documented separately).
> Source of truth: the files under `packages/db/src`, `packages/db/types`, and `packages/db/supabase`.

---

## 1. Overview

`@iha/db` is the shared data-access layer for all five Next.js 15 portals (patient, hospital, visa/lawyer, admin, doctor). It provides:

- **Supabase client factories** for the browser, server (request-scoped, cookie-backed), service-role, and Next.js middleware contexts.
- **Domain repositories** — thin, typed wrappers over PostgREST queries, security-definer RPCs, and Storage calls, grouped by domain (cases, visa, payments, consultations, etc.).
- **Database types** — the generated `Database` type merged with decrypted PII computed columns, plus convenience row aliases.

The package is TypeScript-source only (no build step). Each export path points directly at a `.ts` file and is compiled by the consuming Next.js app. The only script is `lint` (`tsc --noEmit`).

### Dependencies

| Kind | Packages |
|---|---|
| Runtime | `@supabase/ssr` ^0.12.3, `@supabase/supabase-js` ^2.110.7, `@iha/logger`, `@iha/notifications`, `@iha/validations` |
| Peer | `next` >=14, `react` >=18 |
| Dev | `@iha/config` (tsconfig base), `typescript` ^5.8.3, `@types/node`, `@types/react` |

`tsconfig.json` extends `@iha/config/tsconfig.base.json`, uses `moduleResolution: "bundler"`, `lib: ["esnext"]`, and includes `src/**/*.ts` and `types/**/*.ts`.

### Exports map (`package.json`)

| Subpath | File | Runtime context |
|---|---|---|
| `@iha/db/client` | `src/client.ts` | Browser (Client Components) |
| `@iha/db/server` | `src/server.ts` | Server only (`next/headers`) |
| `@iha/db/middleware` | `src/middleware.ts` | Next.js middleware (Edge) |
| `@iha/db/types` | `types/index.ts` | Types only — safe everywhere |
| `@iha/db/patients` | `src/patients.ts` | Server |
| `@iha/db/cases` | `src/cases.ts` | Server |
| `@iha/db/specialties` | `src/specialties.ts` | Server |
| `@iha/db/treatments` | `src/treatments.ts` | Server |
| `@iha/db/treatment-plans` | `src/treatment-plans.ts` | Server |
| `@iha/db/payments` | `src/payments.ts` | Server |
| `@iha/db/doctor-fees` | `src/doctor-fees.ts` | Server |
| `@iha/db/visa` | `src/visa.ts` | Server |
| `@iha/db/visa-status` | `src/visa-status.ts` | Pure constant — client-safe |
| `@iha/db/audit` | `src/audit.ts` | Server |
| `@iha/db/consultations` | `src/consultations.ts` | Server |
| `@iha/db/consultations-shared` | `src/consultations-shared.ts` | Pure constants/types — client-safe |
| `@iha/db/notifications` | `src/notifications.ts` | Server |
| `@iha/db/chat` | `src/chat.ts` | Server |
| `@iha/db/storage` | `src/storage.ts` | Server |
| `@iha/db/case-assignments` | `src/case-assignments.ts` | Server |
| `@iha/db/provider-messages` | `src/provider-messages.ts` | Server |
| `@iha/db/auth-lookup` | `src/auth-lookup.ts` | Server (service role) |
| `@iha/db/account-lookup` | `src/account-lookup.ts` | Any (client passed in) |

There is no root/barrel export (`@iha/db` alone is not importable) — consumers always import a subpath.

### How apps consume it

Every app depends on `@iha/db` via `workspace:*` and imports subpaths from Server Components, Server Actions (`lib/actions/*`), data loaders (`lib/data/*`), route handlers, and `middleware.ts`. Approximate import counts (files importing each subpath):

| Subpath | admin | doctor | hospital | patient | visa | packages/ui |
|---|---|---|---|---|---|---|
| `client` | – | 1 | – | 9 | 1 | 4 |
| `server` | 3 | 30 | 30 | 39 | 23 | – |
| `types` | – | 3 | 3 | 26 | 3 | 4 |
| `middleware` | 1 | 1 | 1 | 1 | 1 | – |
| `audit` | 1 | 9 | 6 | 12 | 4 | – |
| `cases` | – | 5 | 4 | 9 | 2 | – |
| `specialties` | – | 8 | 8 | 18 | – | – |
| `visa` | – | – | 8 | 14 | 8 | – |
| `consultations` | – | 6 | – | 8 | – | – |
| `notifications` | – | 3 | 3 | 4 | 3 | – |
| `treatment-plans` | – | 5 | 4 | – | – | 1 |
| `case-assignments` | – | 5 | 2 | – | – | 1 |
| `provider-messages` | – | 3 | 3 | – | 3 | – |
| `payments` | – | – | – | 7 | – | – |
| `doctor-fees` | – | 6 | – | – | – | – |
| `treatments` | – | 1 | – | 7 | – | – |
| `patients` | – | 1 | 2 | 2 | – | – |
| `storage` | – | 2 | 1 | 3 | 1 | – |
| `chat` | – | – | – | 3 | – | – |
| `auth-lookup` | – | 1 | 1 | 1 | 1 | – |
| `account-lookup` | – | 1 | 1 | – | 1 | – |
| `consultations-shared` | – | 1 | – | 1 | – | – |
| `visa-status` | – | – | – | – | 1 | – |

The admin portal (a WIP scaffold) currently only uses `server`, `middleware`, and `audit`. Many apps also issue ad-hoc queries directly with `createClient()` from `@iha/db/server` in their own `lib/data` / `lib/actions` modules, in addition to the shared repositories below.

---

## 2. Supabase clients

All clients are typed with the merged `Database` type from `types/index.ts` (except the middleware client, which is untyped).

### 2.1 `src/client.ts` — browser client

```ts
export function createClient(): SupabaseClient<Database>
```

- Uses `createBrowserClient` from `@supabase/ssr` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Session is read from / written to browser cookies automatically by `@supabase/ssr`.
- Use in Client Components for direct Storage uploads, Realtime subscriptions, and client-side auth calls (sign-in, sign-out, password reset). All access is constrained by RLS as the signed-in user.
- Used by: patient, doctor, visa, and `packages/ui`.

### 2.2 `src/server.ts` — server clients

| Export | Signature | Key | Cookies | Use when |
|---|---|---|---|---|
| `createClient` | `async () => SupabaseClient<Database>` | anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Next.js `cookies()` store: `getAll` reads request cookies; `setAll` writes, wrapped in `try/catch` because Server Components cannot set cookies (middleware refreshes the session instead) | Default for all server-side work — Server Components, Server Actions, route handlers. RLS applies as the logged-in user. |
| `createServiceClient` | `() => SupabaseClient<Database>` | **service role** (`SUPABASE_SERVICE_ROLE_KEY`) | No-op adapter (`getAll: () => []`, `setAll: () => {}`) — no user session | Bypassing RLS: webhooks without a user session (Stripe webhooks in `apps/patient/app/api/payments/webhook` and `apps/doctor/app/api/fees/webhook`), `auth.admin.*` calls, cross-user notification lookups, the `email_already_registered` RPC. Never expose to the browser. |
| `getAuthUser` | `cache(async () => User \| null)` | anon | via `createClient` | Get the current user. Wrapped in React `cache()` so the `auth.getUser()` network round trip (which revalidates against Supabase Auth) happens at most once per request/render pass. |

### 2.3 `src/middleware.ts` — auth middleware

```ts
export type AuthMiddlewareOptions = {
  publicPrefixes: string[]
  postAuthPath: string
  requireEmailVerification?: boolean
  checkPatientSoftDelete?: boolean
}
export async function handleAuthMiddleware(request: NextRequest, options: AuthMiddlewareOptions): Promise<NextResponse>
```

Each app's `middleware.ts` delegates to this function. Behaviour:

1. Creates a `createServerClient` (anon key) whose cookie adapter reads `request.cookies` and, on `setAll`, writes cookies to both the request and a freshly created `NextResponse.next({ request })` — the standard `@supabase/ssr` session-refresh pattern.
2. Calls `supabase.auth.getUser()` inside `try/catch`; a stale/invalid refresh token is treated as unauthenticated (logs with `console.error` — no pino on the Edge runtime).
3. If `checkPatientSoftDelete` and a user is present: reads `patients.is_deleted` for the user; if true, signs out and redirects to `/login`.
4. `/` redirects to `postAuthPath` (signed in) or `/login`.
5. Any path not matching `publicPrefixes` (exact or `prefix/…`) is protected — unauthenticated users go to `/login`. New routes are protected by default.
6. If `requireEmailVerification` and `email_confirmed_at` is empty on a protected route → redirect to `/verify?email=…`.
7. Signed-in users visiting `login`, `verify`, or `forgot-password` are redirected to `postAuthPath` (`register` is deliberately excluded so users mid-registration can reach it).

Per-app configuration:

| App | `postAuthPath` | `requireEmailVerification` | `checkPatientSoftDelete` |
|---|---|---|---|
| patient | `/cases` | true | true |
| hospital | `/dashboard` | true | – |
| doctor | `/dashboard` | true | – |
| visa | `/dashboard` | true | – |
| admin | `/dashboard` | true | – |

### 2.4 Which client to use

| Context | Client |
|---|---|
| Client Component, browser upload, Realtime | `@iha/db/client` → `createClient()` |
| Server Component / Server Action / route handler acting as the user | `@iha/db/server` → `createClient()` (or a repository function, which calls it internally) |
| Current user lookup on the server | `@iha/db/server` → `getAuthUser()` |
| Webhooks, cron-like jobs, `auth.admin`, reading another user's data for notification fan-out | `@iha/db/server` → `createServiceClient()` |
| `middleware.ts` | `@iha/db/middleware` → `handleAuthMiddleware()` |

---

## 3. Module reference

Conventions shared by almost all repository functions:

- Return shape is `{ data, error: string | null }` or `{ error: string | null }` — Supabase errors are flattened to their `message`; functions do not throw.
- Unless noted, the function calls `createClient()` from `./server` internally, i.e. it **expects a server request context with a user session** and is subject to RLS. "Server" in the tables below means this request-scoped anon-key client; "Service" means `createServiceClient()`.
- "Used by" was determined by grepping `apps/` and `packages/ui` for the identifier; "–" means no current caller was found.

### 3.1 `src/client.ts`

Browser client factory. See §2.1.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `createClient` | `() => SupabaseClient<Database>` | – | Browser | patient, doctor, visa, ui |

### 3.2 `src/server.ts`

Server client factories. See §2.2.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `createClient` | `async () => SupabaseClient<Database>` | – | Server | all apps |
| `createServiceClient` | `() => SupabaseClient<Database>` | – | Service | doctor, patient (Stripe webhooks) |
| `getAuthUser` | `() => Promise<User \| null>` (React-cached) | `auth.getUser()` | Server | doctor, hospital, patient, visa |

### 3.3 `src/middleware.ts`

Shared auth middleware. See §2.3.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `AuthMiddlewareOptions` | type | – | – | all apps |
| `handleAuthMiddleware` | `(request, options) => Promise<NextResponse>` | `auth.getUser`, `auth.signOut`, table `patients` (`is_deleted`) | Middleware (anon, request cookies) | all apps |

### 3.4 `src/account-lookup.ts`

Cross-portal login guard. All portals share one Supabase auth pool, so this checks the *other* role tables for a row belonging to the user, to reject e.g. a patient credential used on the hospital portal.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `AccountRole` | `'patient' \| 'hospital' \| 'doctor' \| 'lawyer'` | – | – | doctor, hospital, visa |
| `findOtherRoleAccount` | `(supabase: SupabaseClient<Database>, userId, excludeRoles: AccountRole[]) => Promise<AccountRole \| null>` | tables `patients`, `hospitals`, `doctors`, `lawyers` (sequential `select id where user_id`) | Caller-supplied | doctor, hospital, visa |

### 3.5 `src/auth-lookup.ts`

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `checkEmailAlreadyRegistered` | `(email) => Promise<{ data: boolean \| null; error }>` | RPC `email_already_registered(p_email)` | Service | doctor, hospital, patient, visa (self-registration) |

### 3.6 `src/audit.ts`

Audit trail writer. Failures are logged via `@iha/logger` (`db:audit`) and swallowed — auditing never breaks the calling action.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `AuditApp` | `'patient' \| 'admin' \| 'hospital' \| 'visa' \| 'doctor'` | – | – | all apps |
| `AuditAction` | string-literal union of ~60 actions grouped as `auth.*`, `registration.*`, `patient.*`, `doctor.*`, `hospital.*`, `lawyer.*`, `case.*`, `treatment_option.*`, `consultation.*`, `visa.*`, `visa_document.*`, `payment.*`, `case_assignment.*`, `treatment_plan.*`, `provider_message.*`, `fee.*` | – | – | all apps |
| `logAuditEvent` | `({ app, action, entityType?, entityId?, metadata? }) => Promise<void>` | RPC `log_audit_event(p_app, p_action, p_entity_type, p_entity_id, p_metadata)` → table `audit_logs` | Server | admin, doctor, hospital, patient, visa |

### 3.7 `src/case-assignments.ts`

Doctor ↔ case assignment workflow (doctor portal, with hospital oversight).

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `AssignmentWithCase` | `DoctorCaseAssignment & { cases: CaseSummary \| null }` | – | – | doctor, hospital, ui |
| `fetchAssignmentsForDoctor` | `(doctorId) => { data: AssignmentWithCase[] }` | `doctor_case_assignments` ⋈ `cases` ⋈ `patients(full_name)` | Server | doctor, hospital |
| `fetchAssignmentForCase` | `(caseId, doctorId) => { data: DoctorCaseAssignment \| null }` | `doctor_case_assignments` | Server | doctor |
| `respondToCaseAssignment` | `(assignmentId, 'accepted' \| 'declined' \| 'withdrawn', declineReason?) => { error }` | RPC `respond_to_case_assignment` | Server | doctor, hospital |
| `requestCaseAdditionalInfo` | `(caseId, message) => { error }` | RPC `request_case_additional_info` | Server | doctor, hospital |
| `startCaseEvaluation` | `(caseId) => { error }` | RPC `start_case_evaluation` | Server | doctor, hospital |
| `markCaseCompleted` | `(caseId) => { error }` | RPC `mark_case_completed` | Server | doctor, hospital |
| `dispatchCaseAssignmentAlertsToDoctor` | `(caseId, doctorId) => Promise<void>` | `doctors`, `notifications` (type `case_assigned_by_admin`), `auth.admin.getUserById`, `@iha/notifications.dispatchNotificationAlerts`; env `NEXT_PUBLIC_DOCTOR_APP_URL` | Service | – (dormant; intended for the Admin assignment flow) |
| `AssignedCasesStats` | `{ assigned, pendingReview, completed, plansCreated }` | – | – | doctor |
| `fetchAssignedCasesStats` | `(doctorId) => { data: AssignedCasesStats }` | `doctor_case_assignments` ⋈ `cases(status)`; aggregated in JS | Server | doctor |

### 3.8 `src/cases.ts`

Medical cases, case documents, and the core notification-insert + alert fan-out.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `insertCase` | `({ specialty, specialty_other?, description }) => { data: { id, reference_number } \| null }` | RPC `insert_case` (encrypts `description` server-side) | Server | patient |
| `insertCaseDocuments` | `(docs[]) => { error }` | insert `case_documents` | Server | patient |
| `insertPatientDocuments` | `(docs[] with optional case_id + document_category) => { error }` | insert `case_documents` | Server | patient |
| `insertNotification` | `(payload: { user_id, type, title, message, case_id }) => { error }` | see `insertNotificationWithClient` | Server | hospital, patient, visa |
| `insertNotificationWithClient` | `(supabase, payload) => { error }` | `notifications` (60-second de-dup on user/type/case, then insert); then email/SMS alert via `patients` (phone + prefs), `auth.getUser`, fallback `auth.admin.getUserById` (Service), `@iha/notifications`; env `NEXT_PUBLIC_NOTIFICATION_APP_URL` | Caller-supplied (+ Service for email lookup) | – (intended for webhook contexts) |
| `dispatchCaseStatusAlerts` | `(supabase, caseId, type) => Promise<void>` | reads latest `notifications` row inserted by the `cases_notify_status_change` trigger, then sends email/SMS | Caller-supplied | doctor, hospital, patient |
| `fetchLatestNotificationForCase` | `(caseId, types[]) => { data: { title, message } \| null }` | `notifications` | Server | – |
| `fetchPatientCases` | `(patientId) => { data }` | `cases` (explicit column list incl. decrypted `description`) | Server | patient |
| `fetchCaseById` | `(caseId) => { data: CaseRow \| null }` | `cases` | Server | doctor, hospital, patient |
| `fetchDocumentsByCase` | `(caseId) => { data: CaseDocumentRow[] }` | `case_documents` | Server | doctor, patient |
| `fetchDocumentCountsForCases` | `(caseIds[]) => { data: Record<caseId, number> }` | `case_documents` | Server | patient |
| `DocumentWithCaseInfo` | `CaseDocumentRow & { reference_number, case_specialty }` | – | – | patient |
| `fetchAllDocumentsForPatient` | `(patientId) => { data: DocumentWithCaseInfo[] }` | `case_documents` ⋈ `cases` | Server | patient |
| `updateCaseTravelAssistance` | `(caseId, travel, stay, transport: boolean) => { error }` | RPC `update_case_travel_assistance` | Server | patient |
| `updateDocumentCaseLink` | `(documentId, caseId, fileName) => { error }` | update `case_documents` | Server | patient |
| `createCaseDocumentSignedUrl` | `(path, expiresIn = 3600) => { url }` | Storage bucket **`case-documents`** (signed URL) | Server | doctor, hospital, patient |

Note: `sendNotificationAlerts` (internal) only targets **patient** contact preferences (`patients` row of the recipient); if the recipient is not a patient it silently returns.

### 3.9 `src/chat.ts`

Patient ↔ admin support chat.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `fetchChatThreadForPatient` | `(patientId) => { data: ChatThreadRow \| null }` | `chat_threads` | Server | patient |
| `fetchChatMessages` | `(threadId) => { data: ChatMessageRow[] }` | `chat_messages` | Server | patient |
| `fetchUnreadChatMessageCount` | `(threadId) => { count }` | `chat_messages` (admin, unread; `head` count) | Server | patient |
| `sendPatientChatMessage` | `(threadId, senderId, body) => { error }` | insert `chat_messages` (`sender_type = 'patient'`) | Server | patient |
| `markChatMessagesRead` | `(threadId) => { error }` | update `chat_messages` (admin messages) | Server | patient |
| `requestChatThreadReopen` | `(threadId, reason) => { error }` | update `chat_threads` (only if `status = 'closed'`) | Server | patient |

### 3.10 `src/consultations-shared.ts`

Client-safe constants and types (no server imports).

| Export | Signature | Used by |
|---|---|---|
| `CONSULTATION_FEE_AUD` | `200` | patient |
| `ConsultationStatus` | `'requested' \| 'slots_proposed' \| 'slot_selected' \| 'scheduled' \| 'cancelled'` | doctor, patient |
| `ConsultationSlot` | `{ id, slot_time, slot_end_time }` | doctor, patient |
| `ConsultationRequest` | request row + `slots: ConsultationSlot[]` | doctor, patient |

### 3.11 `src/consultations.ts`

Online consultations between patient and doctor. Re-exports everything from `consultations-shared.ts`.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `TreatmentOptionSummary` | `{ procedure_name, description, treatment_start_date }` | – | – | doctor |
| `ConsultationRequestWithContext` | `ConsultationRequest & { treatment_option, case_reference_number, patient_name }` | – | – | doctor, patient |
| `fetchConsultationRequestsForCase` | `(caseId) => { data: ConsultationRequest[] }` | `consultation_requests` ⋈ `consultation_slots` | Server | doctor |
| `fetchConsultationRequestsForTreatmentOptions` | `(treatmentOptionIds[]) => { data }` | `consultation_requests` ⋈ `consultation_slots` | Server | patient |
| `fetchConsultationRequestsForDoctor` | `(doctorId) => { data: ConsultationRequestWithContext[] }` | `consultation_requests` ⋈ slots ⋈ `treatment_options` ⋈ `treatment_plans` ⋈ `cases` ⋈ `patients`; relies on RLS for doctor scoping (`doctorId` is not used as a filter) | Server | doctor |
| `fetchConsultationRequestById` | `(requestId) => { data: ConsultationRequestWithContext \| null }` | same joins | Server | doctor, patient |
| `requestOnlineConsultation` | `(treatmentOptionId) => { error }` | RPC `request_online_consultation` | Server | patient |
| `selectConsultationSlot` | `(requestId, slotId) => { error }` | RPC `select_consultation_slot` | Server | patient |
| `fetchConsultationSlotById` | `(slotId) => { data: ConsultationSlot \| null }` | `consultation_slots` | Server | – |
| `ProposedSlotInput` | `{ slot_time, slot_end_time }` | – | – | doctor |
| `proposeConsultationSlots` | `(requestId, slots[]) => { error }` | RPC `propose_consultation_slots` | Server | doctor |
| `cancelConsultation` | `(requestId, reason) => { error }` | RPC `cancel_consultation` | Server | doctor |
| `dispatchConsultationRequestAlertsToDoctor` | `(caseId) => Promise<void>` | `notifications` (type `consultation_request_received`), `doctors`, `auth.admin.getUserById`, `@iha/notifications`; env `NEXT_PUBLIC_DOCTOR_APP_URL` | Service | patient |

### 3.12 `src/doctor-fees.ts`

Doctor registration/annual platform fees (Stripe).

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `DoctorFeePaymentRow` | hand-declared row type (`fee_type: 'registration' \| 'annual'`, `status: 'pending' \| 'completed' \| 'failed'`, …) | – | – | doctor |
| `PlatformFeeSettings` | `{ doctorRegistrationFeeAud, doctorAnnualFeeAud }` | – | – | doctor |
| `fetchFeeSettings` | `() => { data: PlatformFeeSettings \| null }` | `platform_fee_settings` (`doctor_registration_fee`, `doctor_annual_fee`) | Server | doctor |
| `fetchDoctorFeePayments` | `(doctorId) => { data: DoctorFeePaymentRow[] }` | `doctor_fee_payments` | Server | doctor |
| `getOrCreatePendingFeePayment` | `(feeType) => { data: DoctorFeePaymentRow \| null }` | RPC `create_doctor_fee_payment` (idempotent, amount resolved server-side) | Server | doctor |
| `setDoctorFeePaymentStripeIntent` | `(paymentId, stripePaymentIntentId) => { data }` | RPC `set_doctor_fee_payment_stripe_intent` | Server | doctor |

### 3.13 `src/notifications.ts`

In-portal notification inbox (all portals except admin).

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `fetchNotificationsForUser` | `(userId) => { data: NotificationRow[] }` | `notifications` | Server | doctor, hospital, patient, visa |
| `fetchNotificationsForCase` | `(caseId, userId) => { data }` | `notifications` | Server | patient |
| `fetchUnreadNotificationCount` | `(userId) => { count }` | `notifications` (`head` count) | Server | doctor, hospital, patient, visa |
| `markNotificationRead` | `(id, userId) => { error }` | update `notifications` | Server | doctor, hospital, patient, visa |
| `markAllNotificationsRead` | `(userId) => { error }` | update `notifications` | Server | doctor, hospital, patient, visa |

### 3.14 `src/patients.ts`

Patient profile reads/writes. PII fields are encrypted at rest and written via RPCs.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `PatientForCase` | `{ full_name, date_of_birth, gender, country_of_residence, phone, avatar_url, medical_history }` | – | – | doctor, hospital |
| `fetchPatientForCase` | `(patientId) => { data: PatientForCase \| null }` | `patients` (decrypted computed columns; RLS "Doctors can view assigned patients") | Server | doctor, hospital |
| `updatePatientFullName` | `(fullName) => { error }` | RPC `update_patient_full_name` | Server | patient |
| `updatePatientPersonalInfo` | `(_userId, PersonalInfoPayload) => { error }` | RPC `update_patient_personal_info` | Server | patient |
| `updatePatientMedicalBackground` | `(_userId, MedicalPayload) => { error }` | RPC `update_patient_medical_background` (sensitive — never log) | Server | patient |
| `updatePatientEmergencyContact` | `(_userId, EmergencyContactPayload) => { error }` | RPC `update_patient_emergency_contact` | Server | patient |
| `updatePatientAvatarUrl` | `(userId, avatarUrl) => { error }` | update `patients.avatar_url` | Server | patient |
| `updatePatientNotificationPreferences` | `(userId, { email_notifications_enabled, sms_notifications_enabled }) => { error }` | update `patients` | Server | patient |

The `_userId` parameter on the RPC-backed updates is unused — the RPCs derive the user from `auth.uid()`.

### 3.15 `src/payments.ts`

Patient payments (treatment and consultation fees via Stripe).

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `PaymentWithCaseInfo` | `PaymentRow & { cases: { reference_number } }` | – | – | patient |
| `fetchPaymentsForPatient` | `(patientId) => { data: PaymentWithCaseInfo[] }` | `payments` ⋈ `cases` | Server | patient |
| `fetchLatestPaymentsForCases` | `(caseIds[]) => { data: Record<caseId, PaymentRow> }` | `payments` | Server | patient |
| `fetchPaymentForCase` | `(caseId) => { data: PaymentRow \| null }` | `payments` | Server | – |
| `upsertPendingConsultationPayment` | `({ caseId, consultationRequestId, patientId, amountAud, stripePaymentIntentId? }) => { data }` | `payments` (select pending by `consultation_request_id`; insert `payment_type = 'consultation_fee'`); RPC `set_payment_stripe_intent` | Server | patient |
| `upsertPendingPayment` | `({ caseId, treatmentOptionId, patientId, amountAud, stripePaymentIntentId? }) => { data }` | `payments` (pending `full_payment` per case); RPC `set_payment_stripe_intent` | Server | patient |

Both upserts use `set_payment_stripe_intent` as a concurrency gate: it only sets the intent ID if currently null; on a lost race the winning row is re-fetched.

### 3.16 `src/provider-messages.ts`

Provider (doctor/hospital/lawyer) ↔ admin messaging, one thread per account.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `ProviderAccountType` | `'doctor' \| 'hospital' \| 'lawyer'` | – | – | doctor, hospital, visa |
| `fetchProviderThread` | `(accountType, accountId) => { data: ProviderMessageThread \| null }` | `provider_message_threads` (by `doctor_id`/`hospital_id`/`lawyer_id`) | Server | doctor, hospital, visa |
| `fetchProviderMessages` | `(threadId) => { data: ProviderMessage[] }` | `provider_messages` | Server | doctor, hospital, visa |
| `fetchUnreadProviderMessageCount` | `(threadId) => { count }` | `provider_messages` | Server | doctor, hospital, visa |
| `sendProviderMessage` | `(threadId, senderType, senderId, body) => { error }` | insert `provider_messages` | Server | doctor, hospital, visa |
| `markProviderMessagesRead` | `(threadId) => { error }` | update `provider_messages` | Server | doctor, hospital, visa |
| `requestProviderThreadReopen` | `(threadId, reason) => { error }` | update `provider_message_threads` (closed only) | Server | doctor, hospital, visa |

### 3.17 `src/specialties.ts`

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `SpecialtyOption` | `{ name, label_en, label_zh }` | – | – | doctor, hospital, patient |
| `SpecialtyLabelMap` | `Record<name, { label_en, label_zh }>` | – | – | patient |
| `fetchActiveSpecialties` | `() => { data: SpecialtyOption[] }` | `specialties` (`is_active`, ordered by `sort_order`) | Server | doctor, hospital, patient |
| `fetchSpecialtyLabelMap` | `() => SpecialtyLabelMap` | `specialties` (including inactive) | Server | patient |

### 3.18 `src/storage.ts`

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `StorageObjectMeta` | `{ size, mimetype }` | – | – | – |
| `getStorageObjectMeta` | `(supabase, bucket, path) => StorageObjectMeta \| null` | Storage `list(folder, { search })` on any bucket — returns the authoritative size/MIME recorded at upload, used to validate client-reported metadata before inserting document rows | Caller-supplied (server) | doctor, hospital, patient, visa |

### 3.19 `src/treatment-plans.ts`

Doctor-authored treatment plans (encrypted clinical/financial columns exposed as computed columns).

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `TreatmentPlanStatus` | `'draft' \| 'submitted_to_iha' \| 'iha_review_in_progress' \| 'iha_approved' \| 'rejected_by_iha' \| 'presented_to_patient' \| 'patient_confirmed' \| 'not_selected'` | – | – | doctor, hospital, ui |
| `TreatmentType` | `'medication_only' \| 'surgery' \| 'therapy'` | – | – | doctor |
| `TreatmentPlan`, `TreatmentPlanSpecialist`, `TreatmentPlanWithSpecialists`, `SpecialistInput`, `SaveDraftTreatmentPlanInput` | hand-declared row/input types | – | – | doctor, hospital |
| `fetchTreatmentPlanForCase` | `(caseId, doctorId) => { data: TreatmentPlanWithSpecialists \| null }` | `treatment_plans` (explicit column list), `treatment_plan_specialists` | Server | doctor, hospital |
| `saveDraftTreatmentPlan` | `(input) => { data: { id } \| null }` | RPC `save_treatment_plan_draft` (cost total computed client-side from `cost_items`) | Server | doctor |
| `submitTreatmentPlan` | `(planId) => { error }` | RPC `submit_treatment_plan` | Server | doctor |
| `HospitalTreatmentPlanStatus` | `{ case_id, doctor_id, status }` | – | – | hospital |
| `fetchTreatmentPlanStatusesForHospital` | `(hospitalId) => { data: HospitalTreatmentPlanStatus[] }` | RPC `hospital_treatment_plan_statuses` | Server | hospital |
| `DoctorTreatmentPlanStatus` | `{ case_id, status }` | – | – | doctor |
| `fetchTreatmentPlanStatusesForDoctor` | `(doctorId) => { data }` | `treatment_plans` | Server | doctor |

### 3.20 `src/treatments.ts`

Patient-facing treatment options (published, priced view over `treatment_plans`).

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `CostItem`, `CostBreakdown` | `{ label, amount, labelKey? }`, `{ items, total }` | – | – | doctor, patient (also imported by `treatment-plans.ts`) |
| `TreatmentPlanSpecialistSummary` | type | – | – | patient |
| `TreatmentOptionWithDetails` | flattened option + plan + hospital + doctor + specialists | – | – | patient |
| `TreatmentOptionWithCaseInfo` / `TreatmentOptionWithPatientInfo` | above + `cases` (± `patients.full_name`) | – | – | patient / doctor |
| `fetchTreatmentOptionsForCase` | `(caseId) => { data: TreatmentOptionWithDetails[] }` | `treatment_options` ⋈ `treatment_plans` ⋈ `hospitals` ⋈ `doctors` ⋈ `treatment_plan_specialists` (published only) | Server | patient |
| `fetchConfirmedTreatmentsForDoctor` | `(doctorId) => { data: TreatmentOptionWithPatientInfo[] }` | same + `cases` ⋈ `patients`; filters `treatment_plans.doctor_id`, `is_selected = true` | Server | doctor |
| `fetchAllTreatmentOptionsForPatient` | `(patientId) => { data: TreatmentOptionWithCaseInfo[] }` | `cases` ⋈ `treatment_options!inner(...)` | Server | patient |
| `confirmTreatmentOption` | `(optionId) => { error }` | RPC `confirm_treatment_option` | Server | patient |

The internal `buildCostBreakdown` composes line items from doctor fees, hospital fees, plan `cost_breakdown.items`, specialists, and `mta_commission_aud` ("IHA Service Fee").

### 3.21 `src/visa-status.ts`

Client-safe constant (no server imports); re-exported by `visa.ts`.

| Export | Signature | Used by |
|---|---|---|
| `VISA_STATUS_TRANSITIONS` | `Record<string, string[]>` — `documents_submitted → under_review → processing → approved/rejected`; `additional_docs_requested → under_review/processing`; `application_submitted` (legacy source state) → `processing/approved/rejected` | visa (status-change dialog) |

### 3.22 `src/visa.ts`

Visa submissions and visa documents across patient, hospital, and lawyer portals. `visa_documents.source` distinguishes patient uploads, `hospital_generated` letters, and `lawyer_issued` approved visas.

| Export | Signature | Touches | Client | Used by |
|---|---|---|---|---|
| `VisaSubmissionRow`, `VisaDocumentRow`, `VisaSubmissionWithCase` | types | – | – | patient, visa |
| `fetchVisaSubmissionForCase` | `(caseId) => { data: VisaSubmissionRow \| null }` | `visa_submissions` (incl. decrypted `form_data`) | Server | patient |
| `fetchLawyerUserIdForCase` | `(caseId) => { data: string \| null }` | RPC `case_lawyer_user_id` | Server | patient |
| `fetchVisaSubmissionStatusesForCases` | `(caseIds[]) => { data: Record<caseId, status> }` | `visa_submissions` | Server | patient |
| `fetchVisaDocuments` | `(visaSubmissionId) => { data: VisaDocumentRow[] }` | `visa_documents` | Server | patient |
| `DocumentRequestWithStatus` | `visa_document_requests` row + `fulfilled` | – | – | patient, visa |
| `fetchDocumentRequestsForCase` | `(caseId) => { data: DocumentRequestWithStatus[] }` | `visa_document_requests`, `visa_documents` (fulfilled = matching-category lawyer-requested doc uploaded after request) | Server | patient, visa (re-exported from `apps/visa/lib/data/documents.ts`) |
| `VisaDocumentWithCase` | type | – | – | patient |
| `fetchAllVisaDocumentsForPatient` | `(patientId) => { data: VisaDocumentWithCase[] }` | `visa_documents` ⋈ `cases` | Server | patient |
| `PendingDocument` | `{ category, fileName, filePath, fileSizeBytes, mimeType }` | – | – | patient |
| `submitVisaApplicationRpc` | `(caseId, formData, pendingDocuments[]) => { data: { submissionId } \| null }` | validates with `visaFormSchema` / `pendingVisaDocumentsSchema` (`@iha/validations`); RPC `submit_visa_application` | Server | patient |
| `insertVisaDocument` | `({ visaSubmissionId, caseId, patientId, category, fileName, filePath, fileSizeBytes, mimeType }) => { data }` | reads `visa_document_requests` + `visa_documents` to set `requested_by_lawyer`; inserts `visa_documents` | Server | patient |
| `addVisaDocumentsForCaseRpc` | `(caseId, pendingDocuments[]) => { data: { submissionId, added } }` | RPC `add_visa_documents_for_case` | Server | patient |
| `insertUnlinkedVisaDocuments` | `(docs[]) => { error }` | insert `visa_documents` (no case) | Server | patient |
| `linkVisaDocumentToCaseRpc` | `(documentId, caseId) => { error }` | RPC `link_visa_document_to_case` | Server | patient |
| `createVisaDocumentSignedUrl` | `(filePath) => { url }` | Storage bucket **`visa-documents`** (1-hour signed URL) | Server | hospital, patient, visa |
| `fetchAllVisaSubmissionsWithCase` | `(patientId) => { data: VisaSubmissionWithCase[] }` | `visa_submissions` ⋈ `cases` | Server | patient |
| `fetchVisaSubmissionWithCaseDetail` | `(submissionId) => { data }` | `visa_submissions` ⋈ `cases` | Server | patient |
| `HospitalLetterType` | `'hospital_invitation' \| 'appointment_confirmation'` | – | – | hospital |
| `HospitalGeneratedDocument` | type | – | – | hospital, patient |
| `fetchHospitalGeneratedDocumentsForCase(s)` | `(caseId)` / `(caseIds[]) => { data: HospitalGeneratedDocument[] }` | `visa_documents` (`source = 'hospital_generated'`) | Server | hospital |
| `fetchSentHospitalDocumentsForCase(s)` | `(caseId)` / `(caseIds[]) => { data }` | `visa_documents` (hospital-generated, `sent_to_patient_at` not null) | Server | patient |
| `recordGeneratedVisaDocument` | `({ caseId, documentType, filePath, fileName, fileSizeBytes, mimeType }) => { data: { id } }` | RPC `generate_hospital_visa_document` | Server | hospital |
| `VISA_STATUS_TRANSITIONS` | re-export from `visa-status.ts` | – | – | visa |
| `updateVisaSubmissionStatusRpc` | `(caseId, status, rejectionReason?) => { error }` | RPC `update_visa_submission_status` (lawyer-only) | Server | visa |
| `fetchCaseProviderUserIds` | `(caseId) => { data: { hospitalUserId, doctorUserId } }` | RPC `get_case_provider_user_ids` | Server | visa |
| `markVisaDocumentSentToPatient` | `(documentId) => { data: { id, case_id, category } }` | RPC `send_visa_document_to_patient` | Server | hospital |
| `LawyerIssuedDocument` | type (`category: 'approved_visa'`) | – | – | patient, visa |
| `fetchLawyerIssuedDocumentsForCases` | `(caseIds[]) => { data: LawyerIssuedDocument[] }` | `visa_documents` (`source = 'lawyer_issued'`) | Server | visa |
| `fetchApprovedVisaDocumentForCase` | `(caseId) => { data: LawyerIssuedDocument \| null }` | delegates to the above | Server | patient |
| `recordLawyerVisaDocument` | `({ caseId, filePath, fileName, fileSizeBytes, mimeType }) => { data: { id, patientId } }` | RPC `record_lawyer_visa_document` | Server | visa |

---

## 4. Generated types

### 4.1 Files

| File | Maintained | Purpose |
|---|---|---|
| `types/database.types.ts` | **Generated** (~2,400 lines) — overwritten by `db:types` | Raw `Database` type and `Json` from `supabase gen types` (PostgREST version 14.5) |
| `types/computed-columns.ts` | Hand-written | Maps decrypted PII computed columns (exposed by Postgres functions `fn(row)`) to per-table types, pulling return types from `Functions[...]['Returns']` so drift fails compilation |
| `types/index.ts` | Hand-written (stable entry, `@iha/db/types`) | Merges computed columns into the `Row` types of `patients`, `cases`, `visa_submissions`, `hospitals`, `doctors`, `lawyers`; exports `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, `CompositeTypes` helpers and row aliases |

Always import from `@iha/db/types` (never `./database.types`) so the computed-column merge is applied.

Row aliases exported from `types/index.ts`: `Case`, `Patient`, `Hospital`, `Doctor`, `Lawyer` (all with every `*_enc` ciphertext column stripped via `OmitEncColumns`), plus `CaseDocument`, `Notification`, `ChatMessage`, `ChatThread`, `PaymentMethod`, `DoctorCaseAssignment`, `ProviderMessageThread`, `ProviderMessage`.

Computed columns merged per table:

| Table | Decrypted computed columns |
|---|---|
| `patients` | `phone`, `address`, `medical_history`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship`, `full_name`, `date_of_birth`, `allergies`, `current_medications`, `past_surgeries` |
| `cases` | `description` |
| `visa_submissions` | `form_data` |
| `hospitals` | `registration_number`, `abn_number`, `license_number` |
| `doctors` | `license_number`, `date_of_birth` |
| `lawyers` | `registration_number`, `abn_number` |

(`treatment_plans` / `treatment_plan_specialists` also have encrypted computed columns but are not merged here; `treatment-plans.ts` uses hand-declared row types instead.)

### 4.2 Regenerating

From the repo root (requires the Supabase CLI and a linked project — `supabase link`):

```bash
pnpm db:types
# = supabase gen types typescript --linked > packages/db/types/database.types.ts
```

After adding a new encrypted column: write the migration, run `pnpm db:types`, add the column to `types/computed-columns.ts`, and wire the table into `types/index.ts`.

### 4.3 Schema contents (`public`)

**Tables (28):** `audit_logs`, `case_documents`, `cases`, `chat_messages`, `chat_threads`, `consultation_requests`, `consultation_slots`, `doctor_case_assignments`, `doctor_fee_payments`, `doctor_hospital_affiliations`, `doctors`, `hospitals`, `lawyers`, `notifications`, `patients`, `payment_methods`, `payments`, `platform_fee_settings`, `provider_message_threads`, `provider_messages`, `specialties`, `treatment_options`, `treatment_plan_specialists`, `treatment_plans`, `visa_case_notes`, `visa_document_requests`, `visa_documents`, `visa_submissions`.

**Views (1):** `registration_requests` (`id`, `kind`, `display_name`, `status`, `rejection_reason`, `more_info_message`, `created_at`) — unified registration queue for admin review.

**Enums / composite types:** none. Status fields are `text` columns (constrained in SQL); TypeScript-level unions are declared by hand in the repository modules.

**Functions / RPCs**, grouped:

| Group | Functions |
|---|---|
| Registration & profile | `register_doctor`, `register_hospital`, `register_lawyer`, `resubmit_doctor_registration`, `resubmit_hospital_registration`, `resubmit_lawyer_registration`, `update_doctor_profile`, `update_doctor_professional_details`, `update_hospital_basic_info`, `update_hospital_details`, `update_lawyer_basic_info`, `update_lawyer_professional_details`, `update_patient_full_name`, `update_patient_personal_info`, `update_patient_medical_background`, `update_patient_emergency_contact`, `delete_patient_account`, `email_already_registered` |
| Cases & assignments | `insert_case`, `generate_case_reference`, `update_case_travel_assistance`, `respond_to_case_assignment`, `request_case_additional_info`, `start_case_evaluation`, `mark_case_completed` |
| Treatment plans/options | `save_treatment_plan_draft`, `submit_treatment_plan`, `hospital_treatment_plan_statuses`, `confirm_treatment_option` |
| Consultations | `request_online_consultation`, `propose_consultation_slots`, `select_consultation_slot`, `schedule_consultation_meeting`, `reschedule_consultation`, `cancel_consultation` |
| Payments & fees | `set_payment_stripe_intent`, `create_doctor_fee_payment`, `set_doctor_fee_payment_stripe_intent`, `notify_doctors_of_upcoming_annual_fee` |
| Visa | `submit_visa_application`, `add_visa_documents_for_case`, `link_visa_document_to_case`, `request_visa_document`, `update_visa_submission_status`, `generate_hospital_visa_document`, `send_visa_document_to_patient`, `record_lawyer_visa_document`, `get_case_provider_user_ids`, `case_lawyer_user_id`, `case_patient_user_id` |
| Access-check helpers (RLS) | `doctor_has_access_to_patient`, `doctor_owns_consultation_request`, `doctor_owns_treatment_option`, `hospital_has_access_to_assignment`, `hospital_has_access_to_case`, `hospital_has_access_to_patient`, `hospital_has_confirmed_plan_for_case`, `lawyer_has_access_to_case`, `lawyer_has_access_to_patient` |
| Audit / storage / crypto | `log_audit_event`, `get_storage_object_names`, `encrypt_pii`, `decrypt_pii`, `pii_encryption_key` |
| Decrypted computed columns | `abn_number`, `address`, `aftercare`, `allergies`, `cost_aud`, `cost_breakdown`, `cost_notes`, `current_medications`, `date_of_birth`, `description`, `diagnosis`, `doctor_fees_aud`, `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship`, `estimated_length_of_stay`, `expected_outcome`, `form_data`, `full_name`, `hospital_fees_aud`, `license_number`, `medical_history`, `notes`, `past_surgeries`, `patient_instructions`, `phone`, `procedure_name`, `recovery_time`, `registration_number`, `special_requirements`, `specialist_name`, `success_rate`, `technique` |

### 4.4 Storage buckets referenced

| Bucket | Referenced by |
|---|---|
| `case-documents` | `cases.ts` (`createCaseDocumentSignedUrl`), Edge Function (folder = `patients.id`) |
| `visa-documents` | `visa.ts` (`createVisaDocumentSignedUrl`), Edge Function (folder = `user_id`) |
| `avatars` | Edge Function (folder = `user_id`) |
| any | `storage.ts` (`getStorageObjectMeta` takes the bucket as a parameter) |

---

## 5. Edge Functions

### 5.1 `supabase/functions/hard-delete-expired-patients/index.ts`

| Aspect | Detail |
|---|---|
| Runtime | Deno (`Deno.serve`), `npm:@supabase/supabase-js@2` |
| Trigger | HTTP, invoked by a Supabase **Cron Trigger** configured in the Supabase dashboard (the schedule is not defined in this repo). It replaces the earlier pg_cron job (`hard-delete-expired-patients`), which was unscheduled in migration `20260629000001` because direct deletes from `storage.objects` are no longer allowed. |
| Auth | Requires header `x-cron-secret` equal to `CRON_SECRET`; otherwise `401`. Gateway JWT verification is explicitly not relied upon, since the public anon key would pass it. |
| Env vars | `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Logic:

1. Selects `patients` where `is_deleted = true` and `scheduled_delete_at <= now()` (soft delete sets this to 30 days ahead).
2. For each patient, for each of the buckets `case-documents` (folder = patient `id`), `visa-documents` and `avatars` (folder = `user_id`): calls RPC `get_storage_object_names(p_bucket_id, p_folder)` (service-role-only, security definer) and removes the returned objects via the Storage API.
3. Calls `auth.admin.deleteUser(user_id)`; FK cascades remove `patients`, `cases`, `case_documents`, `visa_submissions`, `visa_documents`, `payment_methods`, `notifications`, etc.
4. Per-patient errors are captured with the failing `step` (`list:<bucket>`, `remove:<bucket>`, `deleteUser`) and processing continues.
5. Responds `{ processed, results: [{ patientId, status: 'deleted' | 'error', step?, detail? }] }`.

---

## 6. `supabase/config.toml`

Minimal local-development config (the hosted project is attached with `supabase link`):

| Setting | Value |
|---|---|
| `project_id` | `iha-platform` |
| `[api]` | `enabled = true`, `port = 54321` |
| `[db]` | `port = 54322`, `major_version = 15` |
| `[studio]` | `enabled = true`, `port = 54323` |

No auth, storage, or function-specific sections are defined, so CLI defaults apply. The `supabase/.temp` and `.branches` files are CLI link state (currently empty).

---

## 7. Notes, patterns and potential issues

### Patterns

- **Untyped-client casts.** Many modules cast the typed client to small hand-written interfaces (`SimpleClient`, `RpcClient`, `UntypedClient`, `*RpcClient`) to work around supabase-js generics resolving `.insert()/.update()/.rpc()` arguments as `never`, or to call RPCs/tables that were absent from the generated types when the code was written. This removes compile-time checks on column names and argument names for those calls.
- **RPC-first writes for encrypted data.** Anything touching PII or clinical data (patient profile, case description, visa form data, treatment plans) is written through security-definer RPCs that encrypt server-side and derive the actor from `auth.uid()`. Reads use explicit column lists because `select('*')` returns only physical columns, not decrypted computed columns.
- **RLS as the scoping mechanism.** Several reads rely on RLS rather than explicit filters (e.g. `fetchConsultationRequestsForDoctor` ignores its `doctorId` argument).
- **Trigger + app alert split.** DB triggers insert in-portal `notifications`; the app then calls `dispatch*Alerts` to send email/SMS via `@iha/notifications`, reusing the trigger's text. Manual DB edits therefore never produce email/SMS.
- **Client-safe split modules.** `visa-status.ts` and `consultations-shared.ts` exist so Client Components can import constants without pulling in `next/headers`.

### Potential issues

1. **Stale comments vs. generated types.** `database.types.ts` now contains `email_already_registered`, `treatment_plans`, `treatment_plan_specialists`, `doctor_fee_payments`, `platform_fee_settings`, and `visa_documents.source/case_id/sent_to_patient_at`, yet `auth-lookup.ts`, `treatment-plans.ts`, `treatments.ts`, `doctor-fees.ts`, and `visa.ts` still say these are missing and use hand-declared types/casts. These could be migrated to generated types to regain type safety.
2. **Stale cross-reference in `visa.ts`.** `fulfillsPendingDocumentRequest` says it mirrors logic in `apps/visa/lib/data/documents.ts`; that file now simply re-exports `fetchDocumentRequestsForCase` from `@iha/db/visa`, so the duplicated "fulfilled" heuristic lives in two functions within `visa.ts` itself.
3. **Patient-only alert fan-out.** `insertNotification` → `sendNotificationAlerts` looks up contact preferences only in `patients`. Notifications addressed to doctors, hospitals, or lawyers via `insertNotification` (used by hospital and visa apps) get the in-portal row but never email/SMS.
4. **Unused exports.** `dispatchCaseAssignmentAlertsToDoctor` (explicitly dormant), `insertNotificationWithClient`, `fetchLatestNotificationForCase`, `fetchConsultationSlotById`, and `fetchPaymentForCase` have no callers in `apps/`.
5. **Duplicated code.** `upsertPendingPayment` and `upsertPendingConsultationPayment` are near-identical; the hospital/lawyer document fetchers repeat the same query with different filters.
6. **N+1 / sequential queries.** `findOtherRoleAccount` queries up to four tables one after another; `fetchTreatmentPlanForCase` makes two round trips.
7. **Non-atomic notification de-dup.** The 60-second duplicate check in `insertNotificationWithClient` is a separate select before the insert, so concurrent calls can both insert.
8. **Ignored parameters.** `updatePatientPersonalInfo`, `updatePatientMedicalBackground`, and `updatePatientEmergencyContact` accept a `_userId` they do not use; `fetchConsultationRequestsForDoctor` ignores `doctorId`. This is safe (RLS / `auth.uid()`) but potentially misleading.
9. **Service-role exposure surface.** `createServiceClient` is importable from any server file via `@iha/db/server`; nothing (such as `server-only`) prevents accidental use in code that could reach the client bundle, beyond the `next/headers` import already in that module.
10. **Edge Function schedule not in source control.** The Cron Trigger and its `x-cron-secret` header are configured in the Supabase dashboard; `config.toml` has no `[functions]` section, so `verify_jwt` and other function settings use defaults.
11. **`getStorageObjectMeta` uses a prefix search.** `list(folder, { search: fileName, limit: 1 })` matches by substring, so with similarly named files the exact match may not be in the single returned entry and the function would return `null`.
