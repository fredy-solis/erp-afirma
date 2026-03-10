-- Migration: Normalize OT status values to ensure consistent filtering
-- Description: Standardizes status values in orders_of_work table
-- Date: 2026-03-09

-- Normalizar estados comunes a formato estándar (caso insensitivo)
UPDATE orders_of_work 
SET status = 'Cancelado sin importe'
WHERE LOWER(REPLACE(status, 'á', 'a')) LIKE '%cancelado sin importe%';

UPDATE orders_of_work 
SET status = 'Cerrado'
WHERE LOWER(status) IN ('cerrado', 'closed');

UPDATE orders_of_work 
SET status = 'En autorizacion de cierre'
WHERE LOWER(REPLACE(REPLACE(status, 'á', 'a'), 'ó', 'o')) LIKE '%autorizacion%cierre%'
   OR LOWER(REPLACE(REPLACE(status, 'á', 'a'), 'ó', 'o')) LIKE '%autorizacion de cierre%';

UPDATE orders_of_work 
SET status = 'en ejecucion'
WHERE LOWER(REPLACE(REPLACE(status, 'ó', 'o'), 'ú', 'u')) LIKE '%ejecucion%'
   OR LOWER(status) IN ('en ejecución', 'ejecucion', 'ejecución', 'executing');

UPDATE orders_of_work 
SET status = 'Formalizacion'
WHERE LOWER(REPLACE(status, 'ó', 'o')) LIKE '%formalizacion%'
   OR LOWER(status) IN ('formalización', 'formalizacion', 'formalizing');

-- Agregar comentario para documentación
COMMENT ON COLUMN orders_of_work.status IS 'Estado de la OT: Cancelado sin importe | Cerrado | En autorizacion de cierre | en ejecucion | Formalizacion';
