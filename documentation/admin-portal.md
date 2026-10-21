# Admin portal

The MTA coordinators' workspace at `/admin` (role `ADMIN`, API under `/api/admin/**`). English only, like the doctor portal. It reuses the doctor portal's styles and helpers (`portals/doctor/doctor.css`, `portals/doctor/shared.tsx`); its pages live in `frontend/src/portals/admin/` and its endpoints in the backend `admin/` package.

## Admin accounts

Nobody can sign up as an admin. On startup `AdminBootstrap` creates the first admin from `IHA_ADMIN_EMAIL` and `IHA_ADMIN_PASSWORD` (at least 12 characters) when no account with that email exists; it never changes an existing account. Leave the variables empty once the account exists. In development the seeder creates `admin@demo.local` / `Demo1234`.

## Pages

| Page | What it does |
|---|---|
| Dashboard | Built only from live records (no estimates), from `GET /api/admin/insights` (`AdminInsightsService`). A teal hero with money received from patients in the last 12 months and MTA's service fees, plus active doctors, patients, cases in progress and treated; the four attention tiles (registrations to review, cases without a doctor, plans to review, waiting conversations — also shown as sidebar badges); the **case pipeline** by stage; **money by month** (patient payments and doctor membership fees); a **Doctors** table (active cases, unanswered invitations, acceptance rate, average response time, plans sent, share of plans patients chose, patients treated, doctor fees earned, membership status, last activity) with counts by registration status; **Needs a nudge** (invitations unanswered for 48 hours, registration fees unpaid, annual fees overdue or due within 30 days); **upcoming Zoom consultations** (next two weeks); **specialty coverage** (active doctors against open cases, flagging specialties with no doctor); recent cases. |
| Doctor Approvals | Registrations by status (Pending, More Info Requested, Approved, Rejected), searchable. The detail page of an approved doctor starts with **Performance** (`GET /api/admin/doctors/{id}/performance`): the same figures as the dashboard table, membership fees paid, and every case the doctor was invited to with their answer, plan status and case status. It then shows the professional details and documents (view/download) with **Approve**, **Request more info** and **Reject**; the last two need a reason (≥ 10 characters) that the doctor sees and can answer by resubmitting. Approved doctors then pay the registration fee themselves. |
| Cases | All cases, with a *Needs a doctor* view. The case page shows the patient's description, documents, invited doctors and their progress (including a skipped initial consultation and its reason), plans and consultations. **Invite a doctor** lists active doctors (approved and fee paid), those with the case's specialty first; inviting moves a submitted case to *under review* and notifies the doctor. |
| Treatment Plans | Plans by status (To Review, With Patient, Chosen & Paid, Declined). The review page shows the full plan and costs. **Approve and send to patient** takes MTA's service fee (suggested 10% of the plan total) and publishes the plan as a treatment option; **Decline** needs a reason, which the doctor sees on the plan. Both notify the doctor. |
| Messages | One inbox for patient and provider (doctor, hospital, lawyer) support chats: unread counts, reopen requests, **Open / Close conversation**, replies. Admins don't get live pushes yet; the inbox refreshes every 20 seconds. |

## Rules enforced by the API

- Only `pending` registrations can be reviewed.
- Only active doctors can be invited (`doctor_not_active`), and a doctor can't be invited to the same case twice.
- Only submitted plans can be published or declined; the service fee must be ≥ 0. A declined plan's reason is stored on `treatment_plans.rejection_reason` (migration V6).
- Reviews, invitations and plan decisions are written to the audit log with the acting admin.

## Tests

- `AdminPortalFlowTests` (backend): bootstrap, approvals, assignment, plan publish/decline, chats.
- `e2e/admin-journey.mjs`: a patient submits a case through the API, then the admin approves the pending doctor (Dr. Olivia Grant), invites Dr. Amelia Chen to the new case, publishes one plan, declines another and answers the patient chat. Needs both dev servers; no API log.
