# Backend guide (`backend/`)

Java 21 · Spring Boot 4.1 · Spring Security (OAuth2 resource server, HS256 JWT) · Spring Data JPA (Hibernate 7) · Flyway · H2 (dev) / PostgreSQL (prod) · Jackson 3 · Stripe Java · PDFBox · libphonenumber.

## Layout

Packages are by **feature** under `com.iha`:

| Package | Responsibility |
|---|---|
| `auth` | Accounts, passwords, verification codes, login, JWT issuing (`TokenService`), `CurrentUser`. |
| `patient` | Patient profile, onboarding, avatar, account deletion and retention job. |
| `cases` | Cases, case documents, the case status machine (`CaseStatusService`). |
| `documents` | The patient's documents page (medical + visa documents together). |
| `treatment` | Treatment plans (entity), published treatment options, option selection. |
| `consultation` | Online consultations: request, slots, selection, scheduling with Zoom. |
| `payment` | Payment gateway (Stripe/fake), checkout, webhook, saved cards, invoices. |
| `visa` | Visa application wizard, documents, lawyer document requests. |
| `chat` | Patient ↔ MTA coordinator chat. |
| `doctor` | The doctor portal: registration, approval gate, assigned cases, plan authoring, consultations, fees, settings; `DoctorAdminService` for admin-side steps. |
| `provider` | Provider entities shared by modules: `Doctor`, `Hospital`, `Lawyer`, `DoctorCaseAssignment`, `DoctorHospitalAffiliation`. |
| `providerchat` | Provider (doctor/hospital/lawyer) ↔ MTA admin chat. |
| `admin` | The admin portal API: `AdminService` (overview, doctors, cases, plans), `AdminController`, `AdminChatController` (patient and provider inboxes), `AdminBootstrap` (first admin from `IHA_ADMIN_EMAIL`/`IHA_ADMIN_PASSWORD`). Decisions go through `DoctorAdminService`, `ChatService` and `ProviderMessageService`. |
| `notification` | In-portal notifications, email/SMS alert dispatch, alert preferences. |
| `realtime` | Server-sent events hub and endpoint. |
| `dashboard` | Patient dashboard summary. |
| `specialty` | Medical specialty reference list. |
| `storage` | File storage abstraction, upload validation, file-type detection. |
| `crypto` | AES-GCM cipher and JPA converters for encrypted columns. |
| `audit` | Audit log writer. |
| `zoom` | Zoom Server-to-Server OAuth client for consultation meetings. |
| `config` | Security configuration, CORS. |
| `common` | `ApiException`, `FieldValidationException`, global error handler, validators (`@PhoneNumber`, `@StrongPassword`). |
| `dev` | **Dev profile only**: demo data seeder and simulation endpoints. |

Resources: `application.yml` (shared), `application-dev.yml`, `application-prod.yml`, `db/migration/V1…V4`.

## Conventions

### Controllers and services

- Controllers are thin: they read `CurrentUser.from(jwt)`, validate a request **record** (`@Valid`), call one service method and map the result to a response **record** declared inside the controller.
- Services hold rules and `@Transactional`. A service method is the unit that must be atomic (e.g. "submit plan" saves the plan, marks the assignment and notifies the hospital together).
- Every role-scoped method starts from the caller's own row: `PatientService.requireCurrent(user)`, `DoctorAccountService.requireActive(user)` (approved + fee paid) or `requireCurrent(user)` (any registered doctor, for the gate pages).
- Return **404** for records that exist but aren't the caller's.

### Errors

```java
throw ApiException.conflict("invalid_transition", "This case is no longer in the right stage for that action.");
throw new FieldValidationException(Map.of("diagnosis", "Diagnosis must be at least 10 characters"));
```

`code` values are stable and the web app may branch on them; messages are shown to users. Bean Validation failures on request records become `validation_failed` with `fieldErrors` automatically.

### Case status

Only `CaseStatusService.transition(case, allowedFrom, to, alert)` changes a case's status. It enforces the allowed previous states, saves, and writes the patient's notification with the exact title/message of the old trigger (the patient timeline depends on them). It must run inside a transaction.

### Events instead of cross-module calls

When module A must react to something in module B and a direct call would create a dependency cycle, B publishes an event record and A has an `@EventListener` (same transaction) or `@TransactionalEventListener` (after commit). See the event table in [Architecture](architecture.md#events-between-modules).

### Encrypted columns

```java
@Convert(converter = EncryptedStringConverter.class)
@Column(name = "diagnosis_enc")
private String diagnosis;
```

Converters exist for `String`, `List<String>`, `LocalDate` and `BigDecimal`. Never log these values; audit entries record only that something changed.

### Uploads

```java
Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS);
storage.store(path, new ByteArrayInputStream(upload.content()));
```

`validate` checks size and detects the type from the bytes. Serve files only through an endpoint that checks ownership first (`PatientDocumentController.file(...)` builds the response).

### Notifications

```java
notifications.notify(userId, type, title, message, caseId);           // in-portal only
notifications.notifyWithAlert(userId, type, title, message, caseId);  // + email/SMS per preferences
```

Port wording verbatim when replacing an old trigger.

### Audit

```java
audit.record(user.id(), user.email(), "doctor", "treatment_plan.submitted", "treatment_plan", plan.getId(),
        Map.of("case_id", caseId.toString()));
```

### Database migrations

- Flyway, append-only: the next file is `V6__<description>.sql`.
- SQL must run on **both** H2 (PostgreSQL mode) and PostgreSQL: ids are UUIDs generated in Java (no `gen_random_uuid()`), use `varchar` not `text`, arrays have no defaults.
- Entities are validated against the schema at startup (`ddl-auto: validate`), so a mismatch fails fast.

### Repositories

One Spring Data repository interface per file (nested interfaces are ignored). Use `@Lock(PESSIMISTIC_WRITE)` for get-or-create rows that must not be duplicated (pending payments).

## Configuration

All settings are under `iha.*` in `application.yml`; secrets come from environment variables. See [Deployment](deployment.md#environment-variables) for the full list.

| Profile | Database | Payments | Extras |
|---|---|---|---|
| `dev` (default) | In-memory H2 | Simulated | H2 console, verification codes logged, demo data, `/api/dev/**` |
| `prod` | PostgreSQL (`DATABASE_URL`) | Stripe | Nothing dev-only is loaded |

## Adding a feature (checklist)

1. Migration `V6__….sql` if the schema changes (portable SQL).
2. Entity + repository (own file) in the feature package.
3. Service with the rules, ownership checks, notifications, audit entry and status transitions.
4. Controller under the right role prefix (`/api/<role>/…`) with request/response records.
5. A MockMvc journey test, or extend an existing one.
6. Document the endpoint in [API reference](api-reference.md).
