# Frontend guide (`frontend/`)

React 19 · TypeScript 5.9 · Vite 8 · React Router 7 · lucide-react icons · Geist font · Stripe React SDK. No CSS framework: hand-written CSS with design tokens that match the old Tailwind slate/cyan-700 look.

## Layout

```
frontend/src/
  App.tsx                 route tree for every role
  main.tsx                entry point
  styles.css              design tokens + shared styles (shell, cards, tables, forms, badges…)
  auth/                   AuthContext (session, login, verify, signOut), RequireRole guard
  components/             ui.tsx kit (Field, Modal, Tabs, Badge, FileDrop, Stepper…), Toasts, LanguageSwitcher
  i18n/                   I18nContext (useT), en.json, zh.json, auth-messages.json
  lib/                    api.ts, useApi.ts, realtime.tsx, format.ts, site.ts, types.ts, cases.ts, countries.ts
  pages/auth/             login, register, verify, forgot/reset password, AuthShell
  portals/patient/        patient area (layout, pages, profile/, payments/, treatments/, visa/)
  portals/doctor/         doctor area (layout, pages, registration/, settings/, doctor.css)
```

## Routing and guards

`App.tsx` declares one route tree per role:

- `/` — signed-in users go to their role's home; signed-out visitors are sent to the public website.
- `/login`, `/register`, `/register/doctor`, `/verify`, `/forgot-password`, `/reset-password` — public.
- `/patient/**` — `RequireRole PATIENT` → `PatientProvider` (loads the profile) → `PatientLayout` → `RequireCompleteProfile` (onboarding gate) → pages.
- `/doctor/**` — `RequireRole DOCTOR` → `DoctorProvider` (loads `/api/doctor/account`) →
  - gate pages `register`, `pending-approval`, `registration-fee` (each wrapped in `GateStep`, which redirects if the doctor is at a different step);
  - `RequireActiveDoctor` → `DoctorLayout` → portal pages.
- `/admin/**` — `RequireRole ADMIN` → `AdminLayout` (sidebar with live counts, exposes `refreshCounts` through the outlet context) → dashboard, doctors, cases, plans, messages.
- `/hospital/**` — `RequireRole HOSPITAL` → `HospitalProvider` (loads `/api/hospital/account`) → gate pages `register` and `pending-approval` (`HospitalGateStep`) → `RequireApprovedHospital` → `HospitalLayout` → portal pages. Case pages are keyed by plan id; `cases/by-case/:caseId` redirects from notification links.
- `/lawyer` — placeholder.

`ROLE_HOME` in `auth/AuthContext.tsx` is where each role lands after login. Login honours a `from` location when it belongs to the same role, so deep links work after signing in.

## Talking to the API

```ts
const cases = useApi<CaseRow[]>('/api/doctor/cases')     // GET on mount; .data .error .loading .reload() .setData()
await apiPost('/api/doctor/cases/' + id + '/start-evaluation')
await apiPut<Plan>(path, payload)
await openFile('/api/doctor/cases/…/content', 'file.pdf') // authenticated download / open in a tab
```

- `api.ts` adds the bearer token, parses problem details into `ApiError(status, code, message, fieldErrors)` and signs the user out on 401.
- Show validation errors next to fields with `fieldError(error, 'fieldName')` and general ones with `<FormError error={error} />`.
- `reload()` refetches without clearing data, so screens don't flash.

## Live updates

The patient and doctor layouts wrap their pages in `RealtimeProvider`. Subscribe with:

```ts
useRealtime<Notification>('notification', (n) => …)
useRealtime<Message>('provider_message', (m) => …)   // doctor chat; 'chat_message' for the patient chat
```

## Text and languages

- **Patient portal and auth pages:** every string goes through `useT('namespace')`; catalogues are `i18n/en.json` and `zh.json` (copied from the old patient app). Add new keys to both files. Auth strings live in `auth-messages.json`.
- **Doctor portal:** English only, with plain strings, like the old doctor app.

## Dates, times and money

`lib/format.ts` (`useFormat`) formats dates, money (AUD) and relative times for the patient's language. Doctors and hospitals each work in their own Australian time zone (`AU_TIME_ZONES` in `lib/format.ts`). `DoctorProvider` and `HospitalProvider` call `setProviderTimeZone(...)`; the helpers in `portals/doctor/shared.tsx` (`formatSlot` → "Tue, 3 Nov 2026, 12:30 pm - 1:30 pm (Sydney Time)", `providerToday`, `zoneTimeLabel`, `TimeZoneSelect`) use `providerTimeZone()`. Patients see slots in the consultation's `doctorTimeZone` plus their own zone (`SlotTimes`). The admin layout resets the zone to Brisbane, MTA's own.

## Styling

- Tokens (`--primary` cyan-700, slate greys, tones for badges) are at the top of `styles.css`.
- Shared classes: `.card`, `.stack`, `.row-between`, `.field`, `.badge-*`, `.table`, `.tabs`, `.shell` / `.sidebar` / `.topbar` (portal shell), `.modal`.
- The doctor portal adds `portals/doctor/doctor.css` with `dr-*` classes (pill tabs, metric cards, tables, plan sections).
- The UI follows the old/live portal screens; compare with the old components in `apps/<portal>/components` or the live dev site when changing a page.

## Payments in the browser

`portals/patient/payments/Checkout.tsx` starts checkout (`checkoutPath`, optional JSON `body`) and shows either Stripe's Payment Element (saved cards included) or, with the simulated provider, a Pay Now button (`simulatePath`). The doctor portal reuses it for the registration and annual fees.

## Gotchas

- Never return a value from a `useEffect` arrow — use a block body.
- Route wrappers between a layout and its pages must forward `useOutletContext()`.
- Wizard drafts are kept in `sessionStorage` (`drafts` in `lib/format.ts`) and cleared on sign-out, so personal data doesn't linger on shared devices.
- `import.meta.env.DEV` hides dev-simulation panels from production builds.

## Adding a page (checklist)

1. Component under `portals/<role>/`.
2. Route in `App.tsx` inside the role's tree (and a nav entry in the layout if needed).
3. Data via `useApi`, writes via `apiPost/apiPut`, field errors via `fieldError`.
4. Strings through `useT` (patient) or plain English (doctor).
5. `npm run build`, then click through or extend an `e2e` journey.
