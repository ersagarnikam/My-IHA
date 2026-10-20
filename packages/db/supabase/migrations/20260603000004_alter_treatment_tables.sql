-- ─────────────────────────────────────────────────────────
-- Extend doctors with profile data
-- ─────────────────────────────────────────────────────────
alter table public.doctors
  add column if not exists education                    text,
  add column if not exists years_experience             int,
  add column if not exists international_patients_count int;

-- ─────────────────────────────────────────────────────────
-- Extend hospitals with profile data
-- ─────────────────────────────────────────────────────────
alter table public.hospitals
  add column if not exists bed_count        int,
  add column if not exists years_experience int,
  add column if not exists specialties      text[];

-- ─────────────────────────────────────────────────────────
-- Extend treatment_options with detailed treatment fields
-- ─────────────────────────────────────────────────────────
alter table public.treatment_options
  add column if not exists diagnosis             text,
  add column if not exists recommended_treatment text,
  add column if not exists procedure_name        text,
  add column if not exists description           text,
  add column if not exists expected_outcome      text,
  add column if not exists recovery_time         text,
  add column if not exists treatment_duration    text,
  add column if not exists hospital_stay         text,
  add column if not exists technique             text,
  add column if not exists success_rate          text,
  add column if not exists aftercare             text[];

-- ─────────────────────────────────────────────────────────
-- Seed: update hospitals with profile data
-- ─────────────────────────────────────────────────────────
update public.hospitals set
  bed_count = 550, years_experience = 35,
  specialties = ARRAY['Cardiology', 'Oncology', 'Orthopaedics', 'Neurology']
where id = 'a1b2c3d4-1111-1111-1111-000000000001';

update public.hospitals set
  bed_count = 580, years_experience = 30,
  specialties = ARRAY['Orthopaedics', 'Cardiology', 'Gastroenterology', 'Oncology']
where id = 'a1b2c3d4-1111-1111-1111-000000000002';

update public.hospitals set
  bed_count = 300, years_experience = 28,
  specialties = ARRAY['Neurology', 'Cardiology', 'Orthopaedics', 'Oncology']
where id = 'a1b2c3d4-1111-1111-1111-000000000003';

update public.hospitals set
  bed_count = 400, years_experience = 25,
  specialties = ARRAY['Oncology', 'Cardiology', 'Organ Transplant', 'Neurology']
where id = 'a1b2c3d4-1111-1111-1111-000000000004';

update public.hospitals set
  bed_count = 345, years_experience = 40,
  specialties = ARRAY['Gastroenterology', 'Cardiology', 'Oncology', 'Neurology']
where id = 'a1b2c3d4-1111-1111-1111-000000000005';

-- ─────────────────────────────────────────────────────────
-- Seed: update doctors with profile data
-- ─────────────────────────────────────────────────────────
update public.doctors set
  education = 'AIIMS New Delhi, 1995',
  years_experience = 25,
  international_patients_count = 18000
where id = 'b1c2d3e4-1111-1111-1111-000000000001';

update public.doctors set
  education = 'Mahidol University, 2000',
  years_experience = 20,
  international_patients_count = 12000
where id = 'b1c2d3e4-1111-1111-1111-000000000002';

update public.doctors set
  education = 'AIIMS Mumbai, 1998',
  years_experience = 22,
  international_patients_count = 9500
where id = 'b1c2d3e4-1111-1111-1111-000000000003';

update public.doctors set
  education = 'Istanbul University, 1997',
  years_experience = 23,
  international_patients_count = 11000
where id = 'b1c2d3e4-1111-1111-1111-000000000004';

update public.doctors set
  education = 'National University of Singapore, 1999',
  years_experience = 21,
  international_patients_count = 8500
where id = 'b1c2d3e4-1111-1111-1111-000000000005';

-- ─────────────────────────────────────────────────────────
-- Seed: update treatment_options with detailed fields
-- ─────────────────────────────────────────────────────────
do $$
declare
  v_case_id uuid;
  v_opt1 uuid; v_opt2 uuid; v_opt3 uuid;
begin
  select id into v_case_id from public.cases order by created_at desc limit 1;
  if v_case_id is null then return; end if;

  select id into v_opt1 from public.treatment_options
  where case_id = v_case_id and hospital_id = 'a1b2c3d4-1111-1111-1111-000000000001' limit 1;

  select id into v_opt2 from public.treatment_options
  where case_id = v_case_id and hospital_id = 'a1b2c3d4-1111-1111-1111-000000000002' limit 1;

  select id into v_opt3 from public.treatment_options
  where case_id = v_case_id and hospital_id = 'a1b2c3d4-1111-1111-1111-000000000003' limit 1;

  if v_opt1 is not null then
    update public.treatment_options set
      diagnosis             = 'Coronary Artery Disease',
      recommended_treatment = 'Coronary Artery Bypass Grafting (CABG)',
      procedure_name        = 'Coronary Artery Bypass Grafting (CABG)',
      description           = 'CABG using a minimally invasive off-pump technique. Three-vessel disease treated with saphenous vein grafts. ICU monitoring for 48 hours post-procedure followed by a structured cardiac physiotherapy programme.',
      expected_outcome      = 'Improved blood circulation and significantly reduced risk of future cardiac events',
      recovery_time         = '4–6 Weeks',
      treatment_duration    = '7–10 Days',
      hospital_stay         = '7 Days',
      technique             = 'Minimally Invasive',
      success_rate          = '95%',
      aftercare             = ARRAY[
        'Take all medicines on time and attend regular doctor check-ups.',
        'Keep the surgery wound clean and dry to prevent infection.',
        'Walk daily and avoid heavy lifting or strenuous activity for several weeks.',
        'Eat a healthy low-fat, low-salt diet and avoid smoking or tobacco.',
        'Contact a doctor immediately if you have chest pain, fever, or wound swelling.'
      ],
      cost_breakdown = '{
        "items": [
          {"label": "Doctor Fees", "amount": 4500},
          {"label": "Hospital Fees", "amount": 12000},
          {"label": "Specialist & Ancillary Fees", "amount": 2800},
          {"label": "Additional Costs", "amount": 1200},
          {"label": "IHA Service Fee", "amount": 6150}
        ],
        "total": 26650
      }'::jsonb
    where id = v_opt1;
  end if;

  if v_opt2 is not null then
    update public.treatment_options set
      diagnosis             = 'Severe Knee Osteoarthritis',
      recommended_treatment = 'Total Knee Replacement',
      procedure_name        = 'Robotic-Assisted Total Knee Replacement',
      description           = 'Total knee replacement using a robotic-assisted surgical system for optimal implant alignment. Plan includes 3 weeks of post-operative physiotherapy and a personalised pain management protocol.',
      expected_outcome      = 'Restored joint function, pain relief, and improved quality of life',
      recovery_time         = '3–4 Weeks',
      treatment_duration    = '5–7 Days',
      hospital_stay         = '5 Days',
      technique             = 'Robotic-Assisted',
      success_rate          = '92%',
      aftercare             = ARRAY[
        'Follow the physiotherapy schedule provided by your care team.',
        'Use prescribed pain medications as directed and do not skip doses.',
        'Avoid high-impact activities such as running or jumping for 6 months.',
        'Attend all follow-up appointments for implant monitoring.',
        'Maintain a healthy weight to reduce stress on the new joint.'
      ],
      cost_breakdown = '{
        "items": [
          {"label": "Doctor Fees", "amount": 3200},
          {"label": "Hospital Fees", "amount": 8500},
          {"label": "Specialist & Ancillary Fees", "amount": 1800},
          {"label": "Additional Costs", "amount": 900},
          {"label": "IHA Service Fee", "amount": 4320}
        ],
        "total": 18720
      }'::jsonb
    where id = v_opt2;
  end if;

  if v_opt3 is not null then
    update public.treatment_options set
      diagnosis             = 'Chronic Neurological Condition',
      recommended_treatment = 'Comprehensive Neurological Evaluation & Treatment',
      procedure_name        = 'Multi-Disciplinary Neurological Assessment',
      description           = 'Comprehensive neurological evaluation and targeted treatment for chronic condition management. Includes MRI brain and spine, 72-hour EEG monitoring, and a multi-disciplinary specialist review.',
      expected_outcome      = 'Accurate diagnosis, tailored treatment plan, and stabilised neurological function',
      recovery_time         = '2–3 Weeks',
      treatment_duration    = '10–14 Days',
      hospital_stay         = '3–5 Days',
      technique             = 'Non-Invasive Monitoring',
      success_rate          = '88%',
      aftercare             = ARRAY[
        'Take all prescribed neurological medications without interruption.',
        'Attend scheduled EEG and MRI follow-up sessions.',
        'Avoid triggers such as sleep deprivation, stress, and alcohol.',
        'Keep a symptom diary to share with your neurologist.',
        'Seek immediate care if you experience sudden severe headaches or seizures.'
      ],
      cost_breakdown = '{
        "items": [
          {"label": "Doctor Fees", "amount": 2800},
          {"label": "Hospital Fees", "amount": 6200},
          {"label": "Specialist & Ancillary Fees", "amount": 1500},
          {"label": "Additional Costs", "amount": 600},
          {"label": "IHA Service Fee", "amount": 3330}
        ],
        "total": 14430
      }'::jsonb
    where id = v_opt3;
  end if;
end $$;
