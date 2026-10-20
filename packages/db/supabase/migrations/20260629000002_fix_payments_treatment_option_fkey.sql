-- payments.treatment_option_id had no ON DELETE action, defaulting to NO
-- ACTION. This blocked the patient hard-delete cascade: deleting a case's
-- treatment_options rows (via cases -> treatment_options cascade) failed
-- with "still referenced from table payments", even though payments itself
-- is already removed by the same statement via its case_id/patient_id
-- cascades. SET NULL (not CASCADE) keeps payment records intact if a
-- treatment_option is removed independently of patient deletion.

alter table public.payments
  drop constraint payments_treatment_option_id_fkey;

alter table public.payments
  add constraint payments_treatment_option_id_fkey
  foreign key (treatment_option_id) references public.treatment_options(id)
  on delete set null;
