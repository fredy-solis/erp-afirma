-- Renombrar columna 'role' a 'role_name' en project_assignments
-- Para homologar con el esquema de producción y mantener consistencia de nombre

DO $$ 
BEGIN
    -- Verificar si existe la columna 'role' y renombrarla a 'role_name'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_assignments' AND column_name = 'role'
    ) THEN
        -- Verificar que 'role_name' NO existe aún
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'project_assignments' AND column_name = 'role_name'
        ) THEN
            ALTER TABLE project_assignments 
            RENAME COLUMN role TO role_name;
            RAISE NOTICE 'Columna role renombrada a role_name exitosamente';
        ELSE
            RAISE NOTICE 'Columna role_name ya existe, no se puede renombrar';
        END IF;
    ELSE
        RAISE NOTICE 'Columna role no existe, probablemente ya fue renombrada o la tabla tiene el esquema correcto';
    END IF;
END $$;

-- Comentario actualizado para la columna
COMMENT ON COLUMN project_assignments.role_name IS 'Nombre del rol o posición del empleado en esta asignación (ej: Desarrollador, Líder Técnico, etc.)';
