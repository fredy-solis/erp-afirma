-- Migración 043: Grant all permissions to erp-user on existing tables

-- Grant all permissions to erp-user on existing tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "erp-user";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "erp-user";
GRANT ALL PRIVILEGES ON SCHEMA public TO "erp-user";

-- Grant permissions on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "erp-user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "erp-user";
