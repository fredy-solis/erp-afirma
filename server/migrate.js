require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  try {
    // Array de migraciones en orden correcto
     const migrations = [
      '001_create_employees.sql',
      '002_create_candidates.sql',
      '003_create_departments.sql',
      '004_create_positions.sql',
      '007_rename_departments_to_entities.sql',  // Renombrar ANTES de crear employees_v2
      '005_create_employees_v2.sql',
      '006_create_employee_relations.sql',
      '008_create_catalog_tables.sql',
      '003_create_mastercode.sql',  // Después de que entities exista
      '009_create_employee_extended_info.sql',
      '010_update_employees_mastercode.sql',
      '011_fix_foreign_keys.sql',
      '012_add_address_fields.sql',
      '012_create_inventory.sql',
      '013_add_expediente_fields.sql',
      '014_create_equipment.sql',
      '015_update_equipment_for_employees_v2.sql',
      '016_create_employee_vacations.sql',
      '017_alter_employee_vacations_add_id.sql',
      '018_update_employee_vacations.sql',
      '019_create_projects.sql',
      '020_create_project_assignments.sql',
      '021_fix_candidates_nullable.sql',          // Primero arreglar nullables
      '023_add_recruitment_tracking.sql',         // Agregar recruited_by, hired_date
      '025_add_cv_url_to_candidates.sql',         // Agregar cv_url
      '021_create_project_indexes.sql',
      '022_create_project_assignment_indexes.sql',
      '023_create_authentication_tables.sql',
      '024_create_job_openings.sql',
      '024_create_orders_of_work.sql',
      '025_add_orders_of_work_extended_fields.sql',
      '026_add_rate_to_project_assignments.sql',
      '027_remove_duplicate_entity_fk.sql',
      '028_fix_entity_fk_to_mastercode.sql',
      '029_create_project_ot_relations.sql',
      '030_remove_duplicate_ot_columns.sql',
      '031_add_celula_and_costo_to_projects.sql',
      '032_add_costo_ot_to_orders_of_work.sql',
      '033_fix_null_costo_ot.sql',
      '034_add_ot_id_to_project_assignments.sql',
      '035_create_licitaciones.sql',
      '036_create_commercial_contacts.sql',
      '037_add_celula_area_file_to_job_openings.sql',
      '038_add_salary_expectation_to_candidates.sql',
      '039_rename_role_to_role_name.sql',
      '040_fix_banking_unique_constraint.sql',
      '041_grant_all_permissions.sql'
    ];

    for (const migration of migrations) {
      const migrationPath = path.join(__dirname, 'migrations', migration);

      if (!fs.existsSync(migrationPath)) {
        console.warn(`⚠ Archivo no encontrado: ${migration}, saltando...`);
        continue;
      }

      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log(`Ejecutando migración: ${migration}...`);
      try {
        await db.query(sql);
        console.log(`✓ ${migration} completada`);
      } catch (err) {
        // Permitir migraciones idempotentes: continuar si el objeto ya existe
        const msg = String(err.message || err);
        if (/ya existe|already exists/i.test(msg)) {
          console.warn(`⚠ ${migration}: aviso - ${msg} (continuando)`);
          continue;
        }
        throw err;
      }
    }

    console.log('\n✓ Todas las migraciones completadas exitosamente');
    process.exit(0);
  } catch (err) {
    console.error('✗ Error en migración:', err.message);
    process.exit(1);
  }
}

runMigrations();
