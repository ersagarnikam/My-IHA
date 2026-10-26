# Data model

Schema: `backend/src/main/resources/db/migration/` — `V1__core_schema.sql` (all core tables), `V2__seed_reference_data.sql` (specialties, platform fees), `V3__patient_portal.sql`, `V4__doctor_portal.sql`, `V5__initial_consultation.sql`. Columns ending in `_enc` are AES-GCM encrypted by the API.

## Entity overview

```mermaid
erDiagram
  app_users ||--o| patients : "is"
  app_users ||--o| doctors : "is"
  app_users ||--o| hospitals : "is"
  app_users ||--o| lawyers : "is"
  patients ||--o{ cases : submits
  cases ||--o{ case_documents : has
  cases ||--o{ case_document_requests : "doctor asks for"
  cases ||--o{ doctor_case_assignments : "doctors invited"
  doctors ||--o{ doctor_case_assignments : receives
  doctors ||--o{ doctor_hospital_affiliations : "works with"
  hospitals ||--o{ doctor_hospital_affiliations : ""
  cases ||--o{ treatment_plans : "one per doctor"
  treatment_plans ||--o{ treatment_plan_specialists : includes
  treatment_plans ||--o| treatment_options : "published as"
  treatment_options ||--o{ consultation_requests : "patient asks about"
  consultation_requests ||--o{ consultation_slots : "doctor proposes"
  cases ||--o{ payments : "paid by patient"
  doctors ||--o{ doctor_fee_payments : pays
  cases ||--o| visa_submissions : "visa application"
  visa_submissions ||--o{ visa_documents : ""
  patients ||--|| chat_threads : "support chat"
  chat_threads ||--o{ chat_messages : ""
  doctors ||--o| provider_message_threads : "support chat"
  provider_message_threads ||--o{ provider_messages : ""
  app_users ||--o{ notifications : receives
```

## Tables

| Table | Purpose |
|---|---|
| `app_users` | Every login: email, BCrypt hash, role, verified flag. |
| `email_verification_codes` | 6-digit codes for email verification and password reset (hashed, expiring, attempt-limited). |
| `specialties` | Medical specialties (English/Chinese labels, sort order). |
| `platform_fee_settings` | Admin-editable fees, one row per key (`fees/FeeSettingsService` holds the catalogue): `doctor_registration_fee` (default AUD 5,000), `doctor_annual_fee` (2,000), `consultation_fee` (200), `mta_service_fee_pct` (10, a percentage), `lawyer_*` and `hospital_*` registration/annual fees (0, not charged yet). `updated_by` records the last admin. |
| `provider_verifications` | Register checks MTA recorded on a doctor (AHPRA), hospital (accreditation, licence) or lawyer (MARN, practising certificate — V13): outcome, valid until, details, who and when (V11). The latest per kind is current. |
| `consents` | What each user agreed to at sign-up (`terms_and_privacy`, patients also `health_information`) and the consent version (V12). |
| `business_settings` | Privacy policy and terms links, consent version and retention years (V12); MTA's legal name, ABN, address, billing email, GST registration and per-charge GST classification (key/value, V10). |
| `platform_fee_changes` | History of fee changes: key, old and new amount, reason, who, when (V7). |
| `patients` | Patient profile: personal details, encrypted DOB and medical background, emergency contact, avatar, alert preferences, Stripe customer, deletion schedule. Deleted accounts: `is_deleted`, `scheduled_delete_at`, then `account_closed_at` and `retain_until` (V12; records kept until then, then purged). |
| `doctors` | Doctor profile: registration details, encrypted DOB and licence, specialties, languages, working days, availability (JSON), registration documents (JSON), approval status, fee dates, alert preferences, time zone, indemnity declaration (insurer, encrypted policy number, expiry, overseas cover, telehealth acknowledgement, declared at — V11). |
| `doctor_hospital_affiliations` | Hospitals a doctor works with (plan hospitals come from here). |
| `doctors.time_zone`, `hospitals.time_zone` | The Australian IANA zone the account works in (V9, default `Australia/Brisbane`). |
| `hospitals` | Hospital accounts: seeded reference hospitals (no login, approved) and hospitals registered through the hospital portal (`status` pending → approved / rejected / more_info_requested, registration and licence numbers and ABN encrypted, `certificates` JSON list of registration documents, notification preferences, declared accreditation and licence expiry dates — V11). |
| `lawyers` | Visa lawyer accounts: individual or law firm, encrypted ABN and credential number, credential type (`marn` / `practising_certificate`), practising state, credential expiry, contact, registration documents (JSON), approval status, alert preferences, time zone (V13). |
| `cases` | A patient's medical case: reference `MTA-<year>-<seq>`, specialty, description, status, travel-assistance flags. |
| `case_documents` | Medical documents (and standalone uploads not yet linked to a case). |
| `case_document_requests` | Documents a doctor requested during evaluation; `pending` until the patient adds one of that type, then `received`. |
| `doctor_case_assignments` | Admin's invitation of a doctor to a case and the doctor's progress on it. |
| `treatment_plans` | One per doctor per case; clinical and cost fields encrypted. |
| `treatment_plan_specialists` | Extra specialists and their fees on a plan. |
| `treatment_options` | A plan as offered to the patient, with MTA's commission; `selected` when chosen. |
| `consultation_requests`, `consultation_slots` | Paid online consultations and the proposed times. |
| `payments`, `payment_methods` | Patient payments (treatment, consultation fee) and saved cards. |
| `doctor_fee_payments` | Doctor registration and annual fees (status `pending`, `completed`, `failed`, `refunded`). |
| `payment_refunds` | Admin refunds of either kind of payment (`payment_kind` `patient`/`doctor`): amount, card fee deducted (`fee_source` `stripe`, `estimate`, `waived` or `none`), amount back to the card, reason and note, provider refund id and status (`pending`, `succeeded`, `failed`), who and when (V8). A payment refunded in full gets status `refunded`. |
| `visa_submissions`, `visa_documents`, `visa_document_requests`, `visa_case_notes` | Visa application, its documents (patient uploads; hospital letters — `source = hospital_generated`, `hospital_id`, one per case and category, visible to the patient once `sent_to_patient_at` is set; approved visa), lawyer requests (category, what is needed, instructions) and the lawyer's confidential notes. `assigned_lawyer_id` is set by MTA admin; the lawyer issues the approved visa (`source = lawyer_issued`, one per case). |
| `chat_threads`, `chat_messages` | Patient ↔ coordinator chat. |
| `provider_message_threads`, `provider_messages` | Doctor/hospital/lawyer ↔ admin chat (one thread per provider account). |
| `notifications` | In-portal notifications (title, message, type, case). |
| `audit_logs` | Who did what, when (no sensitive values). |

## Case lifecycle

```mermaid
stateDiagram-v2
  [*] --> case_submitted: patient submits
  case_submitted --> under_review: admin assigns a doctor
  under_review --> doctor_assigned: a doctor accepts
  doctor_assigned --> evaluation: doctor starts evaluation
  evaluation --> treatment_plan: admin publishes a plan
  treatment_plan --> treatment_confirmed: patient selects an option
  treatment_confirmed --> payment_confirmed: payment succeeds
  payment_confirmed --> visa_documents_submitted: patient submits visa application
  visa_documents_submitted --> visa_processing: lawyer
  visa_processing --> travel_ready: visa approved
  visa_processing --> visa_rejected: visa refused
  payment_confirmed --> completed: doctor confirms treatment
  visa_processing --> completed
  travel_ready --> completed
  completed --> [*]
```

`closed` is an administrative end state. Every change goes through `CaseStatusService.transition`, which also writes the patient's timeline notification. The lawyer transitions (`visa_processing`, `travel_ready`, `visa_rejected`) arrive with the lawyer portal.

## Doctor assignment lifecycle

| Status | Meaning |
|---|---|
| `invited` | Admin invited the doctor (doctor sees "New"). |
| `accepted` | Doctor accepted; `evaluation_started_at` and `plan_submitted_at` record their own progress. |
| `declined` | Doctor declined (optional reason for admin). |
| `withdrawn` | Doctor withdrew after accepting. |
| `cancelled` | Closed by the system, e.g. another doctor's plan was chosen ("Case Closed"). |

Several doctors can be invited to the same case; each evaluates and proposes a plan independently.

## Treatment plan lifecycle

`draft` → `submitted_to_iha` (doctor submits) → `iha_review_in_progress` / `iha_approved` / `rejected_by_iha` (admin) → `presented_to_patient` (published as an option) → `patient_confirmed` (chosen and paid) or `not_selected`. A declined plan keeps admin's reason in `rejection_reason` (V6).
Only drafts are editable.

## Consultation lifecycle

Two kinds share one table (`consultation_requests.kind`):

- **initial** — before the plan. The doctor creates it during evaluation with proposed times (starts at `slots_proposed`); `doctor_id` is set, there's no treatment option. A doctor's plan can only be submitted once it has taken place (scheduled and its start time passed) or the doctor recorded a skip reason (`doctor_case_assignments.consultation_skipped_reason`).
- **option** — after the plan. The patient asks about a published treatment option (`treatment_option_id`).

`requested` (patient) → `slots_proposed` (doctor, 1–3 times; can be updated) → `slot_selected` (patient picks; AUD 200 fee due) → `scheduled` (paid; Zoom meeting created). The doctor can cancel at any point before `scheduled`. "Completed" in the doctor UI is a scheduled consultation whose time has passed.

## Doctor account lifecycle

`pending` (registered) → `approved` / `rejected` / `more_info_requested` (admin). Rejected and more-info doctors can resubmit (back to `pending`). An approved doctor pays the registration fee (`registration_fee_paid_at`), which unlocks the portal and sets `annual_fee_next_due_at` one year later; each annual payment moves it on by a year.

## Payments

| Table | `payment_type` / `fee_type` | Created when | Completed by |
|---|---|---|---|
| `payments` | `full_payment` | patient selects an option | webhook → plan `patient_confirmed`, case `payment_confirmed` |
| `payments` | `consultation_fee` | patient selects a slot | webhook → consultation `scheduled` (+ Zoom) |
| `doctor_fee_payments` | `registration` / `annual` | doctor starts checkout | webhook → doctor fee dates |

Status: `pending` → `completed` or `failed`. At most one pending row per purpose (locked get-or-create).
