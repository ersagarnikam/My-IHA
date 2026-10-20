-- Admin portal: MTA can send a submitted treatment plan back with a reason the doctor sees.
alter table treatment_plans add column rejection_reason varchar;
