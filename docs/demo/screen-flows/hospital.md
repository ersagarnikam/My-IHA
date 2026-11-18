# Hospital portal: screen flow

Partner hospitals see patients whose treatment plan names them and send the two visa letters. Shown as `hospital@demo.local` (St Vincent’s Hospital Sydney), plus a new sign-up and `pending.hospital@demo.local` for the joining screens. For the fee screen the hospital fees were set to AUD 500 (registration) and AUD 300 (annual); in the demo they start at $0, which means no charge. English only.

Screens appear in the order a user meets them. Captured from the local dev environment with demo data at 1440 × 900 (full page). Developer-only test buttons are hidden; payment screens still say that payments are simulated. Regenerate with `e2e/screen-flows.mjs` (see [README](README.md)).

## Contents


**Joining**

1. [Hospital sign-up](#1-hospital-sign-up)
2. [Registration wizard](#2-registration-wizard)
3. [Waiting for approval](#3-waiting-for-approval)
4. [Registration fee](#4-registration-fee)

**Everyday screens**

5. [Dashboard](#5-dashboard)
6. [Cases](#6-cases)
7. [Case details](#7-case-details)
8. [Patients](#8-patients)
9. [Patient details](#9-patient-details)
10. [Doctors](#10-doctors)
11. [Doctor details](#11-doctor-details)
12. [Documents](#12-documents)

**Support and account**

13. [Messages](#13-messages)
14. [Notifications](#14-notifications)
15. [Account & Settings: Hospital profile](#15-account-settings-hospital-profile)
16. [Account & Settings: Billing](#16-account-settings-billing)
17. [Account & Settings: Security](#17-account-settings-security)
18. [Account & Settings: Notifications](#18-account-settings-notifications)

## Joining

### 1. Hospital sign-up

`/register/hospital`: Email, password and the terms.

![Hospital sign-up](hospital/01-hospital-sign-up.jpg)

### 2. Registration wizard

`/hospital/register`: Hospital details, accreditation and documents.

![Registration wizard](hospital/02-registration-wizard.jpg)

### 3. Waiting for approval

`/hospital/pending-approval`: MTA checks the hospital’s registration and approves, rejects or asks for more information.

![Waiting for approval](hospital/03-waiting-for-approval.jpg)

### 4. Registration fee

`/hospital/registration-fee`: Only when MTA has set a registration fee above $0: the portal opens once it is paid by card.

![Registration fee](hospital/04-registration-fee.jpg)

## Everyday screens

### 5. Dashboard

`/hospital/dashboard`: Incoming patients and the letters still to send. An overdue annual fee shows a reminder here.

![Dashboard](hospital/05-dashboard.jpg)

### 6. Cases

`/hospital/cases`: Cases whose plan names the hospital, by stage.

![Cases](hospital/06-cases.jpg)

### 7. Case details

`/hospital/cases/{id}`: The plan, the patient and the two visa letters: generate the PDF and send it to the patient.

![Case details](hospital/07-case-details.jpg)

### 8. Patients

`/hospital/patients`: Everyone coming to the hospital.

![Patients](hospital/08-patients.jpg)

### 9. Patient details

`/hospital/patients/{id}`: One patient’s cases at the hospital.

![Patient details](hospital/09-patient-details.jpg)

### 10. Doctors

`/hospital/doctors`: Doctors affiliated with the hospital.

![Doctors](hospital/10-doctors.jpg)

### 11. Doctor details

`/hospital/doctors/{id}`: One doctor and their cases at the hospital.

![Doctor details](hospital/11-doctor-details.jpg)

### 12. Documents

`/hospital/documents`: Letters waiting to be sent, and every letter sent.

![Documents](hospital/12-documents.jpg)

## Support and account

### 13. Messages

`/hospital/messages`: Chat with MTA.

![Messages](hospital/13-messages.jpg)

### 14. Notifications

`/hospital/notifications`: New patients, payments and fee reminders.

![Notifications](hospital/14-notifications.jpg)

### 15. Account & Settings: Hospital profile

`/hospital/account-settings?tab=profile`: Details, time zone and documents.

![Account & Settings: Hospital profile](hospital/15-account-settings-hospital-profile.jpg)

### 16. Account & Settings: Billing

`/hospital/account-settings?tab=billing`: Registration and annual membership fees, with invoices.

![Account & Settings: Billing](hospital/16-account-settings-billing.jpg)

### 17. Account & Settings: Security

`/hospital/account-settings?tab=security`: Change password.

![Account & Settings: Security](hospital/17-account-settings-security.jpg)

### 18. Account & Settings: Notifications

`/hospital/account-settings?tab=notifications`: Email and SMS preferences.

![Account & Settings: Notifications](hospital/18-account-settings-notifications.jpg)
