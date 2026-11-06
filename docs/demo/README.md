# MTA platform demo guide

Medical Tourism Australia (MTA) connects international patients with Australian doctors, hospitals and visa lawyers around one shared **case**. Five portals, one case, each person seeing only their part.

| Portal | Who uses it | Their job | Guide |
|---|---|---|---|
| Patient | International patients | Submit a case, compare plans, pay, apply for a visa | [patient-portal.md](patient-portal.md) |
| Doctor | Australian specialists | Evaluate cases, consult, write treatment plans | [doctor-portal.md](doctor-portal.md) |
| Hospital | Partner hospitals | See incoming patients, issue visa letters | [hospital-portal.md](hospital-portal.md) |
| Visa lawyer | Migration agents and lawyers | Review and progress visa applications | [visa-lawyer-portal.md](visa-lawyer-portal.md) |
| Admin | MTA staff | Approve providers, run cases, money, compliance | [admin-portal.md](admin-portal.md) |

**New here?** Read [end-to-end-journey.md](end-to-end-journey.md) first. It follows one case through all five portals and gives a 20-minute and a 45-minute demo plan.

## Start the demo

Needs Docker Desktop and Node. From the project folder:

```bash
docker compose -f docker-compose.e2e.yml up -d --build --wait
PORT=5174 API_URL=http://localhost:8081 npm --prefix frontend run dev
```

| Open | For |
|---|---|
| http://localhost:5174/login | The portals |
| http://localhost:8025 | The local mailbox: every email and SMS the platform "sent" |

**Start every demo from clean data.** Earlier runs use up the demo cases. This resets everything and takes about a minute:

```bash
docker compose -f docker-compose.e2e.yml up -d --force-recreate --wait
```

Use a separate browser profile or private window for each role, because one window holds one sign-in.

## Demo accounts

Password for all: `Demo1234`. These exist only in the demo setup.

| Email | Who | Starts as |
|---|---|---|
| `patient@demo.local` | Demo Patient | Profile complete, cases at several stages |
| `doctor@demo.local` | Dr. Amelia Chen, Sydney | A new invitation, a case in evaluation, a year of history |
| `hospital@demo.local` | St Vincent's Hospital Sydney | Approved, with paid cases waiting for letters |
| `lawyer@demo.local` | James Whitfield, MARN | One submitted visa application assigned |
| `admin@demo.local` | MTA staff | Full access |
| `pending.doctor@demo.local` | Dr. Olivia Grant | Waiting for approval |
| `pending.hospital@demo.local` | Gold Coast Private Hospital | Waiting for approval |
| `pending.lawyer@demo.local` | Harbourside Immigration Lawyers | Waiting for approval |
| `peer1@demo.local`, `peer2@demo.local` | Cardiology peers | Provide benchmark and ranking figures |

## What is real and what is simulated

Be upfront about this if asked.

| Area | In this demo | Before launch |
|---|---|---|
| Every portal, rule and workflow | Real | |
| Database and application | Real: PostgreSQL and the production API image | |
| PDFs (invoices, credit notes, hospital letters) | Real | |
| Email and SMS | Real requests, caught by the local mailbox, nothing delivered | Connect Resend and Twilio |
| Card payments | Simulated **Pay Now** button, no card entered | Connect Stripe |
| Zoom meetings | No link is created | Connect Zoom |
| Demo data | Invented people and figures | Real data only |
| Dashed "Dev simulation" boxes | Shortcuts that play another role, in this demo setup only | Never in production builds |
| Register checks (AHPRA, OMARA and so on) | Staff record what they found; the platform doesn't query the registers | Same: these registers have no public API |

Items marked "for MTA's lawyer to confirm" in the technical docs (consent wording, retention period, refund rules, GST treatment) are not legal advice. Say so if asked.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Could not reach the server" | Press **Try again**. If it persists, check `docker compose -f docker-compose.e2e.yml ps` |
| Demo case missing or already moved on | Reset the data (above) |
| Signing out lands on the public website | That is by design: the website is the home page. Go back to `/login` |
| No join button on a consultation | Expected: Zoom isn't connected here |
