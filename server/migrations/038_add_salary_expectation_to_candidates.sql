-- Agregar campo de expectativa de sueldo a la tabla candidates

ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS salary_expectation NUMERIC(10, 2);

-- Comentarios para documentación
COMMENT ON COLUMN candidates.salary_expectation IS 'Expectativa de sueldo del candidato';
