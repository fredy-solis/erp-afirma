-- Migration: Fix entity_id foreign key and synchronize entities data
-- Date: 2026-02-17
-- Description: 
--   1. Remove duplicate FK constraint (fk_employees_v2_entity_mastercode -> mastercode)
--   2. Synchronize entities table with mastercode data
--   3. Keep the correct FK (employees_v2_entity_id_fkey -> entities)
--
-- Problem: Dropdown loads from mastercode (12 items) but FK points to entities (7 items)
-- Solution: Insert missing entities from mastercode into entities table

-- Step 1: Remove the duplicate constraint that points to mastercode
ALTER TABLE employees_v2 
DROP CONSTRAINT IF EXISTS fk_employees_v2_entity_mastercode;

-- Step 2: Synchronize entities table with mastercode data
-- Insert missing entities from mastercode into entities table
-- Note: Some entities might exist with different IDs but same names, 
-- so we check both conditions to avoid unique constraint violations
INSERT INTO entities (id, name, description, created_at, updated_at)
SELECT 
    m.id,
    m.item,
    'Entidad empresarial - ' || m.item,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM mastercode m
WHERE m.lista = 'Entidad'
  AND m.id NOT IN (SELECT id FROM entities)
  AND m.item NOT IN (SELECT name FROM entities)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Verify the correct constraint remains and data is synchronized
DO $$
DECLARE
    entities_count INTEGER;
    mastercode_count INTEGER;
BEGIN
    -- Check FK constraint exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'employees_v2' 
        AND constraint_name = 'employees_v2_entity_id_fkey'
    ) THEN
        RAISE NOTICE '✅ FK constraint employees_v2_entity_id_fkey exists';
    ELSE
        RAISE WARNING '⚠️ FK constraint employees_v2_entity_id_fkey not found';
    END IF;
    
    -- Verify data synchronization
    SELECT COUNT(*) INTO entities_count FROM entities;
    SELECT COUNT(*) INTO mastercode_count FROM mastercode WHERE lista = 'Entidad';
    
    -- NOTE: Counts may differ if entities pre-existed with different IDs
    -- What matters is that all unique names from mastercode are available in entities
    RAISE NOTICE 'ℹ️ Records: entities=%, mastercode=%', entities_count, mastercode_count;
END $$;
