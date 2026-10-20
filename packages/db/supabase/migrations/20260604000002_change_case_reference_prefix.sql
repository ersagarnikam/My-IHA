-- Change case reference number prefix from IHA- to MTA-
CREATE OR REPLACE FUNCTION public.generate_case_reference()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'MTA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.cases_reference_seq')::text, 5, '0');
$$;
