-- ─────────────────────────────────────────────────────────
-- Remove document review (Accept/Insufficient/Missing) — dropped from scope
-- after 20260826030000_add_lawyer_document_review_requests.sql was already
-- applied. Document requests (visa_document_requests, request_visa_document)
-- stay; only the review_status side of that migration is reverted.
-- ─────────────────────────────────────────────────────────

drop function if exists public.review_visa_document(uuid, text);

alter table public.visa_documents
  drop column if exists review_status,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by;
