-- Crear tabla intermedia para relación Many-to-Many entre Projects y Orders of Work
-- Una OT puede estar asociada a múltiples proyectos

CREATE TABLE IF NOT EXISTS project_ot_relations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ot_id INTEGER NOT NULL REFERENCES orders_of_work(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Evitar duplicados: misma OT no puede estar vinculada 2 veces al mismo proyecto
    UNIQUE(project_id, ot_id)
);

-- Índices para mejorar las búsquedas
CREATE INDEX IF NOT EXISTS idx_project_ot_relations_project_id ON project_ot_relations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_ot_relations_ot_id ON project_ot_relations(ot_id);

COMMENT ON TABLE project_ot_relations IS 'Relación Many-to-Many entre Proyectos y Órdenes de Trabajo';
COMMENT ON COLUMN project_ot_relations.project_id IS 'ID del proyecto';
COMMENT ON COLUMN project_ot_relations.ot_id IS 'ID de la orden de trabajo';
