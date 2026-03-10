-- Migración: Otorgar todos los permisos necesarios al usuario erp-user
-- Asegura que el usuario de la aplicación tenga acceso completo a todas las tablas

-- Otorgar permisos en todas las tablas existentes
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "erp-user";

-- Otorgar permisos en todas las secuencias
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "erp-user";

-- Otorgar permisos en el schema
GRANT ALL PRIVILEGES ON SCHEMA public TO "erp-user";

-- Configurar permisos por defecto para futuras tablas
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "erp-user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "erp-user";

-- Verificar que postgres también tenga permisos completos
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
