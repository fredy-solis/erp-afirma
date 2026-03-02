-- Migración: Crear tabla de contactos comerciales para vacantes
-- Relación: Una vacante puede tener múltiples contactos comerciales

CREATE TABLE IF NOT EXISTS commercial_contacts (
    id SERIAL PRIMARY KEY,
    job_opening_id INTEGER NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
    
    -- Datos del contacto
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL CHECK (email = LOWER(email)),
    phone VARCHAR(50),
    location VARCHAR(255),
    
    -- Metadatos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para mejorar consultas por vacante
CREATE INDEX IF NOT EXISTS idx_commercial_contacts_job_opening 
    ON commercial_contacts(job_opening_id);

-- Índice para búsquedas por email
CREATE INDEX IF NOT EXISTS idx_commercial_contacts_email 
    ON commercial_contacts(email);

COMMENT ON TABLE commercial_contacts IS 'Contactos comerciales asociados a vacantes';
COMMENT ON COLUMN commercial_contacts.email IS 'Email del contacto (siempre en minúsculas)';
