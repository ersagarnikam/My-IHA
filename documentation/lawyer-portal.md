# Visa lawyer portal

The visa lawyer's workspace at `/lawyer` (role `LAWYER`, API under `/api/lawyer/**`). English only, like the doctor and hospital portals; it reuses their styles and shared pieces (`portals/doctor/doctor.css`, `portals/hospital/hospital.css`, the support chat, notification bell and password form) plus `portals/lawyer/lawyer.css`. Backend: the `lawyer` package, with the visa entities in `visa`. Port of the old `apps/visa` (see `docs/apps-visa.md`).

## Who can register

In Australia immigration assistance is given by a **registered migration agent** (MARN, on the OMARA register) or by an **Australian legal practitioner** with a current practising certificate (no MARN needed since 2021). A lawyer says which at registration:

| Credential | Number | Also asked |
|---|---|---|
| `marn` | 7 digits | expiry date |
| `practising_certificate` | 4–20 letters, digits or hyphens | issuing state or territory, expiry date |

MTA records a check of that register before approving (admin → Lawyer Approvals → **Register checks**, `VerificationService`; see [admin-portal.md](admin-portal.md#register-checks-verification)). Approval without a passing check is refused (`409 verification_required`). The declared expiry and the latest check feed the admin dashboard's compliance alerts. Lawyers aren't charged fees yet (the lawyer fees exist in Settings at AUD 0).

## Who sees what

A lawyer sees only the visa applications MTA **assigned** to them (`visa_submissions.assigned_lawyer_id`, admin → Visa Cases); anything else answers 404. For each case: the patient (name, date of birth, gender, nationality, country), the patient's visa form, the documents (patient uploads, the hospital's letters once sent, the visa grant they issued), their document requests, their own confidential notes, and the chosen treatment plan's logistics (hospital, doctor, specialty, procedure, dates, stay).

## Pages

| Page | What it does |
|---|---|
| Sign-up (`/register/lawyer`) | Login (email + password + consent) → 6-digit email code → the registration wizard. Linked from the login page ("Register as a visa lawyer"). |
| Registration (`/lawyer/register`) | Three steps: **Your practice** (individual or law firm, name, ABN with checksum, phone, office address, city/state, postcode, experience, time zone), **Registration** (credential type, MARN or certificate number, issuing state, expiry), **Documents & agreement** (MARN registration or practising certificate required; professional indemnity and other documents optional). |
| Pending approval | Under review; or MTA's reason with **Update and resubmit** (prefilled, earlier documents kept unless replaced). |
| Dashboard | New / in progress / waiting for documents / approved counts, a banner for new applications, recent cases. |
| Visa Cases | Tabs All / New / In Progress / Docs Pending / Approved / Rejected, search. The case page: status with **Update Status**, patient, treatment plan, the visa form in collapsible sections, documents with **Request Document**, open requests, and **Case Notes**. |
| Documents | Approved cases with **Upload** / **Replace** for the visa grant (PDF, JPG or PNG, ≤ 10 MB). |
| Messages, Notifications | The support chat with MTA and the full notification list. |
| Account & Settings | Practice details, Registration (credential; MTA re-checks after a change), Security, Notifications. |

## Status workflow

`VisaSubmission.TRANSITIONS` (old `update_visa_submission_status`):

| From | To |
|---|---|
| `documents_submitted` (New) | `under_review` |
| `under_review` | `processing` |
| `additional_docs_requested` (Docs Pending) | `under_review`, `processing` |
| `application_submitted` (legacy) | `processing`, `approved`, `rejected` |
| `processing` | `approved`, `rejected` (reason required) |

Anything else is `409 invalid_transition`. The case follows (old `sync_case_status_from_visa`): processing → `visa_processing`, approved → `travel_ready`, rejected → `visa_rejected`.

- **Document requests** only while `under_review` or `additional_docs_requested` (`409 case_not_under_review`); a request moves the application to `additional_docs_requested`. A request is open until the patient uploads that category afterwards.
- **Visa grant**: only once `approved` (`409 visa_not_approved`); one `visa_documents` row per case (`source = lawyer_issued`, `category = approved_visa`), replaced on re-upload (the old file is deleted), visible to the patient straight away.
- **Notes** are the lawyer's own (`visa_case_notes`), 1–5000 characters, never shown to the patient.

## Notifications

| Event | Who | Title |
|---|---|---|
| MTA assigns a case | lawyer | New visa case assigned |
| Patient uploads a visa document | lawyer | Patient uploaded a document |
| Under review / application submitted / processing / approved / rejected | patient | Your visa lawyer is reviewing your application / Visa application submitted / Visa application processing / Visa approved / Visa application rejected |
| Approved / rejected | chosen plan's doctor and hospital | Patient's visa approved / Patient's visa rejected |
| Document requested | patient | Your visa lawyer requested a document |
| Visa grant uploaded | patient | Your approved visa is ready |
| Registration reviewed | lawyer | Registration approved / Registration not approved / More information needed |

## Membership fees

Visa lawyers pay MTA a one-time **registration fee** and an **annual membership fee**, set by MTA under admin → Settings (`lawyer_registration_fee`, `lawyer_annual_fee`). The rules (`providerfee/ProviderFeeService`, migration V15):

- **Registration fee above $0:** once MTA approves the account, the portal stays locked on `/lawyer/registration-fee` until the fee is paid by card (the API answers `403 registration_fee_unpaid` for everything past the gate except billing and the support chat). MTA can't assign a visa case to a lawyer whose registration fee is unpaid (`409 registration_fee_unpaid`).
- **Fee at $0:** nothing is charged. Approval records the registration fee as waived and starts the yearly cycle. Accounts approved while the fee was $0 never owe it, even if MTA raises it later; accounts approved before V15 count as waived.
- **Annual fee:** falls due a year after registration (paid or waived) and after each renewal (Brisbane dates). An overdue renewal shows a banner on the dashboard and a **Pay now** button under Account & Settings → Billing; it never locks the portal. While the annual fee is $0 nothing falls due.
- **Billing tab:** registration status, next renewal date, paid fees with PDF invoices (`MTA-HO-…` / `MTA-VL-…`, tax invoices once MTA is GST-registered; GST class *Hospital and visa lawyer membership fees*, taxable by default) and any refunds.
- MTA sees the payments under admin → Payments (Hospitals / Lawyers tabs) and can refund them like doctors' fees; the provider's admin page shows a **Membership** line.

## Demo data and tests

- `lawyer@demo.local` (James Whitfield, MARN, Sydney) with a submitted visa application for a paid hip replacement at St Vincent's (both letters sent, passport, photo and bank statement uploaded) — `dev/DevVisaCase`. `pending.lawyer@demo.local` (Harbourside Immigration Lawyers, Victorian practising certificate) waits in Lawyer Approvals.
- `LawyerPortalFlowTests`: sign-up with consent, registration validation, more-info and resubmission, the register check and approval, assignment, the whole status workflow with notifications and case status, requests, notes, the visa grant, chat.
- `ProviderFeeTests`: the lawyer gate until the registration fee is paid; another lawyer can't complete their payment.
- `e2e/lawyer-journey.mjs`: signs up and registers a lawyer through the wizard, MTA records the OMARA check and approves in the admin portal, assigns the demo case on Visa Cases, and the lawyer works it to approved and uploads the grant. Needs the API log and a freshly started API (it moves the demo case to Approved; the case goes back to the demo lawyer at the end).
