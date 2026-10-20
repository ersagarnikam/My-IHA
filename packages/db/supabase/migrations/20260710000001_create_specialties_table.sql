-- ─────────────────────────────────────────────────────────
-- specialties (case condition options)
--
-- Drives the "medical condition" dropdown on case submission and the
-- specialty labels shown throughout the app. Non-technical staff can
-- add/edit/deactivate rows directly in the Supabase Table Editor —
-- no code or app deploy required. `name` is the canonical value stored
-- in `cases.specialty` / `doctors.specialty`; `label_en` / `label_zh`
-- are the translated display labels.
-- ─────────────────────────────────────────────────────────
create table public.specialties (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  label_en   text        not null,
  label_zh   text        not null,
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.specialties (is_active, sort_order);

create trigger specialties_set_updated_at
  before update on public.specialties
  for each row execute function public.set_updated_at();

alter table public.specialties enable row level security;

-- Read-only from the app; writes happen via the Supabase dashboard (service role bypasses RLS).
create policy "Authenticated users can view active specialties"
  on public.specialties for select
  to authenticated
  using (is_active = true);

insert into public.specialties (name, label_en, label_zh, sort_order) values
  ('Cardiology',                       'Cardiology',                       '心脏病学',      10),
  ('Cardiothoracic Surgery',           'Cardiothoracic Surgery',           '心胸外科',      20),
  ('Colorectal Surgery',               'Colorectal Surgery',               '结直肠外科',    30),
  ('Dentistry & Oral Surgery',         'Dentistry & Oral Surgery',         '牙科及口腔外科', 40),
  ('Dermatology',                      'Dermatology',                      '皮肤科',        50),
  ('Endocrinology',                    'Endocrinology',                    '内分泌科',      60),
  ('ENT (Ear, Nose & Throat)',         'ENT (Ear, Nose & Throat)',         '耳鼻喉科',      70),
  ('Fertility & IVF',                  'Fertility & IVF',                  '生育与试管婴儿', 80),
  ('Gastroenterology',                 'Gastroenterology',                 '肠胃科',        90),
  ('General Surgery',                  'General Surgery',                  '普通外科',      100),
  ('Haematology',                      'Haematology',                      '血液科',        110),
  ('Hepatology (Liver)',               'Hepatology (Liver)',               '肝脏科',        120),
  ('Kidney Transplant',                'Kidney Transplant',                '肾脏移植',      130),
  ('Liver Transplant',                 'Liver Transplant',                 '肝脏移植',      140),
  ('Nephrology',                       'Nephrology',                       '肾内科',        150),
  ('Neurology',                        'Neurology',                        '神经科',        160),
  ('Neurosurgery',                     'Neurosurgery',                     '神经外科',      170),
  ('Obesity & Bariatric Surgery',      'Obesity & Bariatric Surgery',      '肥胖症及减重外科', 180),
  ('Oncology (Cancer Treatment)',      'Oncology (Cancer Treatment)',      '肿瘤科',        190),
  ('Ophthalmology (Eye)',              'Ophthalmology (Eye)',              '眼科',          200),
  ('Orthopaedics & Joint Replacement', 'Orthopaedics & Joint Replacement', '骨科及关节置换', 210),
  ('Paediatrics',                      'Paediatrics',                      '儿科',          220),
  ('Plastic & Reconstructive Surgery', 'Plastic & Reconstructive Surgery', '整形及重建外科', 230),
  ('Psychiatry & Mental Health',       'Psychiatry & Mental Health',       '精神科及心理健康', 240),
  ('Pulmonology (Lungs)',              'Pulmonology (Lungs)',              '肺科',          250),
  ('Rheumatology',                     'Rheumatology',                     '风湿科',        260),
  ('Spine Surgery',                    'Spine Surgery',                    '脊柱外科',      270),
  ('Urology',                          'Urology',                          '泌尿科',        280),
  ('Vascular Surgery',                 'Vascular Surgery',                 '血管外科',      290),
  ('Other',                            'Other',                            '其他',          9999);
