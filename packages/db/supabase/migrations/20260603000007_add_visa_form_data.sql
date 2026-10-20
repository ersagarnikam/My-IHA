-- Add form_data JSONB column to store structured visa application form data
ALTER TABLE visa_submissions ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}';
