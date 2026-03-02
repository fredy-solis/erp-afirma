-- Agregar columnas extendidas a la tabla orders_of_work para soportar importación completa de CSV

-- Agregar columnas si no existen
ALTER TABLE orders_of_work 
ADD COLUMN IF NOT EXISTS folio_principal_santec VARCHAR(100),
ADD COLUMN IF NOT EXISTS folio_santec VARCHAR(100),
ADD COLUMN IF NOT EXISTS nombre_proyecto VARCHAR(255),
ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(100),
ADD COLUMN IF NOT EXISTS tecnologia VARCHAR(100),
ADD COLUMN IF NOT EXISTS aplicativo VARCHAR(100),
ADD COLUMN IF NOT EXISTS fecha_inicio_santander DATE,
ADD COLUMN IF NOT EXISTS fecha_fin_santander DATE,
ADD COLUMN IF NOT EXISTS fecha_inicio_proveedor DATE,
ADD COLUMN IF NOT EXISTS fecha_fin_proveedor DATE,
ADD COLUMN IF NOT EXISTS horas_acordadas DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS semaforo_esfuerzo VARCHAR(50),
ADD COLUMN IF NOT EXISTS semaforo_plazo VARCHAR(50),
ADD COLUMN IF NOT EXISTS lider_delivery VARCHAR(255),
ADD COLUMN IF NOT EXISTS autorizacion_rdp VARCHAR(100),
ADD COLUMN IF NOT EXISTS responsable_proyecto VARCHAR(255),
ADD COLUMN IF NOT EXISTS cbt_responsable VARCHAR(255),
ADD COLUMN IF NOT EXISTS proveedor VARCHAR(255),
ADD COLUMN IF NOT EXISTS fecha_inicio_real DATE,
ADD COLUMN IF NOT EXISTS fecha_fin_real DATE,
ADD COLUMN IF NOT EXISTS fecha_entrega_proveedor DATE,
ADD COLUMN IF NOT EXISTS dias_desvio_entrega INTEGER,
ADD COLUMN IF NOT EXISTS ambiente VARCHAR(100),
ADD COLUMN IF NOT EXISTS fecha_creacion DATE,
ADD COLUMN IF NOT EXISTS fts TEXT,
ADD COLUMN IF NOT EXISTS estimacion_elab_pruebas DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS costo_hora_servicio_proveedor DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS monto_servicio_proveedor DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS monto_servicio_proveedor_iva DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS clase_coste VARCHAR(100),
ADD COLUMN IF NOT EXISTS folio_pds VARCHAR(100),
ADD COLUMN IF NOT EXISTS programa VARCHAR(255),
ADD COLUMN IF NOT EXISTS front_negocio VARCHAR(255),
ADD COLUMN IF NOT EXISTS vobo_front_negocio VARCHAR(100),
ADD COLUMN IF NOT EXISTS fecha_vobo_front_negocio DATE,
ADD COLUMN IF NOT EXISTS horas DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS porcentaje_ejecucion DECIMAL(5,2);

-- Crear índices para mejorar las búsquedas
CREATE INDEX IF NOT EXISTS idx_orders_of_work_ot_code ON orders_of_work(ot_code);
CREATE INDEX IF NOT EXISTS idx_orders_of_work_folio_principal ON orders_of_work(folio_principal_santec);
CREATE INDEX IF NOT EXISTS idx_orders_of_work_status ON orders_of_work(status);
CREATE INDEX IF NOT EXISTS idx_orders_of_work_lider_delivery ON orders_of_work(lider_delivery);
CREATE INDEX IF NOT EXISTS idx_orders_of_work_responsable_proyecto ON orders_of_work(responsable_proyecto);

-- Comentarios para documentar la tabla
COMMENT ON TABLE orders_of_work IS 'Órdenes de Trabajo (OT) asociadas a proyectos con información completa de Santander';
COMMENT ON COLUMN orders_of_work.ot_code IS 'Número de OT único';
COMMENT ON COLUMN orders_of_work.folio_principal_santec IS 'Folio Principal Santec';
COMMENT ON COLUMN orders_of_work.folio_santec IS 'Folio Santec';
COMMENT ON COLUMN orders_of_work.nombre_proyecto IS 'Nombre del proyecto (referencia textual)';
-- project_id removed - using M:N relationship via project_ot_relations table
COMMENT ON COLUMN orders_of_work.porcentaje_ejecucion IS 'Porcentaje de ejecución de la OT (0-100)';
