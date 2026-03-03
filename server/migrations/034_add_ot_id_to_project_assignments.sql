-- Agregar campo ot_id a project_assignments para asignaciones específicas a OTs
-- Permite asignaciones a nivel de OT (cuando ot_id tiene valor) o proyecto (cuando ot_id es NULL)

-- Verificar y crear columna ot_id solo si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_assignments' AND column_name = 'ot_id'
    ) THEN
        ALTER TABLE project_assignments 
        ADD COLUMN ot_id INTEGER;
        
        -- Agregar FK constraint
        ALTER TABLE project_assignments
        ADD CONSTRAINT fk_project_assignments_ot_id 
        FOREIGN KEY (ot_id) REFERENCES orders_of_work(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Columna ot_id agregada exitosamente';
    ELSE
        RAISE NOTICE 'Columna ot_id ya existe, saltando...';
    END IF;
END $$;

-- Verificar y crear columna allocation_percentage solo si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_assignments' AND column_name = 'allocation_percentage'
    ) THEN
        ALTER TABLE project_assignments 
        ADD COLUMN allocation_percentage NUMERIC(5,2) DEFAULT 100;
        RAISE NOTICE 'Columna allocation_percentage agregada exitosamente';
    ELSE
        RAISE NOTICE 'Columna allocation_percentage ya existe, saltando...';
    END IF;
END $$;

-- Índice para mejorar el rendimiento de consultas por OT (idempotente)
CREATE INDEX IF NOT EXISTS idx_project_assignments_ot_id ON project_assignments(ot_id);

-- Comentarios para documentación (seguros de re-ejecutar)
COMMENT ON COLUMN project_assignments.ot_id IS 'ID de la orden de trabajo específica (NULL = asignación directa a proyecto)';
COMMENT ON COLUMN project_assignments.allocation_percentage IS 'Porcentaje de dedicación del recurso (0-100)';
