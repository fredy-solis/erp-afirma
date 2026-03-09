-- Migration: Add 'Deleted' status to candidates table
-- Description: Allows candidates to be soft-deleted by changing status to 'Deleted'
-- Date: 2026-03-09

-- Drop existing constraint if it exists
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS valid_status;

-- Add new constraint with 'Deleted' included
ALTER TABLE candidates ADD CONSTRAINT valid_status 
  CHECK (status IN ('En revisión', 'Entrevista', 'Oferta', 'Rechazado', 'Contratado', 'Deleted'));

-- Add comment for documentation
COMMENT ON CONSTRAINT valid_status ON candidates IS 
  'Valid candidate statuses including soft-delete option (Deleted)';
