# Patient portal: screen flow

International patients submit a case, meet the doctor on Zoom, compare treatment plans, pay, and apply for their medical treatment visa. Shown as `patient@demo.local`, whose cases sit at different stages, plus a brand-new sign-up for the first screens.

Screens appear in the order a user meets them. Captured from the local dev environment with demo data at 1440 × 900 (full page). Developer-only test buttons are hidden; payment screens still say that payments are simulated. Regenerate with `e2e/screen-flows.mjs` (see [README](README.md)).

## Contents


**Joining**

1. [Sign in](#1-sign-in)
2. [Create an account](#2-create-an-account)
3. [Verify email](#3-verify-email)
4. [Complete profile](#4-complete-profile)

**Everyday screens**

5. [Dashboard](#5-dashboard)
6. [Case Management](#6-case-management)
7. [Submit a new case](#7-submit-a-new-case)

**One case, step by step**

8. [Case under review](#8-case-under-review)
9. [Case in evaluation](#9-case-in-evaluation)
10. [Treatment plans](#10-treatment-plans)
11. [Case after payment](#11-case-after-payment)
12. [Payments](#12-payments)
13. [Visa & Travel: travel](#13-visa-travel-travel)
14. [Visa & Travel: visa](#14-visa-travel-visa)
15. [Visa application](#15-visa-application)
16. [Case with visa submitted](#16-case-with-visa-submitted)
17. [Completed case](#17-completed-case)

**Support and account**

18. [Documents](#18-documents)
19. [Messages](#19-messages)
20. [Notifications](#20-notifications)
21. [Profile: personal information](#21-profile-personal-information)
22. [Profile: notifications](#22-profile-notifications)
23. [Profile: payment](#23-profile-payment)
24. [Profile: security](#24-profile-security)
25. [Profile: delete account](#25-profile-delete-account)

## Joining

### 1. Sign in

`/login`: The shared sign-in page for every portal. The website links here.

![Sign in](patient/01-sign-in.jpg)

### 2. Create an account

`/register`: Name, email and password, plus the two consents: the terms, and sharing health information with the people arranging treatment.

![Create an account](patient/02-create-an-account.jpg)

### 3. Verify email

`/verify?email=…`: A 6-digit code arrives by email. The patient can ask for a new one.

![Verify email](patient/03-verify-email.jpg)

### 4. Complete profile

`/patient/profile/setup`: Personal details, medical background and emergency contact. Required before anything else.

![Complete profile](patient/04-complete-profile.jpg)

## Everyday screens

### 5. Dashboard

`/patient/dashboard`: Journey progress and the next action for each case.

![Dashboard](patient/05-dashboard.jpg)

### 6. Case Management

`/patient/cases`: Every case with its status.

![Case Management](patient/06-case-management.jpg)

### 7. Submit a new case

`/patient/cases/new`: Specialty, description and medical reports (PDF, JPG or PNG up to 10 MB).

![Submit a new case](patient/07-submit-a-new-case.jpg)

## One case, step by step

### 8. Case under review

`/patient/cases/{id}`: MTA is matching the case with doctors.

![Case under review](patient/08-case-under-review.jpg)

### 9. Case in evaluation

`/patient/cases/{id}`: The doctor reviews the case. The patient uploads anything requested and books the initial Zoom consultation (AUD 200).

![Case in evaluation](patient/09-case-in-evaluation.jpg)

### 10. Treatment plans

`/patient/treatments`: Published plans side by side: doctor, hospital, procedure, timeline, recovery and full costs.

![Treatment plans](patient/10-treatment-plans.jpg)

### 11. Case after payment

`/patient/cases/{id}`: The plan is paid. The hospital now sends the invitation and appointment letters.

![Case after payment](patient/11-case-after-payment.jpg)

### 12. Payments

`/patient/payments`: Every payment with a PDF invoice, and any refunds.

![Payments](patient/12-payments.jpg)

### 13. Visa & Travel: travel

`/patient/visa-travel`: Travel details for the treatment trip.

![Visa & Travel: travel](patient/13-visa-travel-travel.jpg)

### 14. Visa & Travel: visa

`/patient/visa-travel?tab=visa`: Visa applications for each case. The application opens once both hospital letters have arrived.

![Visa & Travel: visa](patient/14-visa-travel-visa.jpg)

### 15. Visa application

`/patient/visa-travel/{id}`: The submitted application, its documents and the lawyer’s progress. The approved visa is downloaded here.

![Visa application](patient/15-visa-application.jpg)

### 16. Case with visa submitted

`/patient/cases/{id}`: The case timeline records every step.

![Case with visa submitted](patient/16-case-with-visa-submitted.jpg)

### 17. Completed case

`/patient/cases/{id}`: The doctor marked the treatment completed.

![Completed case](patient/17-completed-case.jpg)

## Support and account

### 18. Documents

`/patient/documents`: Every file across the patient’s cases.

![Documents](patient/18-documents.jpg)

### 19. Messages

`/patient/messages`: Support chat with the MTA coordinator.

![Messages](patient/19-messages.jpg)

### 20. Notifications

`/patient/notifications`: Everything that happened on the patient’s cases.

![Notifications](patient/20-notifications.jpg)

### 21. Profile: personal information

`/patient/profile`: Personal and medical details.

![Profile: personal information](patient/21-profile-personal-information.jpg)

### 22. Profile: notifications

`/patient/profile?tab=notifications`: Email and SMS preferences.

![Profile: notifications](patient/22-profile-notifications.jpg)

### 23. Profile: payment

`/patient/profile?tab=payment`: Payment preferences.

![Profile: payment](patient/23-profile-payment.jpg)

### 24. Profile: security

`/patient/profile?tab=security`: Change password.

![Profile: security](patient/24-profile-security.jpg)

### 25. Profile: delete account

`/patient/profile?tab=deleteAccount`: Close the account. Records are kept for the legal retention period, then purged.

![Profile: delete account](patient/25-profile-delete-account.jpg)
