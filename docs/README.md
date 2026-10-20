# IHA Platform — Technical Documentation

IHA is a medical-tourism platform that connects **international patients** with **hospitals**, **doctors**, and **visa lawyers** around a shared *case*. This folder contains the technical reference for the whole monorepo.

## Document index

| Document | Covers |
|---|---|
| [README.md](README.md) | This page — architecture overview, repo layout, conventions, local setup |
| [apps-patient.md](apps-patient.md) | `apps/patient` — patient portal (port 3000) |
| [apps-hospital.md](apps-hospital.md) | `apps/hospital` — hospital portal (port 3001) |
| [apps-visa.md](apps-visa.md) | `apps/visa` — visa lawyer portal (port 3002) |
| [apps-admin.md](apps-admin.md) | `apps/admin` — platform admin portal (port 3003, work in progress) |
| [apps-doctor.md](apps-doctor.md) | `apps/doctor` — doctor portal (port 3004) |
| [packages-db.md](packages-db.md) | `packages/db` — Supabase clients, data-access modules, generated types, Edge Functions |
| [database.md](database.md) | `packages/db/supabase/migrations` — schema, RLS, RPCs, triggers, lifecycles, migration log |
| [packages-shared.md](packages-shared.md) | `packages/ui`, `validations`, `notifications`, `logger`, `config` + root config files |

## Architecture

```
                ┌──────────────────────── Turborepo (pnpm workspaces) ────────────────────────┐
                │                                                                              │
  Browser ──▶   │  apps/patient  apps/hospital  apps/visa  apps/admin  apps/doctor             │
                │   :3000          :3001          :3002      :3003       :3004                 │
                │   (Next.js 15 App Router, React 19, Tailwind, React Query, RHF + Zod)        │
                │        │              │             │          │           │                 │
                │        └──────────────┴──── shared packages ───┴───────────┘                 │
                │              @iha/db  @iha/ui  @iha/validations  @iha/notifications          │
                │              @iha/logger  @iha/config                                        │
                └──────────────────────────────────┬───────────────────────────────────────────┘
                                                   │ @supabase/ssr (anon key + user JWT,
                                                   │ service-role on server only)
                                                   ▼
                ┌─────────────────────────── Supabase ────────────────────────────┐
                │ Postgres (RLS on every table, SECURITY DEFINER RPCs, triggers,   │
                │ pgcrypto PII encryption) · Auth (email/OTP) · Storage buckets ·  │
                │ Realtime (notifications, chat, cases) · Edge Functions           │
                └──────────────────────────────────────────────────────────────────┘
                          ▲                         ▲                    ▲
                     Stripe (payments,         Resend (email)       Twilio (SMS)
                     doctor fees)              Zoom (consultations)
```

### Key design principles

- **One app per role.** Each portal is an independent Next.js app with its own auth middleware, so roles never share a session UI.
- **Database is the security boundary.** Authorisation is enforced by Postgres Row Level Security policies and `SECURITY DEFINER` RPCs, not by app code. Apps use the anon key + the user's JWT; the service-role key is used only in server-side code (API routes / server actions) for privileged operations.
- **Shared logic in packages.** Data access (`@iha/db`), form validation (`@iha/validations`), UI primitives (`@iha/ui`) and notifications are written once and reused by every app.
- **Event-driven side effects in SQL.** Status changes (case, consultation, visa, assignments) fire triggers that insert notifications, sync statuses and write audit logs.
- **Privacy.** Patient PII, case descriptions and visa form data are encrypted at column level; patient accounts are soft-deleted and hard-deleted after a grace period by an Edge Function.

### Core domain flow

1. **Patient** registers (email + OTP), completes profile, creates a **case**.
2. **Hospital** reviews the case and assigns **doctors**.
3. Patient books and pays for a **consultation**; doctor schedules a meeting (Zoom).
4. Doctor authors a **treatment plan** with options and specialists; patient selects an option and **pays** via Stripe.
5. If travel is needed, a **visa submission** is opened; the **lawyer** requests documents, reviews them, records notes and issues visa documents. Visa status changes sync back to the case.
6. Throughout: patient↔provider **chat**, provider↔provider **messages**, realtime **notifications**, email/SMS dispatch, **audit logs**.
7. Providers (hospital, doctor, lawyer) self-register and wait in **pending approval** until an admin approves them; doctors also pay registration/annual platform fees.

## Repository layout

```
IHA-Web-main/
├── apps/
│   ├── patient/      Patient portal (i18n: en, zh)
│   ├── hospital/     Hospital portal
│   ├── visa/         Visa lawyer portal
│   ├── admin/        Admin portal (scaffold, WIP)
│   └── doctor/       Doctor portal
├── packages/
│   ├── db/           Supabase clients, data-access modules, types, migrations, Edge Functions
│   ├── ui/           Shared React components
│   ├── validations/  Zod schemas
│   ├── notifications/ Email (Resend) + SMS (Twilio) dispatch and templates
│   ├── logger/       Shared logger
│   └── config/       ESLint, Tailwind preset, base tsconfig
├── package.json      Root scripts (turbo dev/build/lint, db:* scripts)
├── turbo.json        Turborepo task pipeline
├── pnpm-workspace.yaml
├── .prettierrc
└── .mcp.json         Supabase MCP server config for Claude Code
```

Each app follows the same internal layout:

```
apps/<app>/
├── app/
│   ├── (auth)/        login, register, verify (OTP), forgot/reset password
│   ├── (dashboard)/   authenticated pages, shared dashboard layout
│   ├── api/           route handlers (documents, payments, fees …)
│   └── page.tsx       root redirect
├── components/        app-specific components
├── hooks/             React Query / realtime hooks
├── lib/               app helpers, server actions
├── types/             app-level TypeScript types
├── middleware.ts      Supabase session refresh + route protection
└── next.config.ts, tailwind.config.ts, tsconfig.json, eslint.config.mjs
```

## Tech stack

| Concern | Technology |
|---|---|
| Monorepo | Turborepo 2, pnpm 9 workspaces, Node ≥ 20 |
| Framework | Next.js 15 (App Router), React 19, TypeScript 5.8 |
| Styling | Tailwind CSS with shared preset, lucide-react icons |
| Data fetching | @tanstack/react-query, Supabase JS via @supabase/ssr |
| Forms | react-hook-form + Zod (`@iha/validations`) |
| URL state | nuqs |
| i18n | next-intl (patient app) |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) |
| Payments | Stripe (@stripe/stripe-js, stripe) |
| Notifications | Resend (email), Twilio (SMS), Supabase Realtime (in-app) |
| Meetings | Zoom (server-to-server OAuth) |
| PDFs | pdf-lib |

## Environment variables

Each app reads its configuration from `apps/<app>/.env.local` (template: `.env.example`). Never commit real values.

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (browser + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged Supabase client (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_*_APP_URL` | Cross-app links (e.g. notification deep links) |
| `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` | Email notifications |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS notifications |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | Consultation meeting creation |

See each app document for the exact set it uses.

## Common commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run all apps via Turborepo |
| `pnpm dev:patient` / `dev:hospital` / `dev:visa` / `dev:admin` / `dev:doctor` | Run a single app |
| `pnpm build`, `pnpm lint`, `pnpm format` | Build / lint / Prettier |
| `pnpm db:migrate:new <name>` | Create a new SQL migration |
| `pnpm db:migrate:push` | Apply migrations to the linked Supabase project |
| `pnpm db:reset` | Reset local database |
| `pnpm db:types` | Regenerate `packages/db/types/database.types.ts` |

**Without pnpm/Docker:** run an app directly with its local Next binary, e.g. `apps/patient/node_modules/.bin/next.cmd dev --port 3000`, against the hosted Supabase project.

## Conventions

- **Migrations** are timestamped (`YYYYMMDDHHMMSS_description.sql`) and append-only; never edit an applied migration — add a new one.
- **After schema changes**, regenerate types with `pnpm db:types`.
- **Server-only secrets** (service role, Stripe secret, Twilio, Zoom) must only be read in route handlers / server actions, never in `"use client"` files.
- **Validation** lives in `@iha/validations` and is shared between client forms and server handlers.
- **Formatting** is enforced by Prettier (`.prettierrc`).
