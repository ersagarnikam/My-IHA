-- Add visa_documents_submitted to cases status check constraint
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_status_check;
ALTER TABLE public.cases ADD CONSTRAINT cases_status_check CHECK (status IN (
  'case_submitted', 'under_review', 'doctor_assigned', 'evaluation',
  'treatment_plan', 'treatment_confirmed', 'payment_confirmed',
  'visa_documents_submitted', 'visa_processing', 'travel_ready', 'completed', 'closed'
));

-- Update visa_submissions default status (no longer uses not_started)
ALTER TABLE public.visa_submissions ALTER COLUMN status SET DEFAULT 'documents_submitted';

-- Atomic function: create visa submission + insert documents + advance case status.
-- SECURITY DEFINER so it can UPDATE cases even though patients only have SELECT/INSERT.
CREATE OR REPLACE FUNCTION public.submit_visa_application(
  p_case_id   uuid,
  p_form_data jsonb,
  p_documents jsonb  -- array of {category, file_name, file_path, file_size_bytes, mime_type}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id    uuid;
  v_submission_id uuid;
  v_doc           jsonb;
BEGIN
  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE user_id = auth.uid();

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: patient not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = p_case_id AND patient_id = v_patient_id
  ) THEN
    RAISE EXCEPTION 'Case not found or unauthorized';
  END IF;

  INSERT INTO public.visa_submissions (case_id, patient_id, form_data, status)
  VALUES (p_case_id, v_patient_id, p_form_data, 'documents_submitted')
  ON CONFLICT (case_id) DO UPDATE
    SET form_data  = EXCLUDED.form_data,
        status     = 'documents_submitted',
        updated_at = now()
  RETURNING id INTO v_submission_id;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents)
  LOOP
    INSERT INTO public.visa_documents (
      visa_submission_id, patient_id, category,
      file_name, file_path, file_size_bytes, mime_type
    ) VALUES (
      v_submission_id,
      v_patient_id,
      v_doc->>'category',
      v_doc->>'file_name',
      v_doc->>'file_path',
      (v_doc->>'file_size_bytes')::int8,
      v_doc->>'mime_type'
    );
  END LOOP;

  UPDATE public.cases
  SET status = 'visa_documents_submitted', updated_at = now()
  WHERE id = p_case_id AND patient_id = v_patient_id;

  RETURN jsonb_build_object('submission_id', v_submission_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_visa_application(uuid, jsonb, jsonb) TO authenticated;
