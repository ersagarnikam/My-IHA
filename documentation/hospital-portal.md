# Hospital portal

The partner hospital's workspace at `/hospital` (role `HOSPITAL`, API under `/api/hospital/**`). English only, like the doctor portal; it reuses the doctor portal's styles and shared pieces (`portals/doctor/doctor.css`, the support chat, notification bell and password form) plus its own `portals/hospital/hospital.css`. Backend: the `hospital` package. Port of the old `apps/hospital` (see `docs/apps-hospital.md`).

## Who sees what

- A hospital **sees a case** (with its patient and treating doctor) once a doctor affiliated with it submits a treatment plan that names the hospital — any plan status except draft (old RLS `hospital_has_access_to_case`). One case can reach the hospital through two doctors, so case pages are keyed by **plan id** (`/hospital/cases/{planId}`); notification links carry a case id and go through `/hospital/cases/by-case/{caseId}`, which picks the chosen plan.
- **Doctors** listed are those who chose the hospital as an affiliation in their own registration or settings. The hospital can't add or remove them.
- **Patients** are shown with clinical details only (date of birth, gender, nationality, country, medical history, allergies, medications, past surgeries) — no contact details, as in the old portal.
- The hospital's only write action on cases is issuing the **visa letters**.

## Pages

| Page | What it does |
|---|---|
| Sign-up (`/register/hospital`) | Login (email + password) → 6-digit email code → the registration wizard. Linked from the login page ("Register your hospital"). |
| Registration (`/hospital/register`) | Four steps: **Basic information** (name, registration number, ABN with checksum, phone), **Location** (country, state/city, address, postcode), **Hospital details** (multi/single specialty, specialties, beds, room types, licence number, accreditation body), **Documents & agreement** (hospital licence and registration certificate required, other documents optional, confirmation). The contact email is always the login email. |
| Pending approval | Under review; or MTA's reason with **Update and resubmit** (the wizard prefilled; earlier documents kept unless replaced) after a rejection or a request for more information. |
| Dashboard | Banner when paid cases are waiting for visa letters; counts (affiliated doctors, patients, cases, treatments confirmed / treated); upcoming admissions (confirmed plans with a future start date); how cases reach the hospital; recent cases. |
| Case Management | Tabs All / Awaiting Patient / Treatment Confirmed / Completed / Declined, a submitted-within filter and search. The case page: status, admission dates, the **visa letters** block (when eligible), patient (clinical), treating doctor (contact), case summary, and the full treatment plan with costs. |
| Patient Management | Patients with case count and latest case; patient page with clinical details and their cases at this hospital. |
| Doctor Management | Affiliated doctors with specialties, department/role, contact, experience, cases here and status; doctor page with professional details, affiliations, weekly schedule and their cases here. |
| Documents | Every paid case's letters in one table (*Waiting for letters* / *All*), with generate, view, download and send per letter. |
| Messages, Notifications | The support chat with MTA (same as the doctor portal's) and the full notification list. |
| Account & Settings | Hospital profile (basic information incl. the hospital's time zone, used for letter dates and "today", hospital details — view/edit), Security (password), Notifications (email/SMS toggles). |

## Visa letters

The **Hospital Invitation Letter** (for the visa authorities) and the **Appointment Confirmation Letter** (for the patient) are generated as A4 PDFs on the hospital's letterhead from the case, patient, doctor and plan (`HospitalLetterRenderer`, PDFBox; wording ported from the old `case-letters.ts`; characters outside Latin-1 print as "?").

- Allowed once the patient **chose this hospital's plan** (`patient_confirmed`) and the case is paid (`payment_confirmed` or later): otherwise `409 plan_not_selected` / `case_not_payment_confirmed`.
- **Generate** stores the PDF and records it as a `visa_documents` row (`source = hospital_generated`, `hospital_id`, linked to the visa submission if one exists). Regenerating replaces the file and keeps the sent state.
- **Send to patient** stamps `sent_to_patient_at` and notifies the patient ("Hospital Invitation Letter available", type `visa_document_available`). The patient's visa application unlocks once **both** letters are sent (`VisaService.lettersReady`).
- When a patient pays for a treatment at the hospital, the hospital is notified ("Treatment confirmed: visa letters needed", `HospitalPaymentListener`) — new in this port; the old portal had no alert.

## Notifications to the hospital

| Event | Title |
|---|---|
| A doctor submits a plan naming the hospital (`DoctorPlanService`, old `notify_hospital_on_treatment_plan_submission`) | New treatment plan for your hospital |
| The patient pays for treatment there | Treatment confirmed: visa letters needed |
| MTA approves / rejects / asks for more information | Registration approved / Registration not approved / More information needed |
| MTA replies in the support chat | New message from MTA Admin |

## Approval by MTA

In the admin portal, **Hospital Approvals** lists hospitals that registered through the portal (seeded reference hospitals without a login aren't listed), with Pending / More Info Requested / Approved / Rejected tabs. The review page shows the details and documents with **Approve**, **Request more info** and **Reject** (the last two need a reason the hospital sees). Approval opens the portal and makes the hospital selectable as a doctor affiliation. Hospital fees exist under Settings but **aren't charged yet**.

## Tests

- `HospitalPortalFlowTests` (backend): sign-up, registration validation (ABN checksum, documents), the gate, admin review with more info → resubmission → approval, settings; the demo hospital's cases, case detail (no patient contact details), generating, previewing and sending both letters, the patient's visa application unlocking, patients and doctors, 404s for records it can't see.
- `e2e/hospital-journey.mjs`: signs up and registers a new hospital through the wizard (including an invalid ABN), MTA asks for more info, the hospital resubmits, MTA approves in the admin portal, then the demo hospital generates and sends both letters for a paid case through the UI. Needs the API log for the verification code.
