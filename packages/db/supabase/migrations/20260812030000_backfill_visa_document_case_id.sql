-- insertVisaDocument (the "Add documents" panel on the individual visa case
-- page) never set case_id, even though the caller always has it — only
-- visa_submission_id was recorded. That's invisible on that page itself
-- (it's already scoped to one case), but it means any document added there
-- shows up as "unlinked" on the Documents page's Visa tab, which joins on
-- case_id directly. Fixed at the insert site; this backfills existing rows
-- via their visa_submission's case_id (visa_submissions.case_id is unique
-- per case, so the join is unambiguous).
update public.visa_documents vd
set case_id = vs.case_id
from public.visa_submissions vs
where vd.visa_submission_id = vs.id
  and vd.case_id is null;
