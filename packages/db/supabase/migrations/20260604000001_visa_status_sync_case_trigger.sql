-- Trigger: when visa_submissions.status changes to 'processing', advance cases.status
-- to 'visa_processing'. When status changes to 'approved', advance to 'travel_ready'.
CREATE OR REPLACE FUNCTION public.sync_case_status_from_visa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing' THEN
    UPDATE public.cases
    SET status = 'visa_processing', updated_at = now()
    WHERE id = NEW.case_id;

  ELSIF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.cases
    SET status = 'travel_ready', updated_at = now()
    WHERE id = NEW.case_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visa_status_syncs_case ON public.visa_submissions;

CREATE TRIGGER visa_status_syncs_case
  AFTER UPDATE OF status ON public.visa_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_case_status_from_visa();
