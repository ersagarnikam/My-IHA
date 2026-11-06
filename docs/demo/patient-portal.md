# Patient portal

**For:** international patients seeking treatment in Australia.
**Promise:** one place for the whole journey, from first enquiry to the visa.
**Demo login:** `patient@demo.local` / `Demo1234`. **Language:** English and Chinese.

## The journey

1. **Sign up:** name, email, password, and two consents (terms; sharing health information with the people arranging treatment).
2. **Verify email:** a 6-digit code.
3. **Complete profile:** personal details, medical background, emergency contact. Required before anything else.
4. **Submit a case:** specialty, description, reports (PDF, JPG or PNG up to 10 MB).
5. **Evaluation:** upload anything the doctor asks for.
6. **Initial consultation:** choose one of the doctor's times, pay AUD 200, join on Zoom.
7. **Compare treatment plans:** doctor, hospital, procedure, timeline, recovery, full costs.
8. **Choose and pay:** get an invoice straight away.
9. **Hospital letters:** the invitation and appointment letters arrive.
10. **Visa application:** an 8-step wizard with document uploads.
11. **Visa decision:** download the approved visa.
12. **Treatment:** the doctor marks the case completed.

## What to show

| # | Where | Do | Say |
|---|---|---|---|
| 1 | Dashboard | Point to the journey progress and next action | "Patients never wonder what happens next" |
| 2 | Top bar | Switch to Chinese and back | "Built for international patients from the start" |
| 3 | Case Management | Open a case, scroll to the timeline | "Every step is recorded in one place" |
| 4 | Treatment | Open a plan's cost breakdown | "Costs are itemised before anyone commits" |
| 5 | Payments | Download an invoice PDF | "Real invoices, ready for GST" |
| 6 | Visa & Travel | Open the visa application | "The visa is guided, not left to the patient" |
| 7 | Messages | Show the support chat | "A coordinator is always reachable" |
| 8 | Account & Settings | Show email/SMS preferences | "Patients control how they hear from us" |

**Try sign-up live** at `/register`. The code appears in the [local mailbox](http://localhost:8025).

## Questions you may get

| Question | Answer |
|---|---|
| Can a patient contact a doctor directly? | No. Doctors and patients meet through the consultation, and support runs through MTA. |
| Who sees my medical records? | The doctors invited to the case, the chosen hospital (clinical details, no contact details), the assigned visa lawyer (the visa-related details) and MTA. |
| Can I delete my account? | Yes, under Settings. There's a 30-day grace period, then login details are erased. Medical and payment records are kept for the retention period, 7 years by default. |
| Is my data encrypted? | Sensitive fields are encrypted in the database, and files are only served after an ownership check. |
| Can I get a refund? | MTA can refund in full or in part. Whether the card fee is kept depends on the reason. |

## Simulated in this demo

**Pay Now** stands in for a card form, and consultations have no Zoom link.
