# API reference

Base URL: `http://localhost:8080` in development (the web app proxies `/api`). All bodies are JSON unless marked *multipart*. Authenticated calls send `Authorization: Bearer <accessToken>`.

**Errors** are problem details: `{ "status", "code", "detail", "fieldErrors"? }`. Common codes: `validation_failed` (with `fieldErrors`), `invalid_transition`, `not_found` (404 also for other users' records), `unauthorized`, `forbidden`. Role-specific codes are listed below where they matter.

## Public and shared

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register/patient` | Create a patient account `{fullName, email, password}`; emails a code. 202. |
| POST | `/api/auth/register/doctor` | Create a doctor login `{email, password}`; emails a code. 202. |
| POST | `/api/auth/verify` | `{email, code}` → `{accessToken, expiresAt, user}`. |
| POST | `/api/auth/resend-code` | `{email}`; silent for unknown emails. |
| POST | `/api/auth/login` | `{email, password}` → session. `email_not_verified` → verify first. |
| POST | `/api/auth/forgot-password` | `{email}`; emails a reset code (silent for unknown emails). |
| POST | `/api/auth/reset-password` | `{email, code, password}`. |
| GET | `/api/auth/me` | Current user `{id, email, role}`. |
| PUT | `/api/auth/password` | `{currentPassword, newPassword}`. |
| GET | `/api/specialties` | Medical specialties (public). |
| GET | `/api/notifications?limit=50` | The caller's notifications, newest first (max 200). |
| GET | `/api/notifications/unread-count` | `{count}`. |
| POST | `/api/notifications/{id}/read` | Mark one read. |
| POST | `/api/notifications/read-all` | Mark all read. |
| GET | `/api/realtime` | Server-sent events: `notification`, `chat_message`, `provider_message`. |
| POST | `/api/payments/webhook` | Stripe webhook (signature-checked; public). |

Passwords: at least 8 characters with an uppercase letter and a number.

## Patient (`PATIENT` role)

### Profile and account

| Method | Path | Description |
|---|---|---|
| GET | `/api/patient/profile` | Profile incl. `profileComplete` (onboarding gate). |
| PUT | `/api/patient/profile/personal-info` | Name, date of birth, gender, nationality, country, phone, address. |
| PUT | `/api/patient/profile/medical-background` | Medical history, allergies, medications, past surgeries. |
| PUT | `/api/patient/profile/emergency-contact` | Name, relationship, phone. |
| PUT | `/api/patient/profile/notification-preferences` | Email / SMS toggles. |
| PUT / GET | `/api/patient/profile/avatar` | Upload (*multipart* `file`) / download the photo. |
| DELETE | `/api/patient/account` | `{confirm: "DELETE"}` — schedules deletion (30-day grace period, then hard delete). |
| GET | `/api/patient/dashboard` | Dashboard summary (cases, next action, counts). |

### Cases and documents

| Method | Path | Description |
|---|---|---|
| GET | `/api/patient/cases` | The patient's cases. |
| POST | `/api/patient/cases` | *Multipart*: `specialty`, `specialtyOther`, `description` (50–2000), `files[]` + `documentTypes[]`. |
| GET | `/api/patient/cases/{caseId}` | Case detail with documents and timeline. |
| POST | `/api/patient/cases/{caseId}/documents` | *Multipart* add documents (until a plan exists; max 10 per case). |
| PUT | `/api/patient/cases/{caseId}/travel-assistance` | Travel / stay / transport assistance flags. |
| GET | `/api/patient/documents` | All medical and visa documents. |
| POST | `/api/patient/documents` | *Multipart* standalone upload, optionally into a case. |
| POST | `/api/patient/documents/{category}/{documentId}/link` | Attach a standalone document to a case. |
| GET | `/api/patient/documents/medical/{id}/content` | Open / download (`?download=true`). |
| GET | `/api/patient/documents/visa/{id}/content` | Open / download. |

Document types: `lab_report`, `mri_ct`, `xray`, `prescription`, `medical_history`, `other`. Files: PDF, JPEG, PNG up to 10 MB.

### Treatment options, consultations, payments

| Method | Path | Description |
|---|---|---|
| GET | `/api/patient/treatment-options` | All published options across cases. |
| GET | `/api/patient/cases/{caseId}/treatment-options` | Options for a case (with cost breakdown). |
| GET | `/api/patient/cases/{caseId}/treatment-options/selected` | The chosen option. |
| GET | `/api/patient/treatment-options/{optionId}` | One option. |
| POST | `/api/patient/treatment-options/{optionId}/select` | Choose it → case `treatment_confirmed`, payment pending. |
| POST | `/api/patient/treatment-options/{optionId}/consultation` | Request a paid online consultation. |
| GET | `/api/patient/consultations` · `/api/patient/cases/{caseId}/consultations` · `/api/patient/consultations/{id}` | Consultations with proposed slots; `kind` (`initial` / `option`) and `doctorName`. |
| POST | `/api/patient/consultations/{id}/select-slot` | `{slotId}` → awaiting payment. |
| GET | `/api/patient/payments/config` | Provider name and publishable key. |
| POST | `/api/patient/cases/{caseId}/checkout` | Start/resume the treatment payment → client secret. |
| POST | `/api/patient/consultations/{id}/checkout` | Start/resume the consultation fee payment. |
| POST | `/api/patient/payments/simulate/{intentId}` | Simulated provider only: complete the payment. |
| GET | `/api/patient/payments` | Payment history. |
| GET | `/api/patient/payments/{paymentId}/invoice` | PDF invoice. |
| GET / POST | `/api/patient/payment-methods` | Saved cards / attach a card. |
| POST | `/api/patient/payment-methods/{id}/default` | Make default. |
| DELETE | `/api/patient/payment-methods/{id}` | Remove. |

### Visa and chat

| Method | Path | Description |
|---|---|---|
| GET | `/api/patient/cases/{caseId}/visa` | Visa state: letters ready, documents, submission. |
| POST | `/api/patient/cases/{caseId}/visa/documents` | *Multipart* upload a visa document (`category`, `file`). |
| POST | `/api/patient/cases/{caseId}/visa` | Submit the application form (validated server-side). |
| GET | `/api/patient/visa-submissions` · `/{submissionId}` | Applications and detail. |
| POST | `/api/patient/visa-submissions/{id}/documents` | Answer a lawyer's document request. |
| GET | `/api/patient/chat` | Support thread with messages. |
| GET | `/api/patient/chat/unread-count` | `{count}`. |
| POST | `/api/patient/chat/messages` | `{body}`; `thread_closed` when closed. |
| POST | `/api/patient/chat/read` | Mark coordinator messages read. |
| POST | `/api/patient/chat/reopen-request` | `{reason}` (10–500). |

## Doctor (`DOCTOR` role)

### Registration and gate

| Method | Path | Description |
|---|---|---|
| GET | `/api/doctor/account` | `{registered, doctor}` — status (`pending`, `approved`, `rejected`, `more_info_requested`), `active`, fee dates, profile. |
| GET | `/api/doctor/hospitals` | Approved hospitals to choose affiliations from. |
| POST | `/api/doctor/registration` | *Multipart* registration (see fields below). 201. |
| PUT | `/api/doctor/registration` | *Multipart* resubmission (only when rejected / more info requested); files optional, earlier documents kept. |
| GET | `/api/doctor/registration/documents/{index}` | Download an uploaded registration document. |
| GET | `/api/doctor/billing/fees` | `{registrationFeeAud, annualFeeAud}`. |

Registration fields: `fullName`, `contactPhone`, `specialties[]`, `qualifications`, `yearsOfExperience` (0–70), `licenseNumber` (AHPRA: 3 letters + 10 digits), `bio`, `languagesSpoken[]`, `department`, `role` (`consultant` / `surgeon`), `hospitalIds[]`, `workingDays[]` (`mon`…`sun`), files `photo`, `medicalLicense`, `degreeCertificate` (both required on first registration), `otherDocuments[]`.

Everything below requires an **active** doctor (approved and registration fee paid); otherwise `403 doctor_not_approved` / `registration_fee_unpaid` / `doctor_profile_missing`.

### Cases and treatment plans

| Method | Path | Description |
|---|---|---|
| GET | `/api/doctor/cases` | Assigned cases with assignment, case status and plan status. |
| GET | `/api/doctor/cases/{caseId}` | Detail: patient info and history, documents, document requests, plan summary, consultations. |
| GET | `/api/doctor/cases/{caseId}/documents/{documentId}/content` | Open / download a patient document. |
| POST | `/api/doctor/assignments/{assignmentId}/respond` | `{status: accepted|declined|withdrawn, declineReason?}`. Accepting moves `under_review` → `doctor_assigned`. |
| POST | `/api/doctor/cases/{caseId}/start-evaluation` | `doctor_assigned` → `evaluation`; records this doctor's start. |
| POST | `/api/doctor/cases/{caseId}/document-requests` | `{documentTypes[], message?}` (evaluation only). Notifies + alerts the patient. |
| POST | `/api/doctor/cases/{caseId}/initial-consultation` | `{slots: [...]}` — book the initial Zoom consultation (1–3 slots, Brisbane time) during evaluation. Patient is notified to choose a time. |
| POST | `/api/doctor/cases/{caseId}/initial-consultation/skip` | `{reason}` (≥10 chars) — record why it isn't needed; cancels an unpaid one. Not possible once paid. |
| POST | `/api/doctor/cases/{caseId}/complete` | From `payment_confirmed`/`visa_processing`/`travel_ready`, after the plan's end date → `completed`. |
| GET | `/api/doctor/cases/{caseId}/treatment-plan` | The doctor's plan (or empty) + affiliated hospitals with room types. |
| PUT | `/api/doctor/cases/{caseId}/treatment-plan` | Save draft (all fields optional; validated where filled). |
| POST | `/api/doctor/cases/{caseId}/treatment-plan/submit` | Save + check required fields + submit to MTA; notifies the hospital. `409 initial_consultation_required` until the initial consultation has taken place or was skipped. |

Plan fields: `diagnosis`, `treatmentType` (`medication_only`/`surgery`/`therapy`), `procedureName`, `description`, `technique`, `expectedOutcome`, `successRate`, `treatmentStartDate`, `treatmentEndDate`, `recoveryTime`, `estimatedLengthOfStay`, `hospitalId`, `department`, `roomCategory`, `specialRequirements`, `doctorFeesAud`, `hospitalFeesAud`, `costItems[{label, amount}]`, `costNotes`, `patientInstructions`, `aftercare[]`, `specialists[{specialistType, specialistName, costAud, notes}]`.
Required to submit: hospital, diagnosis (≥10 chars), treatment type, procedure, doctor fees > 0, start and end dates, estimated stay. Specialist types: `anaesthetist`, `radiologist`, `pathologist`, `rehabilitation`, `other`.

### Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/api/doctor/insights` | Dashboard figures: earnings and return on fees, patients treated, specialty rank, cases received, acceptance rate (and platform average), response time, profile strength, funnel, decline reasons, anonymised price benchmark, recent patient uploads, verification. |

### Consultations

| Method | Path | Description |
|---|---|---|
| GET | `/api/doctor/consultations` | The doctor's consultations: `kind` `initial` (before the plan) or `option` (follow-up about a published plan). |
| GET | `/api/doctor/consultations/{id}` | Detail with slots, selected slot, Zoom link. |
| POST | `/api/doctor/consultations/{id}/slots` | `{slots: [{date: "2026-11-02", startTime: "09:30", endTime: "10:00"}]}` — 1–3 slots, Brisbane time, future, on or before the treatment start date. Replaces earlier proposals. |
| POST | `/api/doctor/consultations/{id}/cancel` | `{reason}` (≥5 chars); not once scheduled (paid). |

### Billing, messages, settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/doctor/billing` | Fees, paid/next-due dates, `annualFeeDue`, payment history, provider. |
| POST | `/api/doctor/billing/checkout` | `{feeType: registration|annual}` → client secret. |
| POST | `/api/doctor/billing/simulate/{intentId}` | Simulated provider only. |
| GET | `/api/doctor/billing/payments/{id}/invoice` | PDF invoice. |
| GET | `/api/doctor/messages` | Support thread with MTA. |
| GET | `/api/doctor/messages/unread-count` | `{count}`. |
| POST | `/api/doctor/messages` | `{body}`; `thread_closed` when closed. |
| POST | `/api/doctor/messages/read` | Mark admin messages read. |
| POST | `/api/doctor/messages/reopen-request` | `{reason}`. |
| PUT | `/api/doctor/profile/personal` | `{fullName, contactPhone, dateOfBirth, gender}`. |
| PUT | `/api/doctor/profile/professional` | Specialties, qualifications, experience, licence, bio, languages, department, role, hospitalIds. |
| PUT | `/api/doctor/profile/availability` | Seven `{day, enabled, start_time, end_time}` entries, Monday–Sunday. |
| PUT | `/api/doctor/profile/notification-preferences` | `{emailNotificationsEnabled, smsNotificationsEnabled}`. |
| PUT / GET | `/api/doctor/profile/photo` | Upload (*multipart* `file`) / download. |

## Admin (`ADMIN` role)

See the [admin portal](admin-portal.md) guide.

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/overview` | Counts for the sidebar badges, plus the latest cases. |
| GET | `/api/admin/insights` | Dashboard figures: platform totals, money (12 months, by month), case pipeline, per-doctor stats, doctors by status, specialty coverage, stale invitations, fee alerts, upcoming consultations. |
| GET | `/api/admin/doctors` | All doctor registrations. |
| GET | `/api/admin/doctors/{id}` | Registration detail with documents and review messages. |
| GET | `/api/admin/doctors/{id}/performance` | One doctor's stats, membership fees paid and the cases they were invited to. |
| GET | `/api/admin/doctors/{id}/documents/{index}` | A registration document (`?download=true` to download). |
| POST | `/api/admin/doctors/{id}/review` | `{outcome: approved|rejected|more_info_requested, reason}`; reason required unless approving; `not_pending` otherwise. |
| GET | `/api/admin/cases` | All cases with patient, specialty and assigned doctors. |
| GET | `/api/admin/cases/{id}` | Case detail: description, documents, assignments, plans, consultations. |
| GET | `/api/admin/cases/{id}/documents/{docId}/content` | A case document. |
| GET | `/api/admin/cases/{id}/candidates` | Active doctors to invite, matching specialty first. |
| POST | `/api/admin/cases/{id}/assignments` | `{doctorId}`; `doctor_not_active`, `already_assigned`. |
| GET | `/api/admin/plans` | Submitted and later plans (`?status=` to filter). |
| GET | `/api/admin/plans/{id}` | Full plan with costs and the suggested service fee. |
| POST | `/api/admin/plans/{id}/publish` | `{mtaCommissionAud}` → published as a treatment option. |
| POST | `/api/admin/plans/{id}/reject` | `{reason}` (≥ 10 characters). |
| GET | `/api/admin/chats` | Patient and provider threads with unread counts and reopen requests. |
| GET | `/api/admin/chats/{kind}/{id}` | One thread (`kind` = `patient` or `provider`); marks the other side's messages read. |
| POST | `/api/admin/chats/{kind}/{id}/open` · `/close` | Open or close the conversation. |
| POST | `/api/admin/chats/{kind}/{id}/messages` | `{body}`. |

## Development only (`dev` profile)

Not available in production. They act only on the caller's own records.

| Path | Plays |
|---|---|
| `POST /api/dev/cases/{caseId}/treatment-options` | admin + doctors: publish two options |
| `POST /api/dev/consultations/{id}/propose-slots` | doctor |
| `POST /api/dev/cases/{caseId}/hospital-letters` | hospital |
| `POST /api/dev/chat/open` | admin (patient chat) |
| `POST /api/dev/doctor/approve` · `/request-more-info` | admin review |
| `POST /api/dev/doctor/assign-case` | patient + admin: new case invitation |
| `POST /api/dev/doctor/cases/{caseId}/upload-requested` | patient uploads requested documents |
| `POST /api/dev/doctor/cases/{caseId}/publish-plan` | admin publishes the plan |
| `POST /api/dev/doctor/cases/{caseId}/request-consultation` | patient |
| `POST /api/dev/doctor/consultations/{id}/select-and-pay` | patient picks the first slot and pays |
| `POST /api/dev/doctor/consultations/{id}/mark-held` | time travel: a booked consultation has taken place |
| `POST /api/dev/doctor/chat/open` | admin (doctor chat) |
