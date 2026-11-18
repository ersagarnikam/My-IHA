# Admin portal: screen flow

MTA staff approve providers, run cases, review plans, handle money and keep the audit trail. Shown as `admin@demo.local`, after the doctor, hospital and lawyer approvals in the other flows.

Screens appear in the order a user meets them. Captured from the local dev environment with demo data at 1440 × 900 (full page). Developer-only test buttons are hidden; payment screens still say that payments are simulated. Regenerate with `e2e/screen-flows.mjs` (see [README](README.md)).

## Contents


**Overview**

1. [Dashboard](#1-dashboard)

**Providers**

2. [Doctor approvals](#2-doctor-approvals)
3. [Doctor details](#3-doctor-details)
4. [Hospital approvals](#4-hospital-approvals)
5. [Hospital details (fee unpaid)](#5-hospital-details-fee-unpaid)
6. [Lawyer approvals](#6-lawyer-approvals)
7. [Lawyer details](#7-lawyer-details)

**Cases**

8. [Cases](#8-cases)
9. [Case details](#9-case-details)
10. [Plan review](#10-plan-review)
11. [Plan details](#11-plan-details)
12. [Visa cases](#12-visa-cases)
13. [Messages](#13-messages)

**Money**

14. [Payments](#14-payments)
15. [Payment details](#15-payment-details)
16. [Settings](#16-settings)

**People and compliance**

17. [Users](#17-users)
18. [User details](#18-user-details)
19. [Audit log](#19-audit-log)
20. [My Account](#20-my-account)

## Overview

### 1. Dashboard

`/admin/dashboard`: Live figures: cases, approvals waiting, revenue including membership fees.

![Dashboard](admin/01-dashboard.jpg)

## Providers

### 2. Doctor approvals

`/admin/doctors`: Doctors by approval status.

![Doctor approvals](admin/02-doctor-approvals.jpg)

### 3. Doctor details

`/admin/doctors/{id}`: Profile, register checks, approval decision and performance.

![Doctor details](admin/03-doctor-details.jpg)

### 4. Hospital approvals

`/admin/hospitals`: Hospitals by approval status.

![Hospital approvals](admin/04-hospital-approvals.jpg)

### 5. Hospital details (fee unpaid)

`/admin/hospitals/{id}`: Register checks and the **Membership** line: this hospital was just approved and has not paid its registration fee, so its portal is locked.

![Hospital details (fee unpaid)](admin/05-hospital-details-fee-unpaid.jpg)

### 6. Lawyer approvals

`/admin/lawyers`: Lawyers by approval status.

![Lawyer approvals](admin/06-lawyer-approvals.jpg)

### 7. Lawyer details

`/admin/lawyers/{id}`: Credential, register checks and membership.

![Lawyer details](admin/07-lawyer-details.jpg)

## Cases

### 8. Cases

`/admin/cases`: Every case by stage.

![Cases](admin/08-cases.jpg)

### 9. Case details

`/admin/cases/{id}`: Assign doctors, follow the timeline, close or complete the case.

![Case details](admin/09-case-details.jpg)

### 10. Plan review

`/admin/plans`: Treatment plans waiting for MTA.

![Plan review](admin/10-plan-review.jpg)

### 11. Plan details

`/admin/plans/{id}`: Publish the plan to the patient or decline it with a reason.

![Plan details](admin/11-plan-details.jpg)

### 12. Visa cases

`/admin/visa-cases`: Visa applications and their assigned lawyer.

![Visa cases](admin/12-visa-cases.jpg)

### 13. Messages

`/admin/messages`: The live inbox: chats with patients and providers.

![Messages](admin/13-messages.jpg)

## Money

### 14. Payments

`/admin/payments`: Every payment: patients, doctors, hospitals and lawyers. CSV export.

![Payments](admin/14-payments.jpg)

### 15. Payment details

`/admin/payments/patient/{id}`: Full or partial refunds, with the card processing fee kept only for certain reasons, and credit notes.

![Payment details](admin/15-payment-details.jpg)

### 16. Settings

`/admin/settings`: Platform fees with change history, business details for invoices and GST, privacy retention.

![Settings](admin/16-settings.jpg)

## People and compliance

### 17. Users

`/admin/users`: Every account; suspend or restore, add staff.

![Users](admin/17-users.jpg)

### 18. User details

`/admin/users/{id}`: One account, its role and history.

![User details](admin/18-user-details.jpg)

### 19. Audit log

`/admin/audit`: Who did what and when. Encrypted values are never shown.

![Audit log](admin/19-audit-log.jpg)

### 20. My Account

`/admin/account`: The staff member’s own password and details.

![My Account](admin/20-my-account.jpg)
