-- Reference data seeded by the original Supabase migrations.

insert into specialties (id, name, label_en, label_zh, sort_order) values
  ('ca8539cc-0294-4733-aef5-318420216781', 'Cardiology', 'Cardiology', '心脏病学', 10),
  ('e3d01f0f-84a2-47c9-9c05-0292b7555d2d', 'Cardiothoracic Surgery', 'Cardiothoracic Surgery', '心胸外科', 20),
  ('6f1d36b3-61a9-49e1-a6b1-e4c77f6aff79', 'Colorectal Surgery', 'Colorectal Surgery', '结直肠外科', 30),
  ('dfb9ee87-2ea0-4e7e-bf98-b12ec0c326f4', 'Dentistry & Oral Surgery', 'Dentistry & Oral Surgery', '牙科及口腔外科', 40),
  ('4ea40224-3a9a-48cd-9cef-d3abaaa045c1', 'Dermatology', 'Dermatology', '皮肤科', 50),
  ('fa46cd1f-1609-446f-af21-af9e231f55b3', 'Endocrinology', 'Endocrinology', '内分泌科', 60),
  ('bceb0333-e4c2-428b-8dc3-52162a919209', 'ENT (Ear, Nose & Throat)', 'ENT (Ear, Nose & Throat)', '耳鼻喉科', 70),
  ('bbd1ac85-0e92-4e87-a07f-3d43510d28f4', 'Fertility & IVF', 'Fertility & IVF', '生育与试管婴儿', 80),
  ('e3ba66e7-a3aa-45a3-a465-eec7acbec4cd', 'Gastroenterology', 'Gastroenterology', '肠胃科', 90),
  ('93df9151-ac16-4c4f-b6f4-e88eb0ffa1fc', 'General Surgery', 'General Surgery', '普通外科', 100),
  ('31dcd50c-4803-4f25-869d-4b8f6a86e2fd', 'Haematology', 'Haematology', '血液科', 110),
  ('05547fee-b881-4b5d-be87-35f0b17680d8', 'Hepatology (Liver)', 'Hepatology (Liver)', '肝脏科', 120),
  ('8e1b2ad8-d6c3-4635-aabb-803c87e30365', 'Kidney Transplant', 'Kidney Transplant', '肾脏移植', 130),
  ('0e66ac2b-d166-4d30-a1ed-4090ced0ab92', 'Liver Transplant', 'Liver Transplant', '肝脏移植', 140),
  ('b283160c-3c18-4b34-abe3-23f027367cc8', 'Nephrology', 'Nephrology', '肾内科', 150),
  ('56b340d2-fe4b-4d49-a0aa-f91a43feeeb6', 'Neurology', 'Neurology', '神经科', 160),
  ('a68c903c-31ab-421c-91d8-20481f54927b', 'Neurosurgery', 'Neurosurgery', '神经外科', 170),
  ('19ae91d9-4679-4ce8-8087-a46c3e5d76c4', 'Obesity & Bariatric Surgery', 'Obesity & Bariatric Surgery', '肥胖症及减重外科', 180),
  ('6c8dcf43-d935-465b-9c0b-8cf78b0af718', 'Oncology (Cancer Treatment)', 'Oncology (Cancer Treatment)', '肿瘤科', 190),
  ('fc8b96b9-ba8a-4938-9504-8f3ffe63a15a', 'Ophthalmology (Eye)', 'Ophthalmology (Eye)', '眼科', 200),
  ('477aa93d-fba0-4391-9bf1-4496c7450e45', 'Orthopaedics & Joint Replacement', 'Orthopaedics & Joint Replacement', '骨科及关节置换', 210),
  ('103828e5-ef9a-4578-816e-a800315bd9cb', 'Paediatrics', 'Paediatrics', '儿科', 220),
  ('376f45a0-a236-45a4-9440-3ea32ae22186', 'Plastic & Reconstructive Surgery', 'Plastic & Reconstructive Surgery', '整形及重建外科', 230),
  ('11bcd15e-e14a-4691-88db-8abe0c22da46', 'Psychiatry & Mental Health', 'Psychiatry & Mental Health', '精神科及心理健康', 240),
  ('4c7d77c1-07e5-4847-90b9-cd446747487c', 'Pulmonology (Lungs)', 'Pulmonology (Lungs)', '肺科', 250),
  ('b932ee8f-a292-4fda-ba3b-04b4fa5eb1ad', 'Rheumatology', 'Rheumatology', '风湿科', 260),
  ('270037bc-e421-4c46-8612-3e5518365249', 'Spine Surgery', 'Spine Surgery', '脊柱外科', 270),
  ('548e715c-b424-45a0-aab2-de86559b6b5d', 'Urology', 'Urology', '泌尿科', 280),
  ('e5d3d8f7-37c8-41c5-82c5-167d268b194a', 'Vascular Surgery', 'Vascular Surgery', '血管外科', 290),
  ('90535762-dd20-4bdc-a9ee-ed14862c92f3', 'Other', 'Other', '其他', 9999);

insert into platform_fee_settings (id, fee_key, amount_aud) values
  ('7295e5de-3e3b-4d5b-930b-d07a2d645984', 'doctor_registration_fee', 5000.00),
  ('79948a5d-c021-43f0-8471-758718fabbe5', 'doctor_annual_fee', 2000.00);
