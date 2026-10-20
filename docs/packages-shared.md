# Shared Packages and Root Configuration

This document covers the shared workspace packages of the IHA / MTA medical tourism monorepo and the root-level tooling files.

| Package | Name | Purpose |
|---|---|---|
| `packages/ui` | `@iha/ui` | Shared React component library (shadcn/ui-style primitives, provider-portal components, auth screens, realtime hooks) |
| `packages/validations` | `@iha/validations` | Zod schemas, form input types, the `Result<T>` type, phone validation |
| `packages/notifications` | `@iha/notifications` | Email (Resend) and SMS (Twilio) alert dispatch for in-portal notifications |
| `packages/logger` | `@iha/logger` | Pino-based structured logger |
| `packages/config` | `@iha/config` | Shared ESLint config, Tailwind preset, base `tsconfig` |

Apps referenced below: `patient` (:3000), `hospital` (:3001), `visa` (lawyer, :3002), `admin` (:3003), `doctor` (:3004). `packages/db` (`@iha/db`) is out of scope but is mentioned where it consumes these packages.

All packages are `private`, version `0.0.0`, and ship **TypeScript source directly** (no build step): `exports` point at `./src/*.ts(x)`. Apps compile them through Next.js `transpilePackages` (currently `['@iha/ui', '@iha/db', '@iha/validations']` in every app's `next.config.ts`).

"Used by" columns were derived by grepping `apps/*` (and `packages/db`, `packages/ui` where relevant) for imports of each symbol. Treat them as a snapshot, not a contract.

---

## Table of Contents

1. [Root-level files](#1-root-level-files)
2. [@iha/ui](#2-ihaui)
3. [@iha/validations](#3-ihavalidations)
4. [@iha/notifications](#4-ihanotifications)
5. [@iha/logger](#5-ihalogger)
6. [@iha/config](#6-ihaconfig)
7. [Notes](#7-notes)

---

## 1. Root-level files

### 1.1 `package.json`

- **name:** `iha-platform` (private)
- **packageManager:** `pnpm@9.15.9`
- **engines:** `node >= 20`
- **devDependencies:** `prettier ^3.5.3`, `turbo ^2.5.4`, `typescript ^5.8.3`

| Script | Command | Purpose |
|---|---|---|
| `dev` | `turbo dev` | Run every app's dev server |
| `dev:patient` / `dev:hospital` / `dev:doctor` / `dev:visa` / `dev:admin` | `turbo dev --filter=<app>` | Run a single app |
| `build` | `turbo build` | Build all apps (respects `^build` dependency order) |
| `lint` | `turbo lint` | Run each workspace's `lint` script (packages use `tsc --noEmit`) |
| `format` | `prettier --write "**/*.{ts,tsx,md,json}"` | Format the repo |
| `db:types` | `supabase gen types typescript --linked > packages/db/types/database.types.ts` | Regenerate DB types from the linked Supabase project |
| `db:migrate:new` | `supabase migration new` | Create a migration file |
| `db:migrate:push` | `supabase db push` | Apply migrations to the linked project |
| `db:reset` | `supabase db reset` | Reset the local database |

### 1.2 `turbo.json`

| Task | Config | Notes |
|---|---|---|
| `build` | `dependsOn: ["^build"]`, `outputs: [".next/**", "dist/**"]` | Workspace dependencies build first; Next output is cached |
| `dev` | `cache: false`, `persistent: true` | Long-running dev servers |
| `lint` | `{}` | Default caching |
| `db:types` | `cache: false` | Always re-run |

### 1.3 `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Internal packages are referenced with `workspace:*`.

### 1.4 `.prettierrc`

| Option | Value |
|---|---|
| `semi` | `false` |
| `singleQuote` | `true` |
| `trailingComma` | `"all"` |
| `printWidth` | `100` |

### 1.5 `.mcp.json`

Configures one MCP server for Claude Code / IDE tooling:

- `supabase`: type `http`, URL `https://mcp.supabase.com/mcp?project_ref=<project-ref>`.

No secrets are stored in this file (authentication is handled by the MCP client). See the Notes section regarding the project ref value.

---

## 2. `@iha/ui`

### 2.1 Overview

A shadcn/ui-style component library built on Radix primitives, Tailwind CSS, `class-variance-authority`, and `react-hook-form`. It contains:

- Generic primitives (Button, Input, Dialog, Select, Table, Tabs, Form, etc.).
- Domain components shared by the provider portals (doctor, hospital, visa): case tables, status badges, message threads, upload fields, registration wizard steps.
- A separate `auth` entry point with full login / register / OTP / password-reset screens.
- A realtime notifications context (`hooks/`).

Several components talk to Supabase directly via `@iha/db/client` (browser client): `DocumentUploadField`, `SecurityTab`, `ProviderMessageThread`, `NotificationsChannelProvider`.

### 2.2 `package.json`

- **name:** `@iha/ui`, `sideEffects: false`
- **exports:**
  - `.` -> `./src/index.ts`
  - `./auth` -> `./src/auth/index.ts`
  - `./globals.css` -> `./src/globals.css`
- **scripts:** `lint: tsc --noEmit`
- **dependencies:** `@hookform/resolvers`, `@iha/db`, `@iha/validations`, `@radix-ui/react-{checkbox,dialog,label,radio-group,scroll-area,select,slot,tabs}`, `class-variance-authority`, `clsx`, `embla-carousel-react`, `lucide-react`, `react-hook-form`, `react-phone-number-input`, `sonner`, `tailwind-merge`, `zod`
- **devDependencies:** `@iha/config`, `@types/react`, `@types/react-dom`, `react`, `react-dom`, `typescript`
- **peerDependencies:** `@hookform/resolvers ^5`, `next >=14`, `react ^19`, `react-dom ^19`, `react-hook-form ^7`

### 2.3 `tsconfig.json`

Extends `@iha/config/tsconfig.base.json`; overrides `jsx: "react-jsx"`, `lib: ["dom", "dom.iterable", "esnext"]`; includes `src/**/*.ts`, `src/**/*.tsx`.

### 2.4 How apps consume it

- `import { Button, Card, ... } from '@iha/ui'` (all 5 apps).
- `import { LoginForm, AuthShell, ... } from '@iha/ui/auth'` (all 5 apps).
- Every app's `tailwind.config.ts` adds `'../../packages/ui/src/**/*.{ts,tsx}'` to `content` so classes used inside the package are generated.
- `@iha/ui/globals.css` is exported but **no app imports it**; each app has its own `app/globals.css`.
- `NavigationProgressProvider` relies on an `animate-nav-progress` class that is defined in the consuming app's `globals.css` (present in patient, doctor, hospital).

### 2.5 File reference: root components (`packages/ui/src/*.tsx`)

`'use client'` is noted where the file declares it.

#### Primitives

| File | Exports | Props / behaviour | Used by |
|---|---|---|---|
| `packages/ui/src/button.tsx` | `Button`, `ButtonProps` | CVA `variant`: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; `size`: `default`, `sm`, `lg`, `icon`; `asChild` renders via Radix `Slot`. | doctor, hospital, patient, visa |
| `packages/ui/src/badge.tsx` | `Badge`, `BadgeProps` | `variant`: `default`, `secondary`, `destructive`, `outline`; plus div attributes. | none found |
| `packages/ui/src/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Styled divs/heading accepting standard HTML attributes. | all 5 apps |
| `packages/ui/src/checkbox.tsx` (client) | `Checkbox`, `CheckboxProps` | forwardRef wrapper over `@radix-ui/react-checkbox` Root. | doctor, hospital, patient |
| `packages/ui/src/input.tsx` | `Input`, `InputProps` | forwardRef `<input>` with standard attributes. | doctor, hospital, patient, visa |
| `packages/ui/src/password-input.tsx` (client) | `PasswordInput`, `PasswordInputProps` | Input with a show/hide toggle. | auth forms, AccountStep (internal) |
| `packages/ui/src/date-input.tsx` | `DateInput`, `DateInputProps` | `<input type="date">` (all input attrs except `type`); native picker trigger stretched over the whole field, decorative calendar icon, faux-placeholder muted color when empty. | doctor, patient |
| `packages/ui/src/time-input.tsx` | `TimeInput`, `TimeInputProps` | Same approach for `<input type="time">`. | doctor |
| `packages/ui/src/textarea.tsx` | `Textarea`, `TextareaProps` | forwardRef `<textarea>`. | doctor, visa |
| `packages/ui/src/label.tsx` | `Label`, `LabelProps` | forwardRef over `@radix-ui/react-label`. | visa |
| `packages/ui/src/radio-group.tsx` (client) | `RadioGroup`, `RadioGroupItem` | forwardRef over `@radix-ui/react-radio-group`. | doctor |
| `packages/ui/src/otp-input.tsx` (client) | `OtpInput`, `OtpInputProps` | `value`, `onChange(value)`, `length?` (default 6), `disabled?`, `className?`. Segmented one-digit boxes. | VerifyOtpForm (internal) |
| `packages/ui/src/phone-input.tsx` (client) | `PhoneInput` | `value`, `onChange(value)`, `onBlur?`, `disabled?`, `placeholder?`. Wraps `react-phone-number-input` with an internal styled input; outputs E.164 strings. | doctor, hospital, patient, visa |
| `packages/ui/src/search-input.tsx` (client) | `SearchInput` | `value`, `onChange(value)`, `placeholder?`, `className?`. Input with search icon. | doctor, hospital, visa |
| `packages/ui/src/tag-input.tsx` (client) | `TagInput` | `value: string[]`, `onChange(tags)`, `placeholder?` (default "Type and press Enter"), `className?`. Enter adds a tag, chips are removable. | doctor, hospital, patient |
| `packages/ui/src/toggle-switch.tsx` (client) | `ToggleSwitch` | `checked`, `onChange(checked)`, `disabled?`, `label?`. | doctor, hospital, visa |
| `packages/ui/src/multi-select-checklist.tsx` (client) | `MultiSelectChecklist`, `MultiSelectOption` | `options: {value, label, description?}[]`, `value: string[]`, `onChange`, `emptyMessage?`. Inline checkbox list. | doctor, hospital |
| `packages/ui/src/multi-select-dropdown.tsx` (client) | `MultiSelectDropdown` | `options: MultiSelectOption[]`, `value`, `onChange`, `placeholder?`, `emptyMessage?`. Dropdown variant. | doctor, hospital |
| `packages/ui/src/select.tsx` (client) | `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` | shadcn wrappers over `@radix-ui/react-select`. | doctor, hospital, patient, visa |
| `packages/ui/src/tabs.tsx` (client) | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Wrappers over `@radix-ui/react-tabs`. | patient (also CaseTabs internally) |
| `packages/ui/src/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` | forwardRef styled table elements. | doctor, hospital, patient, visa |
| `packages/ui/src/dialog.tsx` (client) | `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogCloseButton` | Radix Dialog. `DialogContent` renders portal + overlay with centered animated content (no built-in close button); `DialogCloseButton({ className? })` is a separate X button. | doctor, hospital, patient, visa |
| `packages/ui/src/scroll-area.tsx` (client) | `ScrollArea`, `ScrollBar` | Radix scroll area. | none found |
| `packages/ui/src/skeleton.tsx` | `Skeleton`, `SkeletonProps` | Pulse placeholder div. | all 5 apps |
| `packages/ui/src/carousel.tsx` (client) | `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, `CarouselApi` | Embla carousel. `Carousel` props: `opts?`, `plugins?`, `orientation?: 'horizontal' \| 'vertical'`, `setApi?(api)`. Context exposes `scrollPrev/scrollNext/canScrollPrev/canScrollNext`. | patient |
| `packages/ui/src/pagination.tsx` (client) | `Pagination` | `page`, `totalPages`, `onPageChange(page)`. | doctor, hospital, visa |
| `packages/ui/src/stepper.tsx` | `Stepper`, `StepperProps`, `StepperStep` | `steps: {key: number, label: string}[]`, `currentStep`, `orientation?` (default horizontal). | WizardLayout (internal) |
| `packages/ui/src/form.tsx` (client) | `Form` (= RHF `FormProvider`), `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` | shadcn react-hook-form bindings: `FormField` wraps RHF `Controller` and provides field context; `FormControl` wires `id`/`aria-*`; `FormMessage` shows the field error. | doctor, hospital, patient, visa |

#### Domain / portal components

| File | Exports | Props / behaviour | Used by |
|---|---|---|---|
| `packages/ui/src/case-status-badge.tsx` | `CaseStatusBadge`, `getStatusColor`, `getStatusLabel` | `status: string`. Maps case statuses (`case_submitted`, `under_review`, `doctor_assigned`, `evaluation`, `treatment_plan`, `treatment_confirmed`, `payment_confirmed`, `visa_documents_submitted`, `visa_processing`, `travel_ready`, `visa_rejected`, `completed`, `closed`) to Tailwind color classes and provider-facing labels (e.g. `case_submitted` -> "New", `treatment_plan`/`treatment_confirmed` -> "Awaiting Patient", `payment_confirmed` -> "Treatment Confirmed"). Unknown status falls back to slate / raw value. Colors are kept in sync with patient's own copy. | hospital, patient (`getStatusColor`) |
| `packages/ui/src/case-row-status-badge.tsx` | `CaseRowStatusBadge` | `assignmentStatus`, `caseStatus`, `planSubmittedAt?`, `treatmentPlanStatus?`. Priority: `declined` -> "Declined"; `withdrawn` -> "Withdrawn"; `cancelled` -> "Case Closed"; plan `rejected_by_iha` -> "Declined"; `invited` -> "New"; plan submitted while case is `evaluation` -> "Treatment Plan Sent"; otherwise `CaseStatusBadge`. | doctor, hospital |
| `packages/ui/src/case-date-filter.tsx` (client) | `CaseDateFilter`, `DateRangeOption` | `options: {value, label, href}[]`, `value`. Select that navigates via `router.push(option.href)` (URL-driven filter). | doctor, hospital |
| `packages/ui/src/case-tabs.tsx` (client) | `CaseTabs`, `CaseTabOption` | `tabs: {key, label, href}[]`, `activeKey`. Pill tabs that navigate with `router.push`. | doctor, hospital, visa |
| `packages/ui/src/case-assignments-table.tsx` (client) | `CaseAssignmentsTable` | `assignments` (rows from `AssignmentWithCase`, `@iha/db/case-assignments`), `showDoctorColumn?`, `viewHrefBase?` (adds Action link to `${base}/${caseId}`), `viewHrefDisambiguateAssignment?` (appends `?assignmentId=`), `searchPlaceholder?`, `extraFilter?: ReactNode`. Client-side search on patient name / reference / doctor name; page size 15. | doctor, hospital |
| `packages/ui/src/case-documents-list.tsx` (client) | `CaseDocumentsList` | `documents: CaseDocument[]`. List with type icon, size, preview (via `DocumentPreviewModal`) and download; empty-state text. | doctor |
| `packages/ui/src/document-preview-modal.tsx` (client) | `DocumentPreviewModal`, `DocumentPreviewModalProps` | `fileName`, `mimeType`, `url`, `onClose`, `headerExtra?`, `openInNewTabLabel?`. Renders images/PDF inline. | patient, visa |
| `packages/ui/src/document-upload-field.tsx` (client) | `DocumentUploadField`, `UploadedFileMetaLike` | Generic over `TCategory`. Props: `bucket`, `pathPrefix`, `maxFiles?` (10), `category?`, `value`, `onChange`. Drag-and-drop direct upload to Supabase Storage; accepts PDF, JPEG, PNG, DOC, DOCX up to 10 MB; filenames sanitized; per-file uploading/done/error state; `sonner` toasts. | doctor, hospital, visa |
| `packages/ui/src/provider-message-thread.tsx` (client) | `ProviderMessageThread` | `thread`, `initialMessages`, `accountRole`, `sendMessageAction(threadId, body)`, `markMessagesReadAction(threadId)`, `requestReopenAction(threadId, reason)` (actions return `Result<{success: true}>`). Provider-to-MTA-Admin chat; subscribes to Supabase realtime `INSERT` on `provider_messages` filtered by `thread_id`; auto-marks admin messages read; closed threads offer a reopen request via `RequestReopenModal`. | doctor, hospital, visa |
| `packages/ui/src/request-reopen-modal.tsx` (client) | `RequestReopenModal` | `threadId`, `onClose`, `onSuccess`, `requestReopenAction`. Form validated by `reopenRequestSchema` (10-500 chars). | patient (and ProviderMessageThread) |
| `packages/ui/src/notification-row.tsx` | `NotificationRow` | `notification: Notification`, `onClick`, `dense?`. Single notification list item with relative time. | doctor, hospital, visa |
| `packages/ui/src/navigation-progress.tsx` (client) | `NavigationProgressProvider`, `LinkProgressReporter` | Provider renders a fixed 2px top progress bar while any tracked link is pending (counter-based). `LinkProgressReporter` is placed inside a `<Link>` and reports `useLinkStatus().pending`. Covers middleware latency that `loading.tsx` cannot. | Provider: doctor, hospital, visa (patient has a local wrapper); Reporter: doctor, hospital, patient, visa |
| `packages/ui/src/security-tab.tsx` (client) | `SecurityTab` | No props. Change-password form (`current_password`, `new_password` min 8, `confirm_password` must match). Verifies current password with `signInWithPassword`, then `auth.updateUser`; toasts on result. Uses an inline Zod schema. | doctor, hospital, patient, visa |
| `packages/ui/src/treatment-plan-summary.tsx` | `TreatmentPlanSummary` | `plan: TreatmentPlanWithSpecialists` (`@iha/db/treatment-plans`). Read-only sectioned view of a treatment plan (type badge, fields, costs, specialists, prose sections). | hospital |
| `packages/ui/src/wizard-layout.tsx` | `WizardLayout` | `eyebrow`, `steps: StepperStep[]`, `currentStep`, `children`, `sidebarNotice?`. Two-column registration wizard shell with vertical stepper. | doctor, hospital, visa |
| `packages/ui/src/account-step.tsx` (client) | `AccountStep` | `onSubmit(values: RegistrationAccountInput) => Promise<{error?}>`. Wizard step 1 (email/password/confirm), validated by `registrationAccountStepSchema`; caller runs `signUp()` so later uploads have a session. | doctor, hospital, visa |
| `packages/ui/src/agreement-step.tsx` (client) | `AgreementStep` | `isSubmitting`, `onSubmit()`, `onBack()`. Final wizard step: two required checkboxes validated by `agreementStepSchema` (client gate only). | doctor, hospital, visa |

### 2.6 `packages/ui/src/hooks/`

| File | Exports | Description | Used by |
|---|---|---|---|
| `packages/ui/src/hooks/use-notifications-channel.tsx` (client) | `NotificationsChannelProvider`, `useNotificationsChannel` | Provider props: `userId`, `initialUnreadCount`, `children`. Opens **one** Supabase realtime channel `notifications:<userId>` listening for `INSERT` on `public.notifications` filtered by `user_id`, sets realtime auth from the session, increments `unreadCount`, and fans out rows to subscribers. Context value: `subscribe(listener) => unsubscribe`, `unreadCount`, `markOneAsRead()`, `markAllAsRead()`. The hook throws outside the provider. Prevents duplicate websockets between e.g. a bell and a list. | Provider: doctor, hospital, patient, visa. Hook: doctor, hospital, visa |

### 2.7 `packages/ui/src/lib/`

| File | Exports | Description | Used by |
|---|---|---|---|
| `packages/ui/src/lib/utils.ts` | `cn(...inputs: ClassValue[])` | `twMerge(clsx(inputs))` class merger. | doctor, hospital, patient, visa, and internally |
| `packages/ui/src/lib/format-relative-time.ts` | `formatRelativeTime(iso: string): string` | "just now" (<60 s), "N minute(s) ago", "N hour(s) ago", "Yesterday", "N days ago" (<7 d), otherwise `en-AU` date (e.g. "5 Mar 2026"). | patient, NotificationRow |

### 2.8 `packages/ui/src/auth/` (entry point `@iha/ui/auth`)

All auth forms share a button style (`#6d96a6`), show `AuthLogo`, use `react-hook-form` + `zodResolver` with schemas from `@iha/validations/auth`, and surface server errors through `form.setError('root', ...)`. Server work is injected as callbacks (typically Server Actions).

| File | Exports | Props / behaviour | Used by |
|---|---|---|---|
| `packages/ui/src/auth/index.ts` | Barrel for everything below | | |
| `packages/ui/src/auth/auth-shell.tsx` | `AuthShell`, `AuthShellProps` | `children`, `sidebarProps?: AuthSidebarProps`, `contentClassName?` (overrides default `max-w-[400px]`). Split-screen layout: sidebar + centered content. | all 5 apps |
| `packages/ui/src/auth/auth-sidebar.tsx` | `AuthSidebar`, `AuthSidebarProps` | `illustrationSrc?` (default `/auth-illustration.png`). Marketing panel (hidden below `lg`) with four feature cards. | patient (directly), all via AuthShell |
| `packages/ui/src/auth/auth-logo.tsx` | `AuthLogo`, `AuthLogoProps` | `logoSrc?` (default `/logo.png`), `className?`. | internal |
| `packages/ui/src/auth/auth-divider.tsx` | `AuthDivider` | "Or" horizontal divider. | internal |
| `packages/ui/src/auth/social-auth-buttons.tsx` (client) | `SocialAuthButtons`, `SocialAuthButtonsProps` | `onOAuthClick(provider: 'google' \| 'apple' \| 'azure')`, `disabled?`. Round Google / Microsoft (`azure`) / Apple buttons. | internal (Login/Register) |
| `packages/ui/src/auth/login-form.tsx` (client) | `LoginForm`, `LoginFormProps` | `onSubmit(values: LoginInput) => Promise<{error?, redirectTo?}>`, `onOAuthSignIn`, `registerHref?` (`/register`), `forgotPasswordHref?` (`/forgot-password`). Email, password, "Remember me", social buttons. Re-parses with `loginSchema` to apply defaults before calling `onSubmit`. | all 5 apps |
| `packages/ui/src/auth/register-form.tsx` (client) | `RegisterForm`, `RegisterFormProps` | `onSubmit(values: RegisterInput)`, `onOAuthSignIn`, `loginHref?`. Full name, email, password, confirm. | admin, patient |
| `packages/ui/src/auth/verify-otp-form.tsx` (client) | `VerifyOtpForm`, `VerifyOtpFormProps` | `email`, `onSubmit(values: VerifyOtpInput)`, `onResend(email) => Promise<{error?, rateLimited?}>`, `showLogo?` (true). 6-digit `OtpInput`; resend button with a 60 s cooldown that starts running on mount. | all 5 apps |
| `packages/ui/src/auth/forgot-password-form.tsx` (client) | `ForgotPasswordForm`, `ForgotPasswordFormProps` | `onSubmit(values) => Promise<{error?, success?}>`, `loginHref?`. Shows a neutral "if an account exists..." confirmation on success. | all 5 apps |
| `packages/ui/src/auth/reset-password-form.tsx` (client) | `ResetPasswordForm`, `ResetPasswordFormProps` | `onSubmit(values: ResetPasswordInput)`, `onBackToLogin(): Promise<void>` (form action that signs out the recovery session before redirecting, so the user is not dropped into the dashboard). | all 5 apps |

### 2.9 `packages/ui/src/globals.css`

Tailwind `base/components/utilities` plus shadcn-style CSS variables on `:root` (HSL triplets, consumed by the Tailwind preset as `hsl(var(--x))`):

| Variable | Value | Variable | Value |
|---|---|---|---|
| `--background` | `0 0% 100%` | `--foreground` | `222.2 84% 4.9%` |
| `--card` | `0 0% 100%` | `--card-foreground` | `222.2 84% 4.9%` |
| `--primary` | `221.2 83.2% 53.3%` | `--primary-foreground` | `210 40% 98%` |
| `--secondary` | `210 40% 96.1%` | `--secondary-foreground` | `222.2 47.4% 11.2%` |
| `--muted` | `210 40% 96.1%` | `--muted-foreground` | `215.4 16.3% 46.9%` |
| `--accent` | `210 40% 96.1%` | `--accent-foreground` | `222.2 47.4% 11.2%` |
| `--destructive` | `0 84.2% 60.2%` | `--destructive-foreground` | `210 40% 98%` |
| `--border` | `214.3 31.8% 91.4%` | `--input` | `214.3 31.8% 91.4%` |
| `--ring` | `221.2 83.2% 53.3%` | `--radius` | `0.5rem` |

Base layer applies `border-border` to all elements and `bg-background text-foreground` to `body`. No dark-mode (`.dark`) variables are defined although the preset enables `darkMode: ['class']`.

### 2.10 `packages/ui/src/index.ts` (barrel)

Re-exports every component listed in 2.5, `cn`, `formatRelativeTime`, and the notifications channel provider/hook. Grouped with comments: generic primitives; "shared between the hospital and doctor provider portals" (case badges, filters, tabs, assignments table, pagination); "shared between the hospital, doctor, and visa provider portals" (message thread, reopen modal, upload field, inputs, navigation progress, security tab, wizard pieces, notification row). Auth components are **not** in this barrel; they live under `@iha/ui/auth`.

---

## 3. `@iha/validations`

### 3.1 Overview

Zod (v3) schemas shared by client forms (via `zodResolver`) and server actions, inferred input types, the `Result<T>` return type, and an `isValidPhone` helper (libphonenumber-js).

Two schema styles coexist:

1. **Static schemas** (e.g. `loginSchema`, `personalInfoSchema`) with hard-coded English messages.
2. **Message-factory schemas** (`getXxxSchema(messages?)`) that accept a messages object for localisation and also export a default instance built with English defaults (e.g. `getVisaFormSchema()` / `visaFormSchema`).

### 3.2 `package.json`

- **name:** `@iha/validations`
- **exports:** `.` (`src/index.ts`), `./case`, `./treatment`, `./patient`, `./payment`, `./auth`, `./phone`, `./result`, `./provider-registration`. (No subpath exports for `case-assignment`, `case-note`, `chat`, `provider-message`, `treatment-plan`, `visa`; use the root barrel.)
- **scripts:** `lint: tsc --noEmit`
- **dependencies:** `libphonenumber-js ^1.13.5`, `zod ^3.25.51`
- **devDependencies:** `@iha/config`, `typescript`

### 3.3 `tsconfig.json`

Extends the base config; `lib: ["esnext"]` (no DOM); includes `src/**/*.ts`.

### 3.4 How apps consume it

Mostly `import { ... } from '@iha/validations'` (root barrel); `@iha/validations/auth`, `/phone`, and `/provider-registration` subpaths are also used (notably by `@iha/ui`). Consumers: all 5 apps, `@iha/ui`, `@iha/db`.

### 3.5 The `Result` type pattern

`packages/validations/src/result.ts`:

```ts
export type Result<T> =
  | { data: T; error: null }
  | { data: null; error: string }
```

A discriminated union returned by server actions and data functions. Callers check `error` first; when `error` is `null`, `data` is typed as `T`. Used across all 5 apps, `@iha/ui` (`ProviderMessageThread`, `RequestReopenModal` action props) and `@iha/db`.

### 3.6 File reference

#### `packages/validations/src/index.ts`
Barrel: `export *` from auth, case, case-assignment, case-note, chat, provider-message, patient, payment, phone, provider-registration, result, treatment, treatment-plan, visa.

#### `packages/validations/src/auth.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `emailField` | string, trimmed, lowercased, `.email()` | hospital, provider-registration |
| `passwordField` | min 8, at least one uppercase `[A-Z]`, at least one digit `[0-9]` | provider-registration |
| `loginSchema` | `email` (emailField), `password` (min 1), `rememberMe` boolean default `false` | all apps, ui |
| `registerSchema` | `fullName` (trim, min 2), `email`, `password` (passwordField), `confirmPassword` (min 1); refine: passwords match (error on `confirmPassword`) | admin, patient, ui |
| `verifyOtpSchema` | `email`, `otp` length 6 and `/^\d{6}$/` | all apps, ui |
| `forgotPasswordSchema` | `email` | all apps, ui |
| `resetPasswordSchema` | `password` (passwordField), `confirmPassword`; refine: match | all apps, ui |
| `oauthProviders` / `OAuthProvider` | `'google' \| 'apple' \| 'azure'` | all apps, ui |
| Types | `LoginInput` (output), `LoginFormValues` (input), `RegisterInput`, `VerifyOtpInput`, `ForgotPasswordInput`, `ResetPasswordInput` | |

#### `packages/validations/src/provider-registration.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `registrationAccountStepSchema` | `loginEmail` (emailField), `password` (passwordField), `confirmPassword`; refine: match. Step 1 of hospital and doctor (and visa) wizards. | doctor, hospital, visa, ui (`AccountStep`) |
| `agreementStepSchema` | `agreedToTerms: literal(true)`, `confirmedAccuracy: literal(true)` with custom messages. Client-side gate only. | ui (`AgreementStep`) |
| Types | `RegistrationAccountInput`, `AgreementInput` | |

#### `packages/validations/src/case.ts`

| Export | Description | Used by |
|---|---|---|
| `VISA_DOCUMENT_CATEGORIES` / `VisaDocumentCategory` | `passport`, `passport_photograph`, `hospital_invitation`, `appointment_confirmation`, `bank_statement`, `sponsorship_letter`, `employer_letter`, `companion_passport`, `companion_proof_of_relationship` | patient |
| `UPLOADABLE_VISA_DOCUMENT_CATEGORIES` | Same minus `hospital_invitation` and `appointment_confirmation` (hospital-generated letters); drives upload pickers | patient |
| `DOCUMENT_TYPES` / `DocumentType` | `lab_report`, `mri_ct`, `xray`, `prescription`, `medical_history`, `other` | patient |
| `DOCUMENT_TYPE_LABELS` | Human labels for `DOCUMENT_TYPES` | none found |
| `getMedicalDetailsSchema(messages?)` / `medicalDetailsSchema` | `specialty` (min 1), `specialty_other` (max 100, optional), `description` (50-2000 chars); refine: if `specialty === 'Other'`, `specialty_other` must be at least 2 trimmed chars. `MedicalDetailsMessages` type for overrides. | patient |
| `submittedDocumentSchema` | `localId`, `file_name`, `file_path`, `file_size_bytes` (number), `mime_type`, `document_type` (enum DOCUMENT_TYPES) | none found |
| `caseSubmissionSchema` / `CaseSubmissionInput` | Backward-compat aliases of `medicalDetailsSchema` | none found |
| Types | `MedicalDetailsInput`, `SubmittedDocument` | |

#### `packages/validations/src/case-assignment.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `getDeclineReasonSchema(messages?)` / `declineReasonSchema` | `reason` optional, max 500 | doctor, hospital |
| `getAdditionalInfoRequestSchema(messages?)` / `additionalInfoRequestSchema` | `message` 10-1000 chars | doctor, hospital |
| Types | `DeclineReasonMessages`, `DeclineReasonInput`, `AdditionalInfoRequestMessages`, `AdditionalInfoRequestInput` | |

#### `packages/validations/src/case-note.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `getCaseNoteBodySchema(messages?)` / `caseNoteBodySchema` | `body` trimmed, 1-5000 chars | visa |
| Types | `CaseNoteBodyMessages`, `CaseNoteBodyInput` | |

#### `packages/validations/src/chat.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `getReopenRequestSchema(messages?)` / `reopenRequestSchema` | `reason` 10-500 chars | patient, ui |
| Types | `ReopenRequestMessages`, `ReopenRequestInput` | |

#### `packages/validations/src/provider-message.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `getMessageBodySchema(messages?)` / `messageBodySchema` | `body` 1-2000 chars (not trimmed) | doctor, hospital, visa |
| Types | `MessageBodyMessages`, `MessageBodyInput` | |

#### `packages/validations/src/patient.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `personalInfoSchema` | `full_name` 2-100 chars and must contain a letter; `date_of_birth` required, valid date, in the past and within 120 years; `gender` enum `male \| female \| other \| prefer_not_to_say`; `nationality`, `country_of_residence` required; `phone` via `isValidPhone`; `address` optional | patient |
| `medicalBackgroundSchema` | `medical_history` optional; `allergies`, `current_medications` optional arrays, max 20 items, each max 100 chars; `past_surgeries` optional | patient |
| `emergencyContactSchema` | `emergency_contact_name`, `emergency_contact_relationship` required; `emergency_contact_phone` via `isValidPhone` | patient |
| `profileSetupSchema` | merge of the three above | none found |
| `patientProfileSchema` | alias of `personalInfoSchema` (backwards compat) | none found |
| Types | `PersonalInfoInput`, `MedicalBackgroundInput`, `EmergencyContactInput`, `ProfileSetupInput`, `PatientProfileInput` | |

#### `packages/validations/src/payment.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `paymentInitiationSchema` | `case_id` uuid, `amount_cents` positive int, `payment_type` enum `consultation_fee \| treatment_deposit` | none found |
| `PaymentInitiationInput` | | |

#### `packages/validations/src/phone.ts`

| Export | Description | Used by |
|---|---|---|
| `isValidPhone(val: string): boolean` | `false` for empty; otherwise `libphonenumber-js` `isValidPhoneNumber` (expects international/E.164 format); swallows parse exceptions | doctor, hospital, visa; patient.ts, visa.ts |

#### `packages/validations/src/treatment.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `treatmentPlanReviewSchema` | `plan_id` uuid, `status` enum `iha_approved \| rejected_by_iha`, `rejection_reason` optional | none found |
| `TreatmentPlanReviewInput` | | |

#### `packages/validations/src/treatment-plan.ts`

| Export | Fields / rules | Used by |
|---|---|---|
| `treatmentTypes` / `TreatmentType` | `medication_only`, `surgery`, `therapy` | doctor |
| `costItemSchema` | `label` min 1, `amount` coerced number >= 0 | (nested) |
| `specialistSchema` | `specialist_type` min 1, `specialist_name` optional, `cost_aud` coerced > 0, `notes` optional | (nested) |
| `treatmentPlanDraftSchema` | All fields optional so partial drafts can be saved: `hospital_id` (uuid, nullable), `diagnosis`, `treatment_type`, `procedure_name`, `description`, `technique`, `expected_outcome`, `success_rate`, `treatment_start_date` (if present, not in the past), `treatment_end_date`, `recovery_time`, `estimated_length_of_stay`, `department`, `room_category`, `special_requirements`, `doctor_fees_aud`/`hospital_fees_aud` (coerced >= 0), `cost_items[]`, `cost_notes`, `patient_instructions`, `aftercare: string[]`, `specialists[]`. `superRefine`: end date must be on or after start date. | doctor |
| `treatmentPlanSubmitSchema` | Draft shape extended with required: `hospital_id` uuid, `diagnosis` min 10, `treatment_type`, `procedure_name` min 1, `doctor_fees_aud` > 0, `treatment_start_date` required and not in past, `treatment_end_date` required, `estimated_length_of_stay` required; same date-order check. Mirrors the server-side `submit_treatment_plan()` RPC gate. | doctor |
| Types | `CostItemInput`, `SpecialistInput`, `TreatmentPlanDraftInput`, `TreatmentPlanSubmitInput` | |

#### `packages/validations/src/visa.ts`

| Export | Description | Used by |
|---|---|---|
| `getVisaFormSchema(messages?)` / `visaFormSchema` | Multi-step visa application. Step 0 traveler: `first_name`, `last_name`, `gender`, `nationality` required; `date_of_birth` valid, past, within 120 years; `australian_provider_details` optional; `passport_number` trimmed, `/^[A-Z0-9]{5,12}$/i`; `passport_expiry` in the future; `email` valid; `phone` via `isValidPhone`. Step 1 medical: `condition_summary` optional, `has_medical_conditions` and `health_examination_completed` required answers, `medical_conditions_details` optional. Step 2 provider: `provider_name`, `provider_organization`, `provider_address` required, `provider_contact` required valid phone. Step 3 financial: `source_of_funds` required; `bank_balance`, `sponsor_name`, `sponsor_relationship` optional; `sponsor_contact` optional but valid phone if set (other conditional rules enforced in the form's `handleNext`). Step 4 travel: `arrival_date` today or later, `departure_date` required; `purpose_of_visit`, `flight_booking`, `accommodation` optional. Step 6 legal: `criminal_record`, `previous_visa_issues` required answers with optional details. Step 7 companion: all optional; `superRefine` makes `companion_name`, `companion_relationship`, `companion_passport_number`, `companion_passport_expiry` required when `travelling_with_companion === 'Yes'` and validates the companion passport format. `VisaFormMessages` type lists all overridable messages. | patient, db |
| `pendingVisaDocumentSchema` | `category`, `fileName`, `filePath` non-empty; `fileSizeBytes` positive int; `mimeType` non-empty | (nested) |
| `pendingVisaDocumentsSchema` | array of the above | db |
| Types | `VisaFormInput`, `PendingVisaDocumentInput` | |

---

## 4. `@iha/notifications`

### 4.1 Overview

Server-only package that sends **supplementary** email and SMS alerts for notifications. In-portal notifications (rows in `public.notifications`, shown via realtime) are created elsewhere (DB triggers / `@iha/db`) and cannot be disabled; this package only handles the email/SMS channels, gated by each recipient's preferences.

Providers:
- **Email:** Resend, rendered with React Email (`@react-email/components`).
- **SMS:** Twilio.

All sends are best-effort: missing configuration or provider errors are logged via `@iha/logger` and never thrown.

### 4.2 `package.json`

- **name:** `@iha/notifications`; **exports:** `.` -> `./src/index.ts`
- **scripts:** `lint: tsc --noEmit`
- **dependencies:** `@iha/logger`, `@react-email/components ^0.0.41`, `react`, `react-dom`, `resend ^4.5.1`, `twilio ^5.7.1`
- **devDependencies:** `@iha/config`, `@types/react`, `@types/react-dom`, `typescript`

### 4.3 `tsconfig.json`

Extends the base config; `jsx: "react-jsx"`, `lib: ["dom", "dom.iterable", "esnext"]`; includes `.ts` and `.tsx`.

### 4.4 Environment variables (names only)

| Variable | Required | Purpose | Behaviour if missing |
|---|---|---|---|
| `RESEND_API_KEY` | for email | Resend API key | Logs error, skips email |
| `RESEND_FROM_ADDRESS` | optional | Sender | Defaults to `MTA Patient Portal <onboarding@resend.dev>` |
| `TWILIO_ACCOUNT_SID` | for SMS | Twilio account | Logs error, skips SMS |
| `TWILIO_AUTH_TOKEN` | for SMS | Twilio auth | Logs error, skips SMS |
| `TWILIO_PHONE_NUMBER` | for SMS | Sender number | Silently skips SMS |

These appear in `apps/*/.env.example` (admin, doctor, hospital, visa) because the code runs inside the app server process.

### 4.5 How it is consumed

No app imports it directly. It is a dependency of `@iha/db`, which calls `dispatchNotificationAlerts` from:

- `packages/db/src/cases.ts`: `sendNotificationAlerts` / `dispatchCaseStatusAlerts` (patient recipients; reads `patients.phone`, `email_notifications_enabled`, `sms_notifications_enabled`; `appUrl` = patient portal). `dispatchCaseStatusAlerts(supabase, caseId, type)` re-sends the latest in-portal notification of a type for a case; status changes made directly in Supabase therefore only produce the in-portal notification.
- `packages/db/src/case-assignments.ts`: doctor recipients (`doctors.contact_phone`, doctor notification preferences; `appUrl` = doctor portal), e.g. `case_assigned_by_admin`.
- `packages/db/src/consultations.ts`: doctor recipients for consultation events.

### 4.6 File reference

#### `packages/notifications/src/index.ts`
Exports `dispatchNotificationAlerts`, `DispatchNotificationAlertsParams`, `sendNotificationEmail`, `sendNotificationSms`. (`getNotificationChannelConfig`, `NotificationType` and `NotificationEmail` are internal.)

#### `packages/notifications/src/dispatch.ts`
`dispatchNotificationAlerts(params): Promise<void>`

| Param | Type | Description |
|---|---|---|
| `type` | `string` | Notification type (keys config) |
| `title`, `message` | `string` | Content, typically copied from the in-portal notification row |
| `ctaUrl?` | `string` | Deep link for the button / SMS |
| `appUrl` | `string` | Recipient's portal base URL (footer preferences link) |
| `email`, `phone` | `string \| null` | Destinations |
| `emailEnabled`, `smsEnabled` | `boolean` | Recipient preferences |

Sends email only if `emailEnabled && email`, SMS only if `smsEnabled && phone`, in parallel with `Promise.all`. Because the senders catch their own errors, the promise effectively never rejects.

#### `packages/notifications/src/email.ts`
`sendNotificationEmail({ to, type, title, message, ctaUrl?, appUrl })`: lazily creates a singleton Resend client, looks up the channel config, and sends with `subject = emailSubject(title)` and `react = NotificationEmail({...})`. Logs Resend `error` responses and exceptions with logger `notifications:email`.

#### `packages/notifications/src/sms.ts`
`sendNotificationSms({ to, type, message, ctaUrl? })`: lazily creates a singleton Twilio client; body is `${smsPrefix}${message}` plus ` ${ctaUrl}` if present. Logs failures with logger `notifications:sms`.

#### `packages/notifications/src/config.ts`
Defines `NotificationType` and a per-type `ChannelConfig` (`emailSubject(title)`, `ctaLabel`, `smsPrefix`). `getNotificationChannelConfig(type)` returns the matching config or `DEFAULT_CONFIG` (subject = title, CTA "View in portal", SMS prefix `MTA: `).

| Type | When it is sent (by name / source) | Email subject | CTA label | SMS prefix |
|---|---|---|---|---|
| `welcome` | New patient account | title | View notifications | `MTA: ` |
| `case_submitted` | Patient submits a case | title | View case | `MTA: ` |
| `case_status_updated` | Case status changes | title | View case | `MTA: ` |
| `treatment_plan_ready` | Treatment plan(s) routed to patient | title | Review treatment options | `MTA: ` |
| `treatment_confirmed` | Patient confirms a treatment option | title | View case | `MTA: ` |
| `consultation_requested` | Consultation requested | title | View case | `MTA: ` |
| `consultation_slot_selected` | Patient picks a consultation slot (payment next) | title | Make payment | `MTA: ` |
| `consultation_scheduled` | Consultation confirmed | title | View consultation | `MTA: ` |
| `document_requested` | Visa documents requested from patient | `Action required: <title>` | View visa documents | `MTA: Action required — ` |
| `additional_info_requested` | Doctor/hospital requests more information | `Action required: <title>` | Upload documents | `MTA: Action required — ` |
| `visa_status_updated` | Visa status changes | title | View visa status | `MTA: ` |
| `visa_application_submitted` | Visa application submitted | title | View visa application | `MTA: ` |
| `payment_confirmed` | Payment cleared | title | View payment | `MTA: ` |
| `visa_approved` | Visa granted | title | Download visa | `MTA: ` |
| `visa_document_available` | Visa-related document (e.g. hospital letter) available | title | Download document | `MTA: ` |
| `case_closed_other_doctor_selected` | Doctor's case closed because patient chose another doctor | title | View case | `MTA: ` |
| `case_closed_plan_not_presented` | Doctor's case closed before their plan was presented | title | View case | `MTA: ` |
| `case_assigned_by_admin` | MTA Admin assigns a case to a doctor | title | View case | `MTA: ` |

The notification rows themselves (title/message text) are produced by SQL triggers in `packages/db/supabase/migrations` and by app/DB code; `treatment_plan_ready`, `consultation_slot_selected`, `consultation_scheduled` and `visa_approved` were not found as literals outside this config.

### 4.7 Templates

| File | Export | Description |
|---|---|---|
| `packages/notifications/src/templates/notification-email.tsx` | `NotificationEmail`, `NotificationEmailProps` | Single generic template used for **every** notification type. Props: `heading`, `message`, `ctaLabel?` (fallback "View in portal"), `ctaUrl?` (button rendered only if set), `appUrl`. Layout: "MTA" wordmark (teal `#0e7490`), heading, message, optional CTA button, divider, footer with support link `support@mta.example` and "Manage notification preferences" link to `${appUrl}/profile?tab=notifications`. Inline styles, max width 480px. |

---

## 5. `@iha/logger`

### 5.1 Overview and `package.json`

- **name:** `@iha/logger`; **exports:** `.` -> `./src/index.ts`
- **scripts:** `lint: tsc --noEmit`
- **dependencies:** `pino ^9.6.0`, `pino-pretty ^13.0.0`
- **devDependencies:** `@iha/config`, `typescript`
- **tsconfig.json:** extends base, `lib: ["esnext"]`, includes `src/**/*.ts`.

### 5.2 API (`packages/logger/src/index.ts`)

| Export | Description |
|---|---|
| `logger` | Root pino instance. Level from `LOG_LEVEL` env var, default **`error`**. |
| `createLogger(app: string)` | Returns `logger.child({ app })`; the `app` field tags every line. |
| `type Logger` | Re-export of pino's `Logger`. |

**Behaviour:**
- Non-production (`NODE_ENV !== 'production'`): logs go through a `pino-pretty` stream (colorized, `HH:MM:ss`, `pid`/`hostname` hidden).
- Production: plain JSON to stdout.
- `pino-pretty` is used as a direct stream rather than pino's `transport` option, because `transport` spawns a worker thread that resolves a file path at runtime and breaks under Next.js/webpack bundling.

### 5.3 Consumers

All 5 apps (server actions / route handlers, always via `createLogger`, e.g. `patient:chat`, `patient:payments-webhook`, `doctor:treatment-plans`, `visa:documents`), `@iha/db` (`src/audit.ts`), and `@iha/notifications` (`notifications:email`, `notifications:sms`). Apps list it as a dependency (`@iha/logger: workspace:*`).

---

## 6. `@iha/config`

### 6.1 `package.json`

- **name:** `@iha/config`
- **exports:** `./tsconfig.base.json`, `./eslint-next` (`eslint-next.js`), `./tailwind.preset` (`tailwind.preset.js`)
- **devDependencies:** `@eslint/eslintrc`, `@eslint/js`, `eslint ^9`, `eslint-config-next ^15.3.3`, `eslint-config-prettier`, `tailwindcss ^3.4.17`, `tailwindcss-animate`

Consumed by all 5 apps (`eslint.config.mjs`, `tailwind.config.ts`, `tsconfig.json`) and by every package's `tsconfig.json`.

### 6.2 `packages/config/eslint-next.js`

CommonJS flat config. Uses `FlatCompat` to extend `next/core-web-vitals` and `prettier`, then adds `no-console: warn` (allowing `console.warn` and `console.error`). Apps: `import eslintConfig from '@iha/config/eslint-next'`.

### 6.3 `packages/config/tailwind.preset.js`

Tailwind v3 preset, used as `presets: [sharedPreset]` by every app.

- `darkMode: ['class']`
- **Colors** (all `hsl(var(--token))`): `border`, `input`, `ring`, `background`, `foreground`; `primary`, `secondary`, `destructive`, `muted`, `accent`, `card`, each with `DEFAULT` and `foreground`.
- **borderRadius:** `lg = var(--radius)`, `md = calc(var(--radius) - 2px)`, `sm = calc(var(--radius) - 4px)`.
- **fontFamily:** `sans = var(--font-geist-sans), system-ui, sans-serif`; `mono = var(--font-geist-mono), monospace`.
- **plugins:** `tailwindcss-animate` (provides `animate-in`, `fade-in-0`, `zoom-in-95`, etc. used by Dialog/Select).

The CSS variables themselves must be defined by each app's `globals.css` (see 2.9 for the reference values).

### 6.4 `packages/config/tsconfig.base.json`

| Option | Value |
|---|---|
| `target` | `ES2017` |
| `lib` | `dom`, `dom.iterable`, `esnext` |
| `allowJs` | `true` |
| `skipLibCheck` | `true` |
| `strict` | `true` |
| `noEmit` | `true` |
| `esModuleInterop` | `true` |
| `module` | `esnext` |
| `moduleResolution` | `bundler` |
| `resolveJsonModule` | `true` |
| `isolatedModules` | `true` |
| `jsx` | `preserve` |
| `incremental` | `true` |
| `noUncheckedIndexedAccess` | `true` |
| `forceConsistentCasingInFileNames` | `true` |
| `exclude` | `node_modules` |

`noUncheckedIndexedAccess` means indexed access (`arr[0]`, `record[key]`) is typed as possibly `undefined`.

---

## 7. Notes

### Patterns

- **Source-only packages.** No package has a build step; apps transpile them. Package `lint` scripts are `tsc --noEmit`.
- **Dependency injection for server work.** UI forms receive server actions as props (`onSubmit`, `sendMessageAction`, `requestReopenAction`, ...) and return `{ error?, redirectTo? }` or `Result<T>`, keeping `@iha/ui` free of app-specific server code.
- **Localisable schemas.** Newer schemas use `getXxxSchema(messages)` factories with English defaults, enabling translated error messages without forking schemas.
- **Client/server schema mirroring.** `treatmentPlanSubmitSchema` mirrors the `submit_treatment_plan()` RPC gate; the server remains the source of truth.
- **Single realtime subscription per concern.** `NotificationsChannelProvider` centralises the notifications websocket; `ProviderMessageThread` opens one channel per thread and sets realtime auth from the session first.
- **Best-effort alerts.** Notification email/SMS never throw; failures are logged.

### Potential issues

1. **`@iha/ui/globals.css` is unused.** No app imports it; each app maintains its own `globals.css`. Theme values can drift between apps and from this reference file. No dark-mode variables exist although `darkMode: ['class']` is enabled.
2. **`animate-nav-progress` is app-defined.** `NavigationProgressProvider` depends on a keyframe class defined in patient, doctor and hospital `globals.css`, but not found in visa (which uses the provider) or in the Tailwind preset. In visa the bar would show without animation. Moving the keyframes into the preset would remove the hidden coupling.
3. **Duplicated status maps.** `case-status-badge.tsx` comments that colors are kept in sync manually with `apps/patient/components/cases/case-status-badge.tsx`; labels intentionally differ. Easy to drift.
4. **`SecurityTab` uses its own inline schema** (min 8 only), weaker than `passwordField` (uppercase + digit). Password-change rules are inconsistent with registration/reset rules. It also re-verifies the current password via `signInWithPassword`, which creates a new session.
5. **`@iha/ui` depends on `@iha/db`** (browser client and types), so the UI package is not independent of the data layer.
6. **Notification type safety.** `dispatchNotificationAlerts` takes `type: string`; unknown types silently fall back to `DEFAULT_CONFIG`. Several configured types (`treatment_plan_ready`, `consultation_slot_selected`, `consultation_scheduled`, `visa_approved`) have no producer found in code.
7. **Email template placeholders.** Footer uses `support@mta.example`, and the default sender is `onboarding@resend.dev` (Resend sandbox). Both should be set for production (`RESEND_FROM_ADDRESS`).
8. **Branding inconsistency.** Code mixes "IHA" (package scope, `AuthLogo` alt text) and "MTA" (emails, SMS prefix, UI copy).
9. **Logger default level is `error`.** Without `LOG_LEVEL`, `info`/`warn` logs are dropped in all environments, including development.
10. **`@iha/logger` and `@iha/notifications` are not in `transpilePackages`.** They are consumed as raw TypeScript via `@iha/db`; this works today but is worth keeping in mind if bundling errors appear.
11. **Unused exports.** No app consumers found for `Badge`, `ScrollArea`, `getStatusLabel`, `DOCUMENT_TYPE_LABELS`, `submittedDocumentSchema`, `caseSubmissionSchema`, `profileSetupSchema`, `patientProfileSchema`, `paymentInitiationSchema`, `treatmentPlanReviewSchema` (some are kept for backwards compatibility).
12. **Incomplete subpath exports.** `@iha/validations` exposes subpaths for some modules only; `visa`, `treatment-plan`, `case-assignment`, `case-note`, `chat`, `provider-message` are reachable only through the root barrel.
13. **`.mcp.json` project ref.** It points at Supabase project `ddrxwznlmnuudcgoultd`; verify this is the intended project, as local development notes reference a different hosted project ref.
14. **Root `format` script** runs Prettier over `**/*` without a `.prettierignore` at the root; it may touch generated files such as `packages/db/types/database.types.ts`.
