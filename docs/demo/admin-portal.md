# Admin portal

**For:** MTA staff who coordinate everything.
**Promise:** one view of the whole business: quality control, cases, money and compliance.
**Demo login:** `admin@demo.local` / `Demo1234`.

Nobody can sign up as an admin. Existing staff add new staff.

## What MTA does here

| Area | Page | What happens |
|---|---|---|
| Overview | Dashboard | Money, case pipeline, doctor performance, what needs a nudge, compliance alerts |
| Quality | Doctor, Hospital and Lawyer Approvals | Record register checks, then approve, reject or ask for more |
| Cases | Cases | Invite doctors, follow progress, close a case, mark it completed |
| Plans | Treatment Plans | Review the plan, set the service fee, publish or decline |
| Visas | Visa Cases | Assign or reassign a lawyer |
| Support | Messages | One live inbox for patients and providers |
| Money | Payments | All payments, full or partial refunds, credit notes, CSV export |
| People | Users | Find any account, send a reset, suspend, add staff |
| Accountability | Audit Log | Read-only history of who did what |
| Rules | Settings | Fees with change history, business and GST details, privacy and retention |

## What to show

| # | Where | Do | Say |
|---|---|---|---|
| 1 | Dashboard | Walk the hero, tiles and pipeline | "Live records only, no estimates" |
| 2 | Needs a nudge | Show the alerts | "Lapsing licences and unanswered invitations surface by themselves" |
| 3 | Doctor Approvals | Open Dr. Olivia Grant, show Register checks | "Approve is locked until the check passes" |
| 4 | Same page | **Record check**, then **Approve** | "Who checked what and when is kept" |
| 5 | Treatment Plans | Open one, show the fee, **Approve and send to patient** | "Nothing reaches a patient without MTA's review" |
| 6 | Messages | Keep it open while the patient sends a message | "Messages arrive live" |
| 7 | Payments | Open a payment, show **Refund** without confirming | "The dialog shows what goes back before you confirm" |
| 8 | Users | Open a peer doctor, **Suspend**, then **Reactivate** | "Takes effect instantly, even on an open session" |
| 9 | Audit Log | Search `user.suspended` | "Every sensitive action is on record" |
| 10 | Settings | Change a fee, show the history | "Fees are settings, not code" |

**Before step 6:** an MTA admin has to open a conversation first, and the patient can then reply.

## Questions you may get

| Question | Answer |
|---|---|
| Can staff have limited access? | Not yet. Every admin has full access, so only add people you'd trust with everything. |
| Can a closed case be reopened? | No, closing is final. |
| Does closing a case refund the patient? | No. Refunds are a separate decision under Payments. |
| What does a suspended person see? | They're signed out at once and told to contact MTA. Their records stay as they are. |
| Who sees the reason for suspending or closing? | MTA staff only. |
| Can the audit log be edited? | Not from the portal. It's read-only. |
| Does a refund keep the card fee? | Only for reasons on the payer's side, and an admin can waive it. |

## Simulated in this demo

Refunds settle instantly with the simulated provider. Register checks are recorded by staff, as they will be in production.
