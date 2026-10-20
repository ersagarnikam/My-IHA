// Pure constant, deliberately free of any server-only import (no `./server`,
// no `next/headers`) so Client Components (e.g. the visa status-change
// dialog) can import it without dragging server code into the client bundle.
// visa.ts re-exports this for server-side callers that already import from
// '@iha/db/visa'.
// under_review only offers 'processing' as its next step (not
// 'application_submitted' too) — both statuses render as the same
// "In Progress" label (see getVisaStatusLabel), so offering both produced
// two identical-looking dropdown options. 'application_submitted' is kept
// as a legacy source state only; nothing sets it as a target anymore.
export const VISA_STATUS_TRANSITIONS: Record<string, string[]> = {
  documents_submitted: ['under_review'],
  under_review: ['processing'],
  additional_docs_requested: ['under_review', 'processing'],
  application_submitted: ['processing', 'approved', 'rejected'],
  processing: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}
