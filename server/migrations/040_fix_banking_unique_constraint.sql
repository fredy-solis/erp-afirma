-- Migración 040: Corregir constraint de employee_banking_info para permitir historial

-- Eliminar el constraint UNIQUE incorrecto que impide múltiples registros inactivos
ALTER TABLE employee_banking_info 
DROP CONSTRAINT IF EXISTS employee_banking_info_employee_id_is_active_key;

-- Crear un índice único parcial que solo aplica a registros activos
-- Esto permite: un solo registro activo por empleado, pero múltiples registros inactivos (historial)
CREATE UNIQUE INDEX IF NOT EXISTS employee_banking_info_active_idx 
ON employee_banking_info (employee_id) 
WHERE is_active = true;

-- Hacer lo mismo para employee_contracts si tiene el mismo problema
ALTER TABLE employee_contracts 
DROP CONSTRAINT IF EXISTS employee_contracts_employee_id_is_active_key;

CREATE UNIQUE INDEX IF NOT EXISTS employee_contracts_active_idx 
ON employee_contracts (employee_id) 
WHERE is_active = true;
