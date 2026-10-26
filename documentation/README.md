# MTA Platform — Technical Documentation

Documentation for the **new stack**: the Spring Boot API in `backend/` and the React web app in `frontend/`.
(The `docs/` folder describes the old Next.js + Supabase code that is being replaced; use it only as a reference for how a feature used to behave.)

| Document | Read it when you want to… |
|---|---|
| [Architecture](architecture.md) | Understand how the pieces fit: one API, one web app, roles, security, events, live updates, payments, storage. |
| [Development guide](development.md) | Set up a machine, run everything locally, use the demo accounts and dev simulation, run the tests. |
| [Backend guide](backend.md) | Work in `backend/`: package layout, conventions, configuration, errors, encryption, how to add a feature. |
| [Frontend guide](frontend.md) | Work in `frontend/`: routing, auth, data loading, i18n, styling, how to add a page. |
| [API reference](api-reference.md) | Look up an endpoint: every route grouped by role, with what it does. |
| [Data model](data-model.md) | Look up a table or a lifecycle: cases, assignments, plans, consultations, payments, visas. |
| [Patient portal](patient-portal.md) | See what patients can do and how each flow works end to end. |
| [Doctor portal](doctor-portal.md) | See what doctors can do and how each flow works end to end. |
| [Visa lawyer portal](lawyer-portal.md) | See what visa lawyers can do: registration with a MARN or practising certificate, visa cases, document requests, notes, the visa grant. |
| [Hospital portal](hospital-portal.md) | See what partner hospitals can do: registration, cases, patients, doctors, visa letters. |
| [Admin portal](admin-portal.md) | See what MTA coordinators can do: approvals, case assignment, plan review, support chats. |
| [Deployment](deployment.md) | Run it for real: PostgreSQL, secrets, Stripe, Zoom, storage, the website links, a go-live checklist. |

## The platform in one paragraph

MTA (Medical Tourism Australia) connects international patients with Australian doctors, hospitals and visa lawyers around a shared **case**. A patient submits a case with medical documents; MTA admin invites doctors; a doctor evaluates the case and submits a treatment plan; admin publishes approved plans to the patient as treatment options (with MTA's service fee); the patient may book a paid online consultation, then chooses an option and pays; hospitals issue invitation letters; the patient applies for a medical-treatment visa with a lawyer's help; the patient travels, is treated, and the doctor marks the case completed.

## Status at a glance

| Area | State |
|---|---|
| Patient portal | Ported (English and Chinese) |
| Doctor portal | Ported (English) |
| Admin portal | Started — dashboard, doctor approvals, case assignment, plan review, support inbox |
| Hospital portal | Ported (English) — registration and approval, cases, patients, doctors, visa letters, chat, settings |
| Visa lawyer portal | Not yet |
| Email / SMS delivery | Not yet — alerts are logged |
| Data migration from Supabase | Not yet |
