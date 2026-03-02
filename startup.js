// Script de inicio para Cloud Run
// Ejecuta migraciones y luego inicia el servidor

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuración de DB usando Cloud SQL Proxy
const dbHost = process.env.DB_HOST || 'localhost';
const isCloudSQL = dbHost.startsWith('/cloudsql/');

const config = {
  host: dbHost,
  database: process.env.DB_NAME || 'BD_afirma',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: false,
  connectionTimeoutMillis: 15000
};

// Solo agregar puerto si NO es Cloud SQL Unix socket
if (!isCloudSQL) {
  config.port = process.env.DB_PORT || 5432;
}

const migrations = [
  // Tablas base y empleados
  '001_create_employees.sql',
  '002_create_candidates.sql',
  '003_create_departments.sql',
  '004_create_positions.sql',
  '007_rename_departments_to_entities.sql',
  '005_create_employees_v2.sql',
  '006_create_employee_relations.sql',
  '008_create_catalog_tables.sql',
  '003_create_mastercode.sql',
  '009_create_employee_extended_info.sql',
  '010_update_employees_mastercode.sql',
  '011_fix_foreign_keys.sql',
  '012_add_address_fields.sql',
  
  // Inventario y equipos
  '012_create_inventory.sql',
  '013_add_expediente_fields.sql',
  '014_create_equipment.sql',
  '015_update_equipment_for_employees_v2.sql',
  
  // Vacaciones
  '016_create_employee_vacations.sql',
  '017_alter_employee_vacations_add_id.sql',
  '018_update_employee_vacations.sql',
  
  // Proyectos y asignaciones
  '019_create_projects.sql',
  '020_create_project_assignments.sql',
  '021_create_project_indexes.sql',
  '022_create_project_assignment_indexes.sql',
  
  // Candidatos y reclutamiento
  '021_fix_candidates_nullable.sql',
  '023_add_recruitment_tracking.sql',
  '025_add_cv_url_to_candidates.sql',
  '038_add_salary_expectation_to_candidates.sql',
  
  // Autenticación y vacantes
  '023_create_authentication_tables.sql',
  '024_create_job_openings.sql',
  '037_add_celula_area_file_to_job_openings.sql',
  
  // Órdenes de trabajo
  '024_create_orders_of_work.sql',
  '025_add_orders_of_work_extended_fields.sql',
  '029_create_project_ot_relations.sql',
  '030_remove_duplicate_ot_columns.sql',
  '032_add_costo_ot_to_orders_of_work.sql',
  '033_fix_null_costo_ot.sql',
  '034_add_ot_id_to_project_assignments.sql',
  
  // Ajustes y correcciones
  '026_add_rate_to_project_assignments.sql',
  '027_remove_duplicate_entity_fk.sql',
  '028_fix_entity_fk_to_mastercode.sql',
  
  // Proyectos avanzados
  '031_add_celula_and_costo_to_projects.sql',
  
  // Licitaciones y contactos comerciales
  '035_create_licitaciones.sql',
  '036_create_commercial_contacts.sql'
];

async function runMigrations() {
  console.log('🔄 Ejecutando migraciones al inicio del contenedor...');
  console.log('📍 Modo:', isCloudSQL ? 'Cloud SQL Unix Socket' : 'TCP/IP');
  console.log('📍 Host:', config.host);
  console.log('📍 Database:', config.database);
  if (!isCloudSQL) {
    console.log('📍 Port:', config.port);
  }

  const pool = new Pool(config);
  let appliedCount = 0;
  let skippedCount = 0;

  try {
    // Test conexión
    await pool.query('SELECT NOW()');
    console.log('✅ Conexión a base de datos exitosa');

    for (const migration of migrations) {
      const migrationPath = path.join(__dirname, 'server', 'migrations', migration);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`   ⚠️  ${migration} no encontrado, saltando`);
        skippedCount++;
        continue;
      }

      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query(sql);
        console.log(`   ✅ ${migration} aplicada`);
        appliedCount++;
      } catch (err) {
        // Si el error es porque ya existe, es OK
        if (err.message.includes('already exists') || 
            err.message.includes('ya existe') ||
            err.message.includes('duplicate')) {
          console.log(`   ℹ️  ${migration} ya aplicada`);
          skippedCount++;
        } else {
          // Para otros errores, log pero no fallar el inicio
          console.log(`   ⚠️  ${migration} error (continuando): ${err.message}`);
          skippedCount++;
        }
      }
    }

    console.log(`✅ Migraciones completadas: ${appliedCount} aplicadas, ${skippedCount} ya existentes`);
    await pool.end();
    return true;
  } catch (err) {
    console.error('❌ Error en migraciones:', err.message);
    console.error('⚠️  Continuando con el inicio del servidor...');
    await pool.end();
    // No fallar el inicio si las migraciones no funcionan
    return false;
  }
}

async function startServer() {
  console.log('🚀 Iniciando servidor...');
  require('./server/api.js');
}

// Ejecutar migraciones y luego iniciar servidor
runMigrations()
  .then(() => {
    console.log('');
    startServer();
  })
  .catch(err => {
    console.error('Error fatal al iniciar:', err);
    // Intentar iniciar el servidor de todas formas
    startServer();
  });
