-- Agregar campos de célula, área y archivo a job_openings

-- Agregar celula_id vinculado a mastercode
ALTER TABLE job_openings 
ADD COLUMN IF NOT EXISTS celula_id INTEGER REFERENCES mastercode(id) ON DELETE SET NULL;

-- Agregar area_id vinculado a mastercode
ALTER TABLE job_openings 
ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES mastercode(id) ON DELETE SET NULL;

-- Agregar campo para archivo de la vacante
ALTER TABLE job_openings 
ADD COLUMN IF NOT EXISTS file_url VARCHAR(500);

-- Crear índices para mejorar búsquedas
CREATE INDEX IF NOT EXISTS idx_job_openings_celula_id ON job_openings(celula_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_area_id ON job_openings(area_id);

-- Comentarios para documentación
COMMENT ON COLUMN job_openings.celula_id IS 'ID de la célula desde mastercode (lista Celulas)';
COMMENT ON COLUMN job_openings.area_id IS 'ID del área desde mastercode (lista Areas)';
COMMENT ON COLUMN job_openings.file_url IS 'URL del archivo asociado a la vacante (pdf, word, imagen, etc)';
