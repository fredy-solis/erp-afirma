-- Tabla de Órdenes de Trabajo (OT) para proyectos
-- Nota: La relación con proyectos es M:N, se maneja en project_ot_relations (migración 029)
CREATE TABLE IF NOT EXISTS orders_of_work (
    id SERIAL PRIMARY KEY,
    ot_code VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Pendiente',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsqueda rápida por código OT
CREATE INDEX IF NOT EXISTS idx_orders_of_work_ot_code ON orders_of_work(ot_code);
CREATE INDEX IF NOT EXISTS idx_orders_of_work_status ON orders_of_work(status);
