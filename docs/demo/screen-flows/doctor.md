# Doctor portal: screen flow

Australian specialists evaluate cases, hold an initial Zoom consultation and write treatment plans. Shown as `doctor@demo.local` (Dr. Amelia Chen), plus a new sign-up and `pending.doctor@demo.local` for the joining screens. English only.

Screens appear in the order a user meets them. Captured from the local dev environment with demo data at 1440 × 900 (full page). Developer-only test buttons are hidden; payment screens still say that payments are simulated. Regenerate with `e2e/screen-flows.mjs` (see [README](README.md)).

## Contents


**Joining**

1. [Doctor sign-up](#1-doctor-sign-up)
2. [Registration wizard](#2-registration-wizard)
3. [Waiting for approval](#3-waiting-for-approval)
4. [Registration fee](#4-registration-fee)

**Everyday screens**

5. [Dashboard](#5-dashboard)
6. [My Cases](#6-my-cases)

**One case, step by step**

7. [New invitation](#7-new-invitation)
8. [Case in evaluation](#8-case-in-evaluation)
9. [Build treatment plan](#9-build-treatment-plan)
10. [Completed case](#10-completed-case)
11. [Consultations](#11-consultations)
12. [Consultation details](#12-consultation-details)

**Support and account**

13. [Messages](#13-messages)
14. [Notifications](#14-notifications)
15. [Account & Settings: Profile](#15-account-settings-profile)
16. [Account & Settings: Availability](#16-account-settings-availability)
17. [Account & Settings: Indemnity](#17-account-settings-indemnity)
18. [Account & Settings: Billing](#18-account-settings-billing)
19. [Account & Settings: Invoices](#19-account-settings-invoices)
20. [Account & Settings: Security](#20-account-settings-security)
21. [Account & Settings: Notifications](#21-account-settings-notifications)

## Joining

### 1. Doctor sign-up

`/register/doctor`: Email, password and the terms.

![Doctor sign-up](doctor/01-doctor-sign-up.jpg)

### 2. Registration wizard

`/doctor/register`: Four steps: details, qualifications and AHPRA number, hospitals and availability, documents.

![Registration wizard](doctor/02-registration-wizard.jpg)

### 3. Waiting for approval

`/doctor/pending-approval`: MTA checks the AHPRA register and approves, rejects or asks for more information.

![Waiting for approval](doctor/03-waiting-for-approval.jpg)

### 4. Registration fee

`/doctor/registration-fee`: After approval the doctor pays the one-time registration fee (set by MTA) to open the portal.

![Registration fee](doctor/04-registration-fee.jpg)

## Everyday screens

### 5. Dashboard

`/doctor/dashboard`: Return on membership, actions for today, funnel, decline reasons, anonymous price benchmark and earnings. Every figure comes from real records; planned features show a **Soon** chip.

![Dashboard](doctor/05-dashboard.jpg)

### 6. My Cases

`/doctor/cases`: Invitations and cases by stage.

![My Cases](doctor/06-my-cases.jpg)

## One case, step by step

### 7. New invitation

`/doctor/cases/{id}`: Accept or decline, with a 48-hour response target.

![New invitation](doctor/07-new-invitation.jpg)

### 8. Case in evaluation

`/doctor/cases/{id}`: History and documents, document requests, and the initial consultation card where the doctor offers up to three times in their own time zone.

![Case in evaluation](doctor/08-case-in-evaluation.jpg)

### 9. Build treatment plan

`/doctor/cases/{id}/treatment-plan`: Diagnosis, procedure, timeline, hospital and costs. Submission stays locked until the consultation has happened or is skipped with a reason.

![Build treatment plan](doctor/09-build-treatment-plan.jpg)

### 10. Completed case

`/doctor/cases/{id}`: A treated, paid case.

![Completed case](doctor/10-completed-case.jpg)

### 11. Consultations

`/doctor/consultations`: Every consultation by status.

![Consultations](doctor/11-consultations.jpg)

### 12. Consultation details

`/doctor/consultations/{id}`: Time in the doctor’s zone and the patient’s, the Zoom link and the case.

![Consultation details](doctor/12-consultation-details.jpg)

## Support and account

### 13. Messages

`/doctor/messages`: Chat with MTA.

![Messages](doctor/13-messages.jpg)

### 14. Notifications

`/doctor/notifications`: Invitations, payments and plan decisions.

![Notifications](doctor/14-notifications.jpg)

### 15. Account & Settings: Profile

`/doctor/account-settings?tab=profile`: Public details, specialties and time zone.

![Account & Settings: Profile](doctor/15-account-settings-profile.jpg)

### 16. Account & Settings: Availability

`/doctor/account-settings?tab=availability`: When the doctor can see patients.

![Account & Settings: Availability](doctor/16-account-settings-availability.jpg)

### 17. Account & Settings: Indemnity

`/doctor/account-settings?tab=indemnity`: The professional indemnity declaration, needed before offering consultation times.

![Account & Settings: Indemnity](doctor/17-account-settings-indemnity.jpg)

### 18. Account & Settings: Billing

`/doctor/account-settings?tab=billing`: Membership status and the annual renewal.

![Account & Settings: Billing](doctor/18-account-settings-billing.jpg)

### 19. Account & Settings: Invoices

`/doctor/account-settings?tab=invoices`: Fee invoices as PDFs.

![Account & Settings: Invoices](doctor/19-account-settings-invoices.jpg)

### 20. Account & Settings: Security

`/doctor/account-settings?tab=security`: Change password.

![Account & Settings: Security](doctor/20-account-settings-security.jpg)

### 21. Account & Settings: Notifications

`/doctor/account-settings?tab=notifications`: Email and SMS preferences.

![Account & Settings: Notifications](doctor/21-account-settings-notifications.jpg)
