-- Allow standalone patient documents (not linked to a specific case)
ALTER TABLE case_documents ALTER COLUMN case_id DROP NOT NULL;

-- Distinguish medical vs visa documents uploaded from the documents page
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS document_category TEXT NOT NULL DEFAULT 'medical';
