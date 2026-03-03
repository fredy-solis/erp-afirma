// Cargar configuración según ambiente
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.development' });
} else {
  require('dotenv').config();
}
const express = require('express');
const bodyParser = require('express').json;
const db = require('./db');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3000;

app.use(bodyParser());

// Configure static file serving for uploads (CVs, etc) - MUST BE FIRST
const uploadsPath = path.join(__dirname, '..', 'public', 'uploads');
console.log('📁 Static files serving configured at /uploads ->',  uploadsPath);
app.use('/uploads', express.static(uploadsPath, {
  dotfiles: 'allow',
  index: false
}));

// Configure CORS to allow frontend requests
app.use((req, res, next) => {
  // Only log non-health check and non-uploads requests to reduce noise
  if (!req.url.includes('/health') && !req.url.includes('/uploads')) {
    console.log(`🌐 CORS middleware - ${req.method} ${req.url}`);
  }
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    if (!req.url.includes('/health')) {
      console.log('✅ Handling OPTIONS request');
    }
    return res.status(200).end();
  }
  
  next();
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'erp-afirma-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

// Authorization Middleware - Check user has required role
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    if (!allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para realizar esta acción',
        required_roles: allowedRoles,
        your_role: req.user.role_name
      });
    }
    
    next();
  };
};

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// Configure multer for job opening files (images, pdf, word, txt)
const jobOpeningStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'job-openings');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'vacancy-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadJobFile = multer({
  storage: jobOpeningStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt'];
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes, PDF, Word y archivos de texto'));
    }
  }
});

// Helpers: resolve or create entity/position by name
async function findOrCreateEntity(name) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  try {
    const found = await db.query("SELECT id FROM mastercode WHERE lista = 'Entidad' AND LOWER(item) = LOWER($1) LIMIT 1", [clean]);
    if (found.rowCount > 0) return found.rows[0].id;
    const inserted = await db.query("INSERT INTO mastercode (lista, item) VALUES ('Entidad', $1) RETURNING id", [clean]);
    return inserted.rows[0].id;
  } catch (err) {
    console.error('Error resolving/creating entity', err);
    return null;
  }
}

async function findOrCreatePosition(name, entity_id) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  try {
    // try matching by name (case-insensitive)
    const found = await db.query("SELECT id FROM mastercode WHERE lista = 'Puestos roles' AND LOWER(item) = LOWER($1) LIMIT 1", [clean]);
    if (found.rowCount > 0) return found.rows[0].id;
    const inserted = await db.query(
      "INSERT INTO mastercode (lista, item) VALUES ('Puestos roles', $1) RETURNING id",
      [clean]
    );
    return inserted.rows[0].id;
  } catch (err) {
    console.error('Error resolving/creating position', err);
    return null;
  }
}

// Helpers catálogo: área, proyecto y célula
async function findOrCreateArea(name) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  try {
    const found = await db.query("SELECT id FROM mastercode WHERE lista = 'Areas' AND LOWER(item) = LOWER($1) LIMIT 1", [clean]);
    if (found.rowCount > 0) return found.rows[0].id;
    const ins = await db.query("INSERT INTO mastercode (lista, item) VALUES ('Areas', $1) RETURNING id", [clean]);
    return ins.rows[0].id;
  } catch (err) {
    console.error('Error resolving/creating area', err);
    return null;
  }
}
async function findOrCreateProject(name, area_id) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  try {
    const found = await db.query("SELECT id FROM mastercode WHERE lista = 'Proyecto' AND LOWER(item) = LOWER($1) LIMIT 1", [clean]);
    if (found.rowCount > 0) return found.rows[0].id;
    const ins = await db.query("INSERT INTO mastercode (lista, item) VALUES ('Proyecto', $1) RETURNING id", [clean]);
    return ins.rows[0].id;
  } catch (err) {
    console.error('Error resolving/creating project', err);
    return null;
  }
}
async function findOrCreateCell(name, area_id, project_id) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  try {
    const found = await db.query("SELECT id FROM mastercode WHERE lista = 'Celulas' AND LOWER(item) = LOWER($1) LIMIT 1", [clean]);
    if (found.rowCount > 0) return found.rows[0].id;
    const ins = await db.query("INSERT INTO mastercode (lista, item) VALUES ('Celulas', $1) RETURNING id", [clean]);
    return ins.rows[0].id;
  } catch (err) {
    console.error('Error resolving/creating cell', err);
    return null;
  }
}

// Date helpers
function normalizeDateInput(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Accept YYYY-MM-DD or ISO strings
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // Return YYYY-MM-DD
  return d.toISOString().split('T')[0];
}

function isFutureDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  // compare only date portion
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const td = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dd > td;
}

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== AUTHENTICATION ENDPOINTS ==========

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Find user by email
    const userQuery = `
      SELECT u.*, r.name as role_name, r.permissions 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1 AND u.status = 'Activo'
    `;
    const result = await db.query(userQuery, [email]);

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Update last login
    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        permissions: user.permissions
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return user info (without password hash)
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role_id: user.role_id,
        role_name: user.role_name,
        permissions: user.permissions,
        employee_id: user.employee_id
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Register new user (Admin only)
app.post('/api/auth/register', authenticateToken, authorizeRoles('Administrador'), async (req, res) => {
  try {
    const { email, password, first_name, last_name, role_id, employee_id } = req.body;

    if (!email || !password || !first_name || !last_name || !role_id) {
      return res.status(400).json({ 
        error: 'Email, contraseña, nombre, apellido y rol son requeridos' 
      });
    }

    // Check if user already exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rowCount > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const insertQuery = `
      INSERT INTO users (email, password_hash, first_name, last_name, role_id, employee_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'Activo')
      RETURNING id, email, first_name, last_name, role_id, employee_id, status, created_at
    `;
    const result = await db.query(insertQuery, [
      email,
      password_hash,
      first_name,
      last_name,
      role_id,
      employee_id || null
    ]);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userQuery = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.employee_id, 
             u.status, u.last_login, r.name as role_name, r.permissions
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `;
    const result = await db.query(userQuery, [req.user.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error al obtener información del usuario' });
  }
});

// Logout (client-side only, just for logging)
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  console.log(`🔓 Usuario ${req.user.email} cerró sesión`);
  res.json({ message: 'Sesión cerrada exitosamente' });
});

// Get all users (Admin only)
app.get('/api/auth/users', authenticateToken, authorizeRoles('Administrador'), async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.employee_id,
             u.status, u.last_login, u.created_at, r.name as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Update user (Admin only)
app.put('/api/auth/users/:id', authenticateToken, authorizeRoles('Administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, first_name, last_name, role_id, employee_id, status } = req.body;

    const updateQuery = `
      UPDATE users 
      SET email = COALESCE($1, email),
          first_name = COALESCE($2, first_name),
          last_name = COALESCE($3, last_name),
          role_id = COALESCE($4, role_id),
          employee_id = COALESCE($5, employee_id),
          status = COALESCE($6, status)
      WHERE id = $7
      RETURNING id, email, first_name, last_name, role_id, employee_id, status
    `;
    
    const result = await db.query(updateQuery, [email, first_name, last_name, role_id, employee_id, status, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      message: 'Usuario actualizado exitosamente',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Delete user (Admin only)
app.delete('/api/auth/users/:id', authenticateToken, authorizeRoles('Administrador'), async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// Get all roles
app.get('/api/auth/roles', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM roles ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

// ========== CANDIDATES ENDPOINTS ==========

// List candidates
app.get('/api/candidates', async (req, res) => {
  try {
    // Intentar con los campos recruited_by y hired_date; si no existen, ignorarlos y retornar sin ellos
    const result = await db.query(`
      SELECT id, first_name, last_name, email, phone, position_applied, status, notes, 
             recruited_by, hired_date,cv_url, created_at 
      FROM candidates
      WHERE status != 'Contratado' AND status != 'Deleted'
      ORDER BY id DESC
    `);
    console.log('✅ [GET /api/candidates] Candidatos obtenidos', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    // Si falla porque el campo no existe, intentar sin él
    if (err.message.includes('recruited_by') || err.message.includes('hired_date') || err.message.includes('column')) {
      console.log('❌ Campo recruited_by o hired_date no existen aún, retornando sin ellos');
      try {
        const result = await db.query('SELECT * FROM candidates ORDER BY id DESC');
        console.log('⚠️ Candidatos obtenidos', result.rows.length);
        res.json(result.rows);
      } catch (err2) {
        console.error('❌ Error fetching candidates', err2);
        res.status(500).json({ error: 'Error fetching candidates' });
      }
    } else {
      console.error('❌ Error fetching candidates', err);
      res.status(500).json({ error: 'Error fetching candidates' });
    }
  }
});

// Create candidate
app.post('/api/candidates', async (req, res) => {
  let { first_name, last_name, email, phone, salary_expectation, position_applied, status, notes, name } = req.body;

  if (!first_name && name) {
    const parts = String(name).trim().split(/\s+/);
    first_name = parts.shift() || '';
    last_name = parts.join(' ') || '';
  }

  if (!email) {
    const base = (first_name || 'candidate').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'candidate';
    const suffix = Date.now();
    email = `${base}${suffix}@temp.local`;
  }

  // validate email if provided
  if (email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(email))) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
  }

  try {
    // Crear candidato SIN recruited_by (se asignará solo cuando cambie a Contratado)
    const result = await db.query(
      `INSERT INTO candidates (first_name, last_name, email, phone, salary_expectation, position_applied, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [first_name || null, last_name || null, email, phone || null, salary_expectation || null, position_applied || null, status || 'En revisión', notes || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting candidate', err);
    return res.status(500).json({ error: 'Error creating candidate' });
  }
});

// Update candidate
app.put('/api/candidates/:id', async (req, res) => {
  const id = req.params.id;
  const { first_name, last_name, email, phone, salary_expectation, position_applied, status, notes, recruited_by, hired_date } = req.body;
  
  
  // validate email if provided
  if (email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(email))) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
  }

  try {
    // Si el status cambia a "Contratado", guardar recruited_by y hired_date
    // Si no, ignorar ambos
    const finalRecruitedBy = (status === 'Contratado' && recruited_by) ? recruited_by : null;
    const finalHiredDate = (status === 'Contratado' && hired_date) ? hired_date : null;
    
    console.log('🔧 Procesando: status=' + status + ', recruited_by=' + recruited_by + ', hired_date=' + hired_date);
    console.log('🔧 Final values: finalRecruitedBy=' + finalRecruitedBy + ', finalHiredDate=' + finalHiredDate);
    
    // Intentar con recruited_by y hired_date
    try {
      const result = await db.query(
        `UPDATE candidates SET first_name=$1, last_name=$2, email=$3, phone=$4, salary_expectation=$5, position_applied=$6, status=$7, notes=$8, recruited_by=$9, hired_date=$10 WHERE id=$11 RETURNING *`,
        [first_name || null, last_name || null, email || null, phone || null, salary_expectation || null, position_applied || null, status || null, notes || null, finalRecruitedBy, finalHiredDate, id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Candidate not found' });
      console.log('✅ Candidato actualizado correctamente, recruited_by=' + result.rows[0].recruited_by + ', hired_date=' + result.rows[0].hired_date);
      
      // Si el candidato fue CONTRATADO, crear empleado automáticamente
      if (status === 'Contratado' && first_name && last_name) {
        console.log('👤 Intentando crear empleado desde candidato contratado...');
        try {
          // Resolver posición si existe
          let positionId = null;
          if (position_applied) {
            const posResult = await findOrCreatePosition(position_applied, null);
            positionId = posResult;
          }
          
          // Crear empleado con los datos del candidato
          const employeeResult = await db.query(`
            INSERT INTO employees_v2 (
              first_name, last_name, email, phone, 
              position_id, hire_date, status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `, [
            first_name,
            last_name,
            email || null,
            phone || null,
            positionId || null,
            hired_date || new Date().toISOString().split('T')[0],
            'Activo',
            'candidatos'
          ]);
          
          if (employeeResult.rowCount > 0) {
            console.log('✅ Empleado creado automaticamente ID:', employeeResult.rows[0].id);
            result.rows[0].employee_id = employeeResult.rows[0].id;
          }
        } catch (empErr) {
          console.log('⚠️ No se pudo crear empleado automáticamente:', empErr.message);
          // No es error crítico, continuamos
        }
      }
      
      return res.json(result.rows[0]);
    } catch (err) {
      // Si falla porque los campos no existen, actualizar sin ellos
      if (err.message.includes('recruited_by') || err.message.includes('hired_date') || err.message.includes('column')) {
        console.log('❌ Campo recruited_by o hired_date no existe, error:', err.message);
        console.log('⚠️ Intentando actualizar sin los campos recruited_by y hired_date');
        const result = await db.query(
          `UPDATE candidates SET first_name=$1, last_name=$2, email=$3, phone=$4, position_applied=$5, status=$6, notes=$7 WHERE id=$8 RETURNING *`,
          [first_name || null, last_name || null, email || null, phone || null, position_applied || null, status || null, notes || null, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Candidate not found' });
        console.log('⚠️ Candidato actualizado SIN los campos recruited_by y hired_date (columnas no existen)');
        return res.json(result.rows[0]);
      }
      throw err;
    }
  } catch (err) {
    console.error('❌ Error actualizando candidato', err);
    res.status(500).json({ error: 'Error updating candidate' });
  }
});

// Delete candidate
app.patch('/api/candidates/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    const result = await db.query('UPDATE candidates SET status=$1 WHERE id = $2 RETURNING *', [status, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Candidate not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error deleting candidate', err);
    res.status(500).json({ error: 'Error deleting candidate' });
  }
});

// Upload CV for candidate
app.post('/api/candidates/upload-cv', multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const candidateId = req.body.candidateId;
    if (!candidateId) {
      return res.status(400).json({ error: 'Candidate ID is required' });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'cvs');
    console.log('📂 Uploading to directory:', uploadsDir);
    console.log('📂 __dirname:', __dirname);
    
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('📂 Created uploads directory');
    }

    // Generate unique filename
    const ext = path.extname(req.file.originalname);
    const filename = `cv_candidate_${candidateId}_${Date.now()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    console.log('📝 File will be saved to:', filepath);

    // Save file to disk
    fs.writeFileSync(filepath, req.file.buffer);
    console.log('✅ File saved successfully, checking if exists:', fs.existsSync(filepath));

    // Generate URL for the file
    const cvUrl = `/uploads/cvs/${filename}`;

    console.log('✅ CV uploaded successfully:', cvUrl);
    console.log('📋 Access URL:', cvUrl);

    // Update candidate with CV URL if candidate ID is numeric (not 'new')
    if (!isNaN(candidateId)) {
      const updateResult = await db.query('UPDATE candidates SET cv_url=$1 WHERE id=$2 RETURNING *', [cvUrl, candidateId]);
      if (updateResult.rowCount === 0) {
        console.warn('⚠️ Candidate not found, but file was saved anyway');
      }
    }

    res.json({ cv_url: cvUrl, message: 'CV uploaded successfully' });
  } catch (err) {
    console.error('Error uploading CV', err);
    res.status(500).json({ error: 'Error uploading CV: ' + err.message });
  }
});

// Upload and parse Excel file for employees
app.post('/api/upload-employees', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in Excel file' });
    }

    // Detect columns and prepare for insertion
    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        // Map many possible column names to our normalized fields
        // Support the client's Excel headers (Spanish)
        const rawFullName = (row['Nombre del empleado'] || row['Nombre'] || row['nombre'] || row['name'] || row['NombreEmpleado'] || '').toString().trim();
        let first_name = '';
        let last_name = '';
        if (rawFullName) {
          const parts = rawFullName.split(/\s+/);
          first_name = parts.shift() || '';
          last_name = parts.join(' ') || '';
        } else {
          first_name = (row['Nombre'] || row['nombre'] || row['first_name'] || row['First Name'] || '').toString().trim();
          last_name = (row['Apellido'] || row['apellido'] || row['last_name'] || row['Last Name'] || '').toString().trim();
        }
        // Ensure last_name is not empty to satisfy DB NOT NULL constraints
        if (!last_name) {
          last_name = '(Sin Apellido)';
        }
        
        // Get email - prioritize work email (Correo de trabajo)
        const workEmail = (row['Correo de trabajo'] || row['Correo trabajo'] || '').toString().trim();
        const personalEmail = (row['Correo electrónico personal'] || row['Correo personal'] || '').toString().trim();
        const email = workEmail || personalEmail || (first_name + '.' + last_name + '@afirma-solutions.com').toLowerCase();
        const phone = (row['Teléfono laboral'] || row['Teléfono'] || row['telefono'] || row['teléfono'] || row['phone'] || row['Phone'] || '').toString().trim();
        const personal_phone = (row['Teléfono personal'] || row['Personal Phone'] || row['personal_phone'] || row['celular'] || '').toString().trim();
        const employee_code = (row['Código'] || row['Codigo'] || row['employee_code'] || row['Código empleado'] || '').toString().trim();
        const positionName = (row['Posición'] || row['posición'] || row['position'] || row['Position'] || row['Cargo'] || row['cargo'] || '').toString().trim();
        const entityName = (row['Área'] || row['Departamento'] || row['departamento'] || row['department'] || '').toString().trim();
        const hire_date = (row['Fecha de ingreso'] || row['Fecha ingreso'] || row['Fecha contratación'] || row['hire_date'] || row['Fecha de contratación'] || row['Hire Date'] || row['hireDate'] || '').toString().trim();
        const start_date = (row['Fecha de asignación'] || row['Fecha asignación'] || row['Fecha inicio'] || row['start_date'] || row['Fecha de inicio'] || '').toString().trim();
        const birth_date = (row['Fecha nacimiento'] || row['birth_date'] || row['Fecha de nacimiento'] || '').toString().trim();
        const address = (row['Dirección'] || row['direccion'] || row['address'] || '').toString().trim();
        const city = (row['Ciudad'] || row['city'] || '').toString().trim();
        const state = (row['Estado'] || row['state'] || '').toString().trim();
        const postal_code = (row['Postal'] || row['postal_code'] || row['Código postal'] || '').toString().trim();
        const country = (row['País'] || row['Pais'] || row['country'] || '').toString().trim();
        const employment_type = (row['Tipo empleo'] || row['employment_type'] || row['Tipo de empleo'] || '').toString().trim();
        const contract_end_date = (row['Fin contrato'] || row['contract_end_date'] || '').toString().trim();
        const statusVal = (row['Estado'] || row['status'] || '').toString().trim() || 'Activo';
        // Client-specific columns
        const cliente = (row['CLIENTE'] || row['Cliente'] || row['client'] || '').toString().trim();
        const celula = (row['Célula'] || row['Celula'] || '').toString().trim();
        const proyecto = (row['Proyecto'] || row['Project'] || '').toString().trim();
        const tarifa = (row['Tarifa inicial de contratación'] || row['Tarifa'] || row['Tarifa inicial'] || '').toString().trim();
        const sgmm = (row['SGMM'] || '').toString().trim();
        const vida = (row['vida'] || row['Vida'] || '').toString().trim();
        const cpa_cpe = (row['CPA / CPE'] || row['CPA'] || row['CPE'] || '').toString().trim();
        const correo_con_cliente = (row['Correo con cliente'] || row['Correo cliente'] || '').toString().trim();
        const correo_trabajo = (row['Correo de trabajo'] || row['Correo trabajo'] || row['Correo laboral'] || row['Correo'] || row['Correo electrónico laboral'] || '').toString().trim();
        const correo_personal = (row['Correo electrónico personal'] || row['Correo personal'] || row['Personal Email'] || '').toString().trim();

        // Validate email format if provided
        if (email) {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(String(email))) {
            errors.push({ row: i + 1, error: `Invalid email: ${email}` });
            continue;
          }
        }

        // Normalize hire_date to avoid DB check failures (coerce future dates to today)
        let hireDateForInsert = null;
        const hireNorm = normalizeDateInput(hire_date);
        if (hireNorm) {
          if (isFutureDate(hireNorm)) {
            hireDateForInsert = new Date().toISOString().split('T')[0];
          } else {
            hireDateForInsert = hireNorm;
          }
        } else {
          // If hire_date is missing or invalid, default to today
          hireDateForInsert = new Date().toISOString().split('T')[0];
        }
        // Ensure hire_date is set (required by DB)
        if (!hireDateForInsert) {
          hireDateForInsert = new Date().toISOString().split('T')[0];
        }

        // Resolve or create entity and position
        const resolvedEntityId = entityName ? await findOrCreateEntity(entityName) : null;
        const resolvedPositionId = positionName ? await findOrCreatePosition(positionName, resolvedEntityId) : null;

        let insertResult;
        try {
          insertResult = await db.query(
            `INSERT INTO employees_v2 (
               first_name, last_name, email, phone, personal_phone,
               employee_code, position_id, entity_id,
               hire_date, start_date, birth_date,
               address, city, state, postal_code, country,
               employment_type, contract_end_date, status, created_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
            [
              first_name || null,
              last_name || null,
              email || null,
              phone || null,
              personal_phone || null,
              employee_code || null,
              resolvedPositionId || null,
              resolvedEntityId || null,
              hireDateForInsert || null,
              start_date || null,
              birth_date || null,
              address || null,
              city || null,
              state || null,
              postal_code || null,
              country || 'Colombia',
              employment_type || 'Permanente',
              contract_end_date || null,
              statusVal || 'Activo',
              'import_excel'
            ]
          );
        } catch (e) {
          console.error('Employees_v2 INSERT error:', e.message);
          console.error('Params:', [
            first_name || null,
            last_name || null,
            email || null,
            phone || null,
            personal_phone || null,
            employee_code || null,
            resolvedPositionId || null,
            resolvedDepartmentId || null,
            hireDateForInsert || null,
            start_date || null,
            birth_date || null,
            address || null,
            city || null,
            state || null,
            postal_code || null,
            country || 'Colombia',
            employment_type || 'Permanente',
            contract_end_date || null,
            statusVal || 'Activo',
            'import_excel'
          ]);
          throw e;
        }
        results.push(insertResult.rows[0]);
        const newEmp = insertResult.rows[0];

        // After creating employee, save import metadata in employee_documents
        try {
          const meta = {
            cliente: cliente || undefined,
            celula: celula || undefined,
            proyecto: proyecto || undefined,
            sgmm: sgmm || undefined,
            vida: vida || undefined,
            cpa_cpe: cpa_cpe || undefined,
            correo_con_cliente: correo_con_cliente || undefined,
            correo_personal: correo_personal || undefined,
            original_row: row
          };
          // insert a document with type import_meta and notes as JSON
          await db.query(
            `INSERT INTO employee_documents (employee_id, document_type, notes) VALUES ($1,$2,$3)`,
            [newEmp.id, 'import_meta', JSON.stringify(meta)]
          );
        } catch (docErr) {
          console.error('Error saving import meta for employee', newEmp.id, docErr.message);
        }

        // If tarifa present and numeric, create initial salary_history
        try {
          const tarifaNum = parseFloat(String(tarifa).replace(/[^0-9\.-]+/g,''));
          if (!isNaN(tarifaNum) && tarifaNum > 0) {
            const effDate = hireDateForInsert || new Date().toISOString().split('T')[0];
            await db.query(
              `INSERT INTO salary_history (employee_id, salary_amount, currency, effective_date, reason, notes, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [newEmp.id, tarifaNum, 'COP', effDate, 'Tarifa inicial importada', JSON.stringify({source_row: row}), 'import_excel']
            );
          }
        } catch (salErr) {
          console.error('Error creating salary_history for employee', newEmp.id, salErr.message);
        }
      } catch (err) {
        if (err.code === '23505') { // Unique constraint violation (duplicate email)
          errors.push({ row: i + 1, error: `Duplicate or constraint error: ${err.detail || err.message}` });
        } else {
          errors.push({ row: i + 1, error: err.message });
        }
      }
    }

    res.json({
      imported: results.length,
      total: data.length,
      results,
      errors: errors.length > 0 ? errors : null
    });
  } catch (err) {
    console.error('Error uploading employees', err);
    res.status(500).json({ error: 'Error processing file: ' + err.message });
  }
});

// Upload and parse Excel file for candidates
app.post('/api/upload-candidates', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in Excel file' });
    }

    // Detect columns and prepare for insertion
    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        // Map common column names
        const first_name = row['Nombre'] || row['nombre'] || row['first_name'] || row['First Name'] || '';
        const last_name = row['Apellido'] || row['apellido'] || row['last_name'] || row['Last Name'] || '';
        const email = row['Email'] || row['email'] || row['Correo'] || row['correo'] || '';
        const phone = row['Teléfono'] || row['teléfono'] || row['phone'] || row['Phone'] || row['Telefono'] || '';
        const position_applied = row['Posición'] || row['posición'] || row['position'] || row['Position'] || row['Cargo'] || row['cargo'] || '';
        const status = row['Estado'] || row['estado'] || row['Status'] || row['status'] || 'En revisión';
        const notes = row['Notas'] || row['notas'] || row['Notes'] || row['notes'] || '';

        // Validate email format if provided
        if (email) {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(String(email).trim())) {
            errors.push({ row: i + 1, error: `Invalid email: ${email}` });
            continue;
          }
        }

        const result = await db.query(
          `INSERT INTO candidates (first_name, last_name, email, phone, position_applied, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [first_name.trim() || null, last_name.trim() || null, email.trim() || null, phone.trim() || null, position_applied.trim() || null, status, notes.trim() || null]
        );
        results.push(result.rows[0]);
      } catch (err) {
        if (err.code === '23505') { // Unique constraint violation
          errors.push({ row: i + 1, error: `Email already exists: ${row.Email || row.email || row.Correo}` });
        } else {
          errors.push({ row: i + 1, error: err.message });
        }
      }
    }

    res.json({
      imported: results.length,
      total: data.length,
      results,
      errors: errors.length > 0 ? errors : null
    });
  } catch (err) {
    console.error('Error uploading candidates', err);
    res.status(500).json({ error: 'Error processing file: ' + err.message });
  }
});

// ============ ENTITIES ENDPOINTS (formerly departments) ============

// Get all entities from mastercode
app.get('/api/entities', async (req, res) => {
  console.log('📝 GET /api/entities endpoint called');
  try {
    console.log('🔍 Querying mastercode for entities...');
    const result = await db.query("SELECT id, item as name FROM mastercode WHERE lista = 'Entidad' ORDER BY item");
    console.log(`✅ Found ${result.rows.length} entities`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching entities:', err);
    res.status(500).json({ error: 'Error fetching entities' });
  }
});

// Backward compatible route
app.get('/api/departments', async (req, res) => {
  try {
    const result = await db.query("SELECT id, item as name FROM mastercode WHERE lista = 'Entidad' ORDER BY item");
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching entities', err);
    res.status(500).json({ error: 'Error fetching entities' });
  }
});

// Create entity in mastercode
app.post('/api/entities', async (req, res) => {
  console.log('📝 POST /api/entities endpoint called with body:', req.body);
  const { name } = req.body;
  try {
    console.log('🔍 Inserting new entity into mastercode...');
    const result = await db.query(
      "INSERT INTO mastercode (lista, item) VALUES ('Entidad', $1) RETURNING id, item as name",
      [name]
    );
    console.log('✅ Entity created successfully:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creating entity:', err);
    res.status(500).json({ error: 'Error creating entity' });
  }
});

// Update entity
app.put('/api/entities/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  try {
    const r = await db.query(
      "UPDATE mastercode SET item = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND lista = 'Entidad' RETURNING id, item as name",
      [name, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Entity not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error updating entity', err);
    res.status(500).json({ error: 'Error updating entity' });
  }
});

// Delete entity
app.delete('/api/entities/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await db.query("DELETE FROM mastercode WHERE id = $1 AND lista = 'Entidad'", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Entity not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting entity', err);
    res.status(500).json({ error: 'Error deleting entity' });
  }
});

// Backward compatible create
app.post('/api/departments', async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO entities (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating entity', err);
    res.status(500).json({ error: 'Error creating entity' });
  }
});

// ============ POSITIONS ENDPOINTS ============

// Get all positions with department info
// ==================== UNIFIED MASTERCODE API ====================

// Get items by lista type (unified catalog API)
app.get('/api/mastercode/:lista', async (req, res) => {
  const { lista } = req.params;
  console.log(`📝 GET /api/mastercode/${lista} endpoint called`);
  
  try {
    console.log(`🔍 Querying mastercode for lista: ${lista}`);
    const result = await db.query(
      'SELECT id, item as name FROM mastercode WHERE lista = $1 ORDER BY item',
      [lista]
    );
    console.log(`✅ Found ${result.rows.length} items for lista: ${lista}`);
    res.json(result.rows);
  } catch (err) {
    console.error(`❌ Error fetching mastercode for lista ${lista}:`, err);
    res.status(500).json({ error: `Error fetching ${lista}` });
  }
});

// Create item in mastercode
app.post('/api/mastercode/:lista', async (req, res) => {
  const { lista } = req.params;
  const { name } = req.body;
  console.log(`📝 POST /api/mastercode/${lista} endpoint called with body:`, req.body);
  
  try {
    console.log(`🔍 Inserting new item into mastercode for lista: ${lista}`);
    const result = await db.query(
      'INSERT INTO mastercode (lista, item) VALUES ($1, $2) RETURNING id, item as name',
      [lista, name]
    );
    console.log(`✅ Item created successfully for lista ${lista}:`, result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(`❌ Error creating item in mastercode for lista ${lista}:`, err);
    res.status(500).json({ error: `Error creating ${lista}` });
  }
});

// Update item in mastercode
app.put('/api/mastercode/:lista/:id', async (req, res) => {
  const { lista, id } = req.params;
  const { name } = req.body;
  
  try {
    const result = await db.query(
      'UPDATE mastercode SET item = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND lista = $3 RETURNING id, item as name',
      [name, id, lista]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: `${lista} item not found` });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating mastercode item for lista ${lista}:`, err);
    res.status(500).json({ error: `Error updating ${lista}` });
  }
});

// Delete item from mastercode
app.delete('/api/mastercode/:lista/:id', async (req, res) => {
  const { lista, id } = req.params;
  
  try {
    const result = await db.query(
      'DELETE FROM mastercode WHERE id = $1 AND lista = $2',
      [id, lista]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: `${lista} item not found` });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`Error deleting mastercode item for lista ${lista}:`, err);
    res.status(500).json({ error: `Error deleting ${lista}` });
  }
});

// Get células with related projects, OTs, and employee count
app.get('/api/celulas-with-relations', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        mc.id,
        mc.item as name,
        COUNT(DISTINCT p.id) as projects_count,
        COUNT(DISTINCT ow.id) as ots_count,
        COUNT(DISTINCT ev.id) as employees_count,
        ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as proyectos,
        ARRAY_AGG(DISTINCT ow.ot_code) FILTER (WHERE ow.ot_code IS NOT NULL) as ots
      FROM mastercode mc
      LEFT JOIN projects p ON mc.id = p.celula_id
      LEFT JOIN project_ot_relations por ON p.id = por.project_id
      LEFT JOIN orders_of_work ow ON por.ot_id = ow.id
      LEFT JOIN employees_v2 ev ON mc.id = ev.cell_id
      WHERE mc.lista = 'Celulas'
      GROUP BY mc.id, mc.item
      ORDER BY mc.item
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching celulas with relations:', err);
    res.status(500).json({ error: 'Error fetching celulas with relations' });
  }
});

// ==================== BACKWARD COMPATIBLE APIs ====================

// Positions API (now uses mastercode)
app.get('/api/positions', async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, item as name FROM mastercode WHERE lista = 'Puestos roles' ORDER BY item"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching positions', err);
    res.status(500).json({ error: 'Error fetching positions' });
  }
});

// Create position
app.post('/api/positions', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO mastercode (lista, item) VALUES ('Puestos roles', $1) RETURNING id, item as name",
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating position', err);
    res.status(500).json({ error: 'Error creating position' });
  }
});

// Update position
app.put('/api/positions/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  try {
    const r = await db.query(
      "UPDATE mastercode SET item = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND lista = 'Puestos roles' RETURNING id, item as name",
      [name, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Position not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error updating position', err);
    res.status(500).json({ error: 'Error updating position' });
  }
});

// Delete position
app.delete('/api/positions/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await db.query("DELETE FROM mastercode WHERE id = $1 AND lista = 'Puestos roles'", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Position not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting position', err);
    res.status(500).json({ error: 'Error deleting position' });
  }
});

// === ÁREAS ===
app.get('/api/areas', async (req, res) => {
  try {
    const r = await db.query("SELECT id, item as name FROM mastercode WHERE lista = 'Areas' ORDER BY item");
    res.json(r.rows);
  } catch (err) {
    console.error('Error fetching areas', err);
    res.status(500).json({ error: 'Error fetching areas' });
  }
});
app.post('/api/areas', async (req, res) => {
  const { name } = req.body;
  try {
    const r = await db.query("INSERT INTO mastercode (lista, item) VALUES ('Areas', $1) RETURNING id, item as name", [name]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Error creating area', err);
    res.status(500).json({ error: 'Error creating area' });
  }
});

// Update area
app.put('/api/areas/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  try {
    const r = await db.query(
      "UPDATE mastercode SET item = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND lista = 'Areas' RETURNING id, item as name",
      [name, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Area not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error updating area', err);
    res.status(500).json({ error: 'Error updating area' });
  }
});

// Delete area
app.delete('/api/areas/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await db.query("DELETE FROM mastercode WHERE id = $1 AND lista = 'Areas'", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Area not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting area', err);
    res.status(500).json({ error: 'Error deleting area' });
  }
});

// === CÉLULAS ===
app.get('/api/cells', async (req, res) => {
  try {
    const r = await db.query("SELECT id, item as name FROM mastercode WHERE lista = 'Celulas' ORDER BY item");
    res.json(r.rows);
  } catch (err) {
    console.error('Error fetching cells', err);
    res.status(500).json({ error: 'Error fetching cells' });
  }
});
app.post('/api/cells', async (req, res) => {
  const { name } = req.body;
  try {
    const r = await db.query("INSERT INTO mastercode (lista, item) VALUES ('Celulas', $1) RETURNING id, item as name", [name]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Error creating cell', err);
    res.status(500).json({ error: 'Error creating cell' });
  }
});

// Update cell
app.put('/api/cells/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  try {
    const r = await db.query(
      "UPDATE mastercode SET item = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND lista = 'Celulas' RETURNING id, item as name",
      [name, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Cell not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error updating cell', err);
    res.status(500).json({ error: 'Error updating cell' });
  }
});

// Delete cell
app.delete('/api/cells/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await db.query("DELETE FROM mastercode WHERE id = $1 AND lista = 'Celulas'", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Cell not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting cell', err);
    res.status(500).json({ error: 'Error deleting cell' });
  }
});

// ============ EMPLOYEES V2 ENDPOINTS (NORMALIZED) ============

// Create employee (new normalized structure)
app.post('/api/employees-v2', async (req, res) => {
  const {
    first_name, last_name, email, phone, personal_phone,
    employee_code, position_id, entity_id,
    hire_date, start_date, birth_date,
    address, exterior_number, interior_number, colonia, city, state, postal_code, country,
    employment_type, contract_end_date, status, created_by,
    area_id, project_id, cell_id, area, project, cell,
    curp, rfc, nss, passport, gender, marital_status, nationality, blood_type
  } = req.body;

  // Validate email format
  if (email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Use validator for stricter checks; fallback to your regex if preferred
    if (!emailRe.test(String(email))) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email already exists (case-insensitive)
    try {
      const dupe = await db.query(
        `SELECT 1 FROM employees_v2 WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email]
      );
      if (dupe.rowCount > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    } catch (e) {
      console.error('Email existence check failed:', e);
      return res.status(500).json({ error: 'Server error while checking email' });
    }
  }

  try {
    // Resolve entity_id and position_id when names are provided
    let resolvedEntityId = entity_id || req.body.department_id || null;
    let resolvedPositionId = position_id || null;
    let resolvedAreaId = area_id || null;
    let resolvedProjectId = project_id || null;
    let resolvedCellId = cell_id || null;

    if (!resolvedEntityId && (req.body.entity || req.body.department)) {
      resolvedEntityId = await findOrCreateEntity(req.body.entity || req.body.department);
    }

    if (!resolvedPositionId && req.body.position) {
      resolvedPositionId = await findOrCreatePosition(req.body.position, resolvedEntityId);
    }
    if (!resolvedAreaId && (area || req.body.area)) {
      resolvedAreaId = await findOrCreateArea(area || req.body.area);
    }
    if (!resolvedProjectId && (project || req.body.project)) {
      if (!resolvedAreaId && (area || req.body.area)) {
        resolvedAreaId = await findOrCreateArea(area || req.body.area);
      }
      resolvedProjectId = await findOrCreateProject(project || req.body.project, resolvedAreaId);
    }
    if (!resolvedCellId && (cell || req.body.cell)) {
      if (!resolvedAreaId && (area || req.body.area)) {
        resolvedAreaId = await findOrCreateArea(area || req.body.area);
      }
      if (!resolvedProjectId && (project || req.body.project)) {
        resolvedProjectId = await findOrCreateProject(project || req.body.project, resolvedAreaId);
      }
      resolvedCellId = await findOrCreateCell(cell || req.body.cell, resolvedAreaId, resolvedProjectId);
    }

    // Normalize and validate hire_date: don't allow future dates
    const hireDateNormalized = normalizeDateInput(hire_date) || new Date().toISOString().split('T')[0];
    if (isFutureDate(hireDateNormalized)) {
      return res.status(400).json({ error: 'hire_date cannot be a future date' });
    }

    const result = await db.query(
      `INSERT INTO employees_v2 (
        first_name, last_name, email, phone, personal_phone,
        employee_code, position_id, entity_id,
        area_id, project_id, cell_id,
        hire_date, start_date, birth_date,
        address, exterior_number, interior_number, colonia, city, state, postal_code, country,
        employment_type, contract_end_date, status, created_by,
        curp, rfc, nss, passport, gender, marital_status, nationality, blood_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
      RETURNING *`,
      [
        first_name, last_name, email, phone || null, personal_phone || null,
        employee_code || null, resolvedPositionId || null, resolvedEntityId || null,
        resolvedAreaId || null, resolvedProjectId || null, resolvedCellId || null,
        hireDateNormalized, start_date || null, birth_date || null,
        address || null, exterior_number || null, interior_number || null, colonia || null, 
        city || null, state || null, postal_code || null, country || 'Colombia',
        employment_type || 'Permanente', contract_end_date || null,
        status || 'Activo', created_by || 'system',
        curp || null, rfc || null, nss || null, passport || null,
        gender || null, marital_status || null, nationality || null, blood_type || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating employee', err);
    res.status(500).json({ error: 'Error creating employee: ' + err.message });
  }
});

// Get all employees v2 with related info
app.get('/api/employees-v2', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*,
              mp.item as position_name,
              me.item as entity_name,
              ma.item as area_name,
              mpr.item as project_name,
              mc.item as cell_name
       FROM employees_v2 e
       LEFT JOIN mastercode mp ON e.position_id = mp.id AND mp.lista = 'Puestos roles'
       LEFT JOIN mastercode me ON e.entity_id = me.id AND me.lista = 'Entidad'
       LEFT JOIN mastercode ma ON e.area_id = ma.id AND ma.lista = 'Areas'
       LEFT JOIN mastercode mpr ON e.project_id = mpr.id AND mpr.lista = 'Proyecto'
       LEFT JOIN mastercode mc ON e.cell_id = mc.id AND mc.lista = 'Celulas'
       ORDER BY e.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees', err);
    res.status(500).json({ error: 'Error fetching employees' });
  }
});

// Get single employee v2
app.get('/api/employees-v2/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      `SELECT e.*,
              mp.item as position_name,
              me.item as entity_name,
              ma.item as area_name,
              mpr.item as project_name,
              mc.item as cell_name
       FROM employees_v2 e
       LEFT JOIN mastercode mp ON e.position_id = mp.id AND mp.lista = 'Puestos roles'
       LEFT JOIN mastercode me ON e.entity_id = me.id AND me.lista = 'Entidad'
       LEFT JOIN mastercode ma ON e.area_id = ma.id AND ma.lista = 'Areas'
       LEFT JOIN mastercode mpr ON e.project_id = mpr.id AND mpr.lista = 'Proyecto'
       LEFT JOIN mastercode mc ON e.cell_id = mc.id AND mc.lista = 'Celulas'
       WHERE e.id = $1`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching employee', err);
    res.status(500).json({ error: 'Error fetching employee' });
  }
});

// Update employee v2
app.put('/api/employees-v2/:id', async (req, res) => {
  const id = req.params.id;
  const {
    first_name, last_name, email, phone, personal_phone,
    employee_code, position_id, entity_id,
    hire_date, start_date, birth_date,
    address, exterior_number, interior_number, colonia, city, state, postal_code, country,
    employment_type, contract_end_date, status, updated_by,
    area_id, project_id, cell_id, area, project, cell,
    curp, rfc, nss, passport, gender, marital_status, nationality, blood_type
  } = req.body;
  const hireDateNorm = normalizeDateInput(hire_date);
  if (hireDateNorm && isFutureDate(hireDateNorm)) return res.status(400).json({ error: 'hire_date cannot be a future date' });
  const startDateNorm = normalizeDateInput(start_date);
  if (email) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(email))) return res.status(400).json({ error: 'Invalid email format' });
  }
  try {
    let resolvedEntityId = entity_id || req.body.department_id || null;
    let resolvedPositionId = position_id || null;
    let resolvedAreaId = area_id || null;
    let resolvedProjectId = project_id || null;
    let resolvedCellId = cell_id || null;
    if (!resolvedEntityId && (req.body.entity || req.body.department)) {
      resolvedEntityId = await findOrCreateEntity(req.body.entity || req.body.department);
    }
    if (!resolvedPositionId && req.body.position) {
      resolvedPositionId = await findOrCreatePosition(req.body.position, resolvedEntityId);
    }
    if (!resolvedAreaId && (area || req.body.area)) {
      resolvedAreaId = await findOrCreateArea(area || req.body.area);
    }
    if (!resolvedProjectId && (project || req.body.project)) {
      if (!resolvedAreaId && (area || req.body.area)) {
        resolvedAreaId = await findOrCreateArea(area || req.body.area);
      }
      resolvedProjectId = await findOrCreateProject(project || req.body.project, resolvedAreaId);
    }
    if (!resolvedCellId && (cell || req.body.cell)) {
      if (!resolvedAreaId && (area || req.body.area)) {
        resolvedAreaId = await findOrCreateArea(area || req.body.area);
      }
      if (!resolvedProjectId && (project || req.body.project)) {
        resolvedProjectId = await findOrCreateProject(project || req.body.project, resolvedAreaId);
      }
        resolvedCellId = await findOrCreateCell(cell || req.body.cell, resolvedAreaId, resolvedProjectId);
    }
    const result = await db.query(
      `UPDATE employees_v2 SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        personal_phone = COALESCE($5, personal_phone),
        employee_code = COALESCE($6, employee_code),
        position_id = COALESCE($7, position_id),
        entity_id = COALESCE($8, entity_id),
        area_id = COALESCE($9, area_id),
        project_id = COALESCE($10, project_id),
        cell_id = COALESCE($11, cell_id),
        start_date = COALESCE($12, start_date),
        birth_date = COALESCE($13, birth_date),
        address = COALESCE($14, address),
        exterior_number = COALESCE($15, exterior_number),
        interior_number = COALESCE($16, interior_number),
        colonia = COALESCE($17, colonia),
        city = COALESCE($18, city),
        state = COALESCE($19, state),
        postal_code = COALESCE($20, postal_code),
        country = COALESCE($21, country),
        employment_type = COALESCE($22, employment_type),
        contract_end_date = COALESCE($23, contract_end_date),
        status = COALESCE($24, status),
        curp = COALESCE($25, curp),
        rfc = COALESCE($26, rfc),
        nss = COALESCE($27, nss),
        passport = COALESCE($28, passport),
        gender = COALESCE($29, gender),
        marital_status = COALESCE($30, marital_status),
        nationality = COALESCE($31, nationality),
        blood_type = COALESCE($32, blood_type),
        updated_by = $33,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $34
       RETURNING *`,
      [
        first_name, last_name, email, phone, personal_phone,
        employee_code, resolvedPositionId, resolvedEntityId,
        resolvedAreaId, resolvedProjectId, resolvedCellId,
        startDateNorm || start_date || null, birth_date || null,
        address, exterior_number, interior_number, colonia, city, state, postal_code, country,
        employment_type, contract_end_date, status,
        curp, rfc, nss, passport, gender, marital_status, nationality, blood_type,
        updated_by || 'system', id
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating employee', err);
    res.status(500).json({ error: 'Error updating employee' });
  }
});

// Delete employee v2 (soft delete - cambiar estado a Inactivo)
app.delete('/api/employees-v2/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      `UPDATE employees_v2 SET status = 'Inactivo', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, message: 'Employee marked as inactive', employee: result.rows[0] });
  } catch (err) {
    console.error('Error deleting employee', err);
    res.status(500).json({ error: 'Error deleting employee' });
  }
});

// Get salary history for an employee
app.get('/api/employees-v2/:id/salary-history', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      'SELECT * FROM salary_history WHERE employee_id = $1 ORDER BY effective_date DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching salary history', err);
    res.status(500).json({ error: 'Error fetching salary history' });
  }
});

// Add salary record
app.post('/api/employees-v2/:id/salary', async (req, res) => {
  const id = req.params.id;
  const { salary_amount, currency, effective_date, reason, notes, created_by } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO salary_history (employee_id, salary_amount, currency, effective_date, reason, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, salary_amount, currency || 'COP', effective_date, reason || null, notes || null, created_by || 'system']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding salary record', err);
    res.status(500).json({ error: 'Error adding salary record' });
  }
});

// Get emergency contacts for an employee
app.get('/api/employees-v2/:id/emergency-contacts', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      'SELECT * FROM emergency_contacts WHERE employee_id = $1 ORDER BY priority',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching emergency contacts', err);
    res.status(500).json({ error: 'Error fetching emergency contacts' });
  }
});

// Add emergency contact
app.post('/api/employees-v2/:id/emergency-contacts', async (req, res) => {
  const id = req.params.id;
  const { contact_name, relationship, phone, email, address, priority } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO emergency_contacts (employee_id, contact_name, relationship, phone, email, address, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, contact_name, relationship || null, phone, email || null, address || null, priority || 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding emergency contact', err);
    res.status(500).json({ error: 'Error adding emergency contact' });
  }
});

// === INFORMACIÓN BANCARIA ===

// Get employee banking info
app.get('/api/employees-v2/:id/banking', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      `SELECT * FROM employee_banking_info WHERE employee_id = $1 AND is_active = true`,
      [id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error fetching banking info', err);
    res.status(500).json({ error: 'Error fetching banking info' });
  }
});

// Create/Update employee banking info
app.post('/api/employees-v2/:id/banking', async (req, res) => {
  const id = req.params.id;
  const { bank_name, account_holder_name, account_number, clabe_interbancaria } = req.body;
  try {
    // Deactivate existing banking info
    await db.query(
      'UPDATE employee_banking_info SET is_active = false WHERE employee_id = $1',
      [id]
    );
    
    // Insert new banking info
    const result = await db.query(
      `INSERT INTO employee_banking_info (employee_id, bank_name, account_holder_name, account_number, clabe_interbancaria)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, bank_name, account_holder_name, account_number, clabe_interbancaria]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving banking info', err);
    res.status(500).json({ error: 'Error saving banking info' });
  }
});

// === INFORMACIÓN CONTRACTUAL ===

// Get contract schemes (catalog)
app.get('/api/contract-schemes', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM contract_schemes ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching contract schemes', err);
    res.status(500).json({ error: 'Error fetching contract schemes' });
  }
});

// Get contract types (catalog)
app.get('/api/contract-types', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM contract_types ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching contract types', err);
    res.status(500).json({ error: 'Error fetching contract types' });
  }
});

// Get employee contracts
app.get('/api/employees-v2/:id/contracts', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      `SELECT ec.*, ct.name as contract_type_name, cs.name as contract_scheme_name
       FROM employee_contracts ec
       LEFT JOIN contract_types ct ON ec.contract_type_id = ct.id
       LEFT JOIN contract_schemes cs ON ec.contract_scheme_id = cs.id
       WHERE ec.employee_id = $1
       ORDER BY ec.start_date DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching contracts', err);
    res.status(500).json({ error: 'Error fetching contracts' });
  }
});

// Get current active contract
app.get('/api/employees-v2/:id/contracts/current', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      `SELECT ec.*, ct.name as contract_type_name, cs.name as contract_scheme_name
       FROM employee_contracts ec
       LEFT JOIN contract_types ct ON ec.contract_type_id = ct.id
       LEFT JOIN contract_schemes cs ON ec.contract_scheme_id = cs.id
       WHERE ec.employee_id = $1 AND ec.is_active = true
       ORDER BY ec.start_date DESC
       LIMIT 1`,
      [id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error fetching current contract', err);
    res.status(500).json({ error: 'Error fetching current contract' });
  }
});

// Create employee contract
app.post('/api/employees-v2/:id/contracts', async (req, res) => {
  const employee_id = req.params.id;
  const {
    contract_type_id, obra, contract_scheme_id, initial_rate,
    gross_monthly_salary, net_monthly_salary, company_cost,
    start_date, end_date, termination_reason, is_rehireable
  } = req.body;
  
  try {
    // Si se marca como activo, desactivar contratos previos
    if (req.body.is_active) {
      await db.query(
        'UPDATE employee_contracts SET is_active = false WHERE employee_id = $1',
        [employee_id]
      );
    }

    const result = await db.query(
      `INSERT INTO employee_contracts 
       (employee_id, contract_type_id, obra, contract_scheme_id, initial_rate, 
        gross_monthly_salary, net_monthly_salary, company_cost, start_date, 
        end_date, termination_reason, is_rehireable, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [employee_id, contract_type_id, obra, contract_scheme_id, initial_rate,
       gross_monthly_salary, net_monthly_salary, company_cost, start_date,
       end_date, termination_reason, is_rehireable, req.body.is_active || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating contract', err);
    res.status(500).json({ error: 'Error creating contract' });
  }
});

// Update employee contract
app.put('/api/employees-v2/:employeeId/contracts/:contractId', async (req, res) => {
  const { employeeId, contractId } = req.params;
  const {
    contract_type_id, obra, contract_scheme_id, initial_rate,
    gross_monthly_salary, net_monthly_salary, company_cost,
    start_date, end_date, termination_reason, is_rehireable, is_active
  } = req.body;

  try {
    // Si se activa este contrato, desactivar otros
    if (is_active) {
      await db.query(
        'UPDATE employee_contracts SET is_active = false WHERE employee_id = $1 AND id != $2',
        [employeeId, contractId]
      );
    }

    const result = await db.query(
      `UPDATE employee_contracts SET 
       contract_type_id = $1, obra = $2, contract_scheme_id = $3, initial_rate = $4,
       gross_monthly_salary = $5, net_monthly_salary = $6, company_cost = $7,
       start_date = $8, end_date = $9, termination_reason = $10, 
       is_rehireable = $11, is_active = $12, updated_at = CURRENT_TIMESTAMP
       WHERE id = $13 AND employee_id = $14
       RETURNING *`,
      [contract_type_id, obra, contract_scheme_id, initial_rate,
       gross_monthly_salary, net_monthly_salary, company_cost,
       start_date, end_date, termination_reason, is_rehireable, is_active,
       contractId, employeeId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating contract', err);
    res.status(500).json({ error: 'Error updating contract' });
  }
});

// Update employee address
app.put('/api/employees-v2/:id/address', async (req, res) => {
  const id = req.params.id;
  const { address_street, address_city, address_state, address_postal_code, address_country } = req.body;
  
  try {
    const result = await db.query(
      `UPDATE employees_v2 SET 
       address_street = $1, address_city = $2, address_state = $3, 
       address_postal_code = $4, address_country = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [address_street, address_city, address_state, address_postal_code, address_country || 'México', id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating address', err);
    res.status(500).json({ error: 'Error updating address' });
  }
});

// ============================================
// EQUIPMENT API ENDPOINTS
// ============================================

// Get all equipment with employee info
app.get('/api/equipment', async (req, res) => {
  try {
    console.log('📦 Getting equipment list');
    const result = await db.query(`
      SELECT 
        e.*,
        emp.first_name,
        emp.last_name,
        CONCAT(emp.first_name, ' ', emp.last_name) as asignado_nombre
      FROM equipment e
      LEFT JOIN employees_v2 emp ON e.asignado_id = emp.id
      ORDER BY e.codigo
    `);
    
    console.log(`✅ Found ${result.rows.length} equipment items`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching equipment:', err);
    res.status(500).json({ error: 'Error fetching equipment' });
  }
});

// Get single equipment by ID
app.get('/api/equipment/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`
      SELECT 
        e.*,
        emp.first_name,
        emp.last_name,
        CONCAT(emp.first_name, ' ', emp.last_name) as asignado_nombre
      FROM equipment e
      LEFT JOIN employees_v2 emp ON e.asignado_id = emp.id
      WHERE e.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error fetching equipment:', err);
    res.status(500).json({ error: 'Error fetching equipment' });
  }
});

// Create new equipment
app.post('/api/equipment', async (req, res) => {
  try {
    const {
      codigo, nombre, marca, modelo, serie, categoria,
      ubicacion, asignado_id, estado, valor, fecha_compra, observaciones
    } = req.body;
    
    console.log('📦 Creating new equipment:', { codigo, nombre, categoria });
    
    // Validate required fields
    if (!codigo || !nombre || !categoria) {
      return res.status(400).json({ error: 'Required fields: codigo, nombre, categoria' });
    }
    
    // Check if codigo already exists
    const existing = await db.query('SELECT id FROM equipment WHERE codigo = $1', [codigo]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Equipment code already exists' });
    }
    
    const result = await db.query(`
      INSERT INTO equipment (
        codigo, nombre, marca, modelo, serie, categoria,
        ubicacion, asignado_id, estado, valor, fecha_compra, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      codigo, nombre, marca, modelo, serie, categoria,
      ubicacion, asignado_id || null, estado || 'Activo',
      valor || null, fecha_compra || null, observaciones
    ]);
    
    console.log('✅ Equipment created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error creating equipment:', err);
    res.status(500).json({ error: 'Error creating equipment' });
  }
});

// Update equipment
app.put('/api/equipment/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const {
      codigo, nombre, marca, modelo, serie, categoria,
      ubicacion, asignado_id, estado, valor, fecha_compra, observaciones
    } = req.body;
    
    console.log('📦 Updating equipment:', { id, codigo, nombre });
    
    // Validate required fields
    if (!codigo || !nombre || !categoria) {
      return res.status(400).json({ error: 'Required fields: codigo, nombre, categoria' });
    }
    
    // Check if codigo already exists (exclude current record)
    const existing = await db.query('SELECT id FROM equipment WHERE codigo = $1 AND id != $2', [codigo, id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Equipment code already exists' });
    }
    
    const result = await db.query(`
      UPDATE equipment SET
        codigo = $1, nombre = $2, marca = $3, modelo = $4, serie = $5,
        categoria = $6, ubicacion = $7, asignado_id = $8, estado = $9,
        valor = $10, fecha_compra = $11, observaciones = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `, [
      codigo, nombre, marca, modelo, serie, categoria,
      ubicacion, asignado_id || null, estado || 'Activo',
      valor || null, fecha_compra || null, observaciones, id
    ]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    console.log('✅ Equipment updated:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error updating equipment:', err);
    res.status(500).json({ error: 'Error updating equipment' });
  }
});

// Delete equipment
app.delete('/api/equipment/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM equipment WHERE id = $1 RETURNING *', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    console.log('✅ Equipment deleted:', result.rows[0]);
    res.json({ message: 'Equipment deleted successfully', equipment: result.rows[0] });
  } catch (err) {
    console.error('❌ Error deleting equipment:', err);
    res.status(500).json({ error: 'Error deleting equipment' });
  }
});

// ============================================
// VACATION API ENDPOINTS
// ============================================

// Get all vacations
app.get('/api/vacations', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, employee_id, employee_name, start_date, end_date, status, created_at 
       FROM employee_vacations 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching vacations:', err);
    res.status(500).json({ error: 'Error fetching vacations' });
  }
});

// Get single vacation
app.get('/api/vacations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT id, employee_id, employee_name, start_date, end_date, status, created_at 
       FROM employee_vacations 
       WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Vacation not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching vacation:', err);
    res.status(500).json({ error: 'Error fetching vacation' });
  }
});

// Create vacation
app.post('/api/vacations', async (req, res) => {
  const { employee_id, employee_name, start_date, end_date, status } = req.body;
  
  // Validate required fields
  if (!employee_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'Required fields: employee_id, start_date, end_date' });
  }
  
  try {
    const result = await db.query(
      `INSERT INTO employee_vacations (employee_id, employee_name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, employee_id, employee_name, start_date, end_date, status, created_at`,
      [employee_id, employee_name || null, start_date, end_date, status || 'Pendiente']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating vacation:', err);
    res.status(500).json({ error: 'Error creating vacation' });
  }
});

// Update vacation
app.put('/api/vacations/:id', async (req, res) => {
  const { id } = req.params;
  const { employee_id, employee_name, start_date, end_date, status } = req.body;
  
  try {
    const result = await db.query(
      `UPDATE employee_vacations 
       SET employee_id = $1, employee_name = $2, start_date = $3, end_date = $4, status = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, employee_id, employee_name, start_date, end_date, status, created_at`,
      [employee_id || null, employee_name || null, start_date || null, end_date || null, status || 'Pendiente', id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Vacation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating vacation:', err);
    res.status(500).json({ error: 'Error updating vacation' });
  }
});

// Delete vacation
app.delete('/api/vacations/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      `DELETE FROM employee_vacations WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Vacation not found' });
    }
    
    res.json({ success: true, message: 'Vacation deleted successfully' });
  } catch (err) {
    console.error('Error deleting vacation:', err);
    res.status(500).json({ error: 'Error deleting vacation' });
  }
});

// ==================== PROYECTOS ====================

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.id, p.name, p.area_id, p.description, p.created_at, 
              p.start_date, p.end_date, p.status, p.manager_id,
              p.project_manager, p.project_leader, p.cbt_responsible, p.user_assigned,
              p.celula_id, p.costo_asignado,
              mc.item as area_name,
              mc_celula.item as celula_name,
              COALESCE(SUM(ow.costo_ot), 0) as monto_total_ots
       FROM projects p
       LEFT JOIN mastercode mc ON p.area_id = mc.id AND mc.lista = 'Areas'
       LEFT JOIN mastercode mc_celula ON p.celula_id = mc_celula.id AND mc_celula.lista = 'Celulas'
       LEFT JOIN project_ot_relations por ON p.id = por.project_id
       LEFT JOIN orders_of_work ow ON por.ot_id = ow.id
       GROUP BY p.id, p.name, p.area_id, p.description, p.created_at, 
                p.start_date, p.end_date, p.status, p.manager_id,
                p.project_manager, p.project_leader, p.cbt_responsible, p.user_assigned,
                p.celula_id, p.costo_asignado, mc.item, mc_celula.item
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// Get all project assignments (for general assignments view) - MUST BE BEFORE /:id route
app.get('/api/projects/assignments', async (req, res) => {
  try {
    // Primero verificar si columna ot_id existe
    const columnCheck = await db.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'project_assignments' AND column_name = 'ot_id'`
    );
    const hasOtId = columnCheck.rows.length > 0;
    
    const otIdSelect = hasOtId ? 'pa.ot_id,' : 'NULL as ot_id,';
    
    const result = await db.query(
      `SELECT pa.id, pa.project_id, pa.employee_id, ${otIdSelect} pa.role, pa.start_date, pa.end_date, pa.allocation_percentage, pa.rate,
              e.first_name, e.last_name, e.email, e.employee_code,
              p.name as project_name,
              mc_position.item as position,
              mc_area.item as area,
              mc_entity.item as entity,
              CASE 
                WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE THEN true
                ELSE false
              END as is_active,
              CASE
                WHEN pa.end_date IS NULL THEN 'Sin fecha fin'
                WHEN pa.end_date >= CURRENT_DATE THEN 'Activo'
                ELSE 'Finalizado'
              END as status
       FROM project_assignments pa
       INNER JOIN employees_v2 e ON pa.employee_id = e.id
       INNER JOIN projects p ON pa.project_id = p.id
       LEFT JOIN mastercode mc_position ON e.position_id = mc_position.id
       LEFT JOIN mastercode mc_area ON e.area_id = mc_area.id
       LEFT JOIN mastercode mc_entity ON e.entity_id = mc_entity.id
       ORDER BY pa.start_date DESC, e.first_name, e.last_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching all assignments:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Error fetching assignments', details: err.message });
  }
});

// Get project assignments for specific project - MUST BE BEFORE /:id route
app.get('/api/projects/:id/assignments', async (req, res) => {
  const { id } = req.params;
  try {
    // Verificar si columna ot_id existe
    const columnCheck = await db.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'project_assignments' AND column_name = 'ot_id'`
    );
    const hasOtId = columnCheck.rows.length > 0;
    const otIdSelect = hasOtId ? 'pa.ot_id,' : 'NULL as ot_id,';
    
    const result = await db.query(
      `SELECT pa.id, pa.project_id, pa.employee_id, ${otIdSelect} pa.role, pa.start_date, pa.end_date, pa.allocation_percentage, pa.rate,
              e.first_name, e.last_name, e.email, e.employee_code,
              mc_position.item as position,
              mc_area.item as area,
              mc_entity.item as entity,
              CASE 
                WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE THEN true
                ELSE false
              END as is_active,
              CASE
                WHEN pa.end_date IS NULL THEN 'Sin fecha fin'
                WHEN pa.end_date >= CURRENT_DATE THEN 'Activo'
                ELSE 'Finalizado'
              END as status
       FROM project_assignments pa
       INNER JOIN employees_v2 e ON pa.employee_id = e.id
       INNER JOIN projects p ON pa.project_id = p.id
       LEFT JOIN mastercode mc_position ON e.position_id = mc_position.id
       LEFT JOIN mastercode mc_area ON e.area_id = mc_area.id
       LEFT JOIN mastercode mc_entity ON e.entity_id = mc_entity.id
       WHERE pa.project_id = $1
       ORDER BY pa.start_date DESC, e.first_name, e.last_name`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching project assignments:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: 'Error fetching project assignments', details: err.message });
  }
});

// Crear nueva OT para un proyecto
// Crear nueva OT y vincularla a proyecto (M:N con project_ot_relations)
app.post('/api/projects/:projectId/orders-of-work', async (req, res) => {
  const { projectId } = req.params;
  const { 
    ot_code, description, status, start_date, end_date, costo_ot,
    folio_principal_santec, folio_santec,
    tipo_servicio, tecnologia, aplicativo,
    fecha_inicio_santander, fecha_fin_santander, fecha_inicio_proveedor, fecha_fin_proveedor,
    horas_acordadas, semaforo_esfuerzo, semaforo_plazo, lider_delivery,
    autorizacion_rdp, proveedor,
    fecha_inicio_real, fecha_fin_real, fecha_entrega_proveedor, dias_desvio_entrega,
    ambiente, fecha_creacion, fts, estimacion_elab_pruebas,
    costo_hora_servicio_proveedor, monto_servicio_proveedor, monto_servicio_proveedor_iva,
    clase_coste, folio_pds, programa, front_negocio, vobo_front_negocio,
    fecha_vobo_front_negocio, horas, porcentaje_ejecucion
  } = req.body;
  
  console.log('🔍 DEBUG - Creando OT, costo_ot recibido:', costo_ot, 'tipo:', typeof costo_ot);
  
  if (!ot_code) {
    return res.status(400).json({ error: 'Campo ot_code requerido' });
  }
  
  try {
    // 1. Crear la OT (sin project_id, nombre_proyecto, responsable_proyecto, cbt_responsable - eliminados en migración 030)
    const result = await db.query(
      `INSERT INTO orders_of_work (
        ot_code, folio_principal_santec, folio_santec,
        status, description, tipo_servicio, tecnologia, aplicativo,
        fecha_inicio_santander, fecha_fin_santander, fecha_inicio_proveedor, fecha_fin_proveedor,
        horas_acordadas, semaforo_esfuerzo, semaforo_plazo, lider_delivery,
        autorizacion_rdp, proveedor,
        fecha_inicio_real, fecha_fin_real, fecha_entrega_proveedor, dias_desvio_entrega,
        ambiente, fecha_creacion, fts, estimacion_elab_pruebas,
        costo_hora_servicio_proveedor, monto_servicio_proveedor, monto_servicio_proveedor_iva,
        clase_coste, folio_pds, programa, front_negocio, vobo_front_negocio,
        fecha_vobo_front_negocio, horas, porcentaje_ejecucion, start_date, end_date, costo_ot
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, $38, $39, $40
      )
      RETURNING *`,
      [
        ot_code, folio_principal_santec, folio_santec,
        status || 'Pendiente', description, tipo_servicio, tecnologia, aplicativo,
        fecha_inicio_santander, fecha_fin_santander, fecha_inicio_proveedor, fecha_fin_proveedor,
        horas_acordadas, semaforo_esfuerzo, semaforo_plazo, lider_delivery,
        autorizacion_rdp, proveedor,
        fecha_inicio_real, fecha_fin_real, fecha_entrega_proveedor, dias_desvio_entrega,
        ambiente, fecha_creacion, fts, estimacion_elab_pruebas,
        costo_hora_servicio_proveedor, monto_servicio_proveedor, monto_servicio_proveedor_iva,
        clase_coste, folio_pds, programa, front_negocio, vobo_front_negocio,
        fecha_vobo_front_negocio, horas, porcentaje_ejecucion, start_date, end_date, 
        costo_ot !== undefined && costo_ot !== null ? costo_ot : 0
      ]
    );

    const newOT = result.rows[0];

    // 2. Crear relación M:N en project_ot_relations
    await db.query(
      `INSERT INTO project_ot_relations (project_id, ot_id) VALUES ($1, $2)`,
      [projectId, newOT.id]
    );

    res.status(201).json(newOT);
  } catch (err) {
    console.error('Error creating order of work:', err);
    res.status(500).json({ error: 'Error creating order of work', details: err.message });
  }
});

// Vincular OT existente a proyecto (M:N)
app.post('/api/projects/:projectId/link-ot/:otId', async (req, res) => {
  const { projectId, otId } = req.params;
  
  try {
    // Verificar que ambos existan
    const projectCheck = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
    const otCheck = await db.query('SELECT id FROM orders_of_work WHERE id = $1', [otId]);
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    if (otCheck.rows.length === 0) {
      return res.status(404).json({ error: 'OT no encontrada' });
    }

    // Verificar si ya existe la relación
    const existing = await db.query(
      'SELECT id FROM project_ot_relations WHERE project_id = $1 AND ot_id = $2',
      [projectId, otId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'La OT ya está vinculada a este proyecto' });
    }

    // Crear relación
    await db.query(
      'INSERT INTO project_ot_relations (project_id, ot_id) VALUES ($1, $2)',
      [projectId, otId]
    );

    res.status(201).json({ message: 'OT vinculada exitosamente', project_id: projectId, ot_id: otId });
  } catch (err) {
    console.error('Error linking OT to project:', err);
    res.status(500).json({ error: 'Error al vincular OT', details: err.message });
  }
});

// Actualizar OT
app.put('/api/orders-of-work/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Crear la lista de campos a actualizar dinámicamente
  const allowedFields = [
    'ot_code', 'description', 'status', 'start_date', 'end_date',
    'folio_principal_santec', 'folio_santec', 'nombre_proyecto',
    'tipo_servicio', 'tecnologia', 'aplicativo',
    'fecha_inicio_santander', 'fecha_fin_santander', 'fecha_inicio_proveedor', 'fecha_fin_proveedor',
    'horas_acordadas', 'semaforo_esfuerzo', 'semaforo_plazo', 'lider_delivery',
    'autorizacion_rdp', 'responsable_proyecto', 'cbt_responsable', 'proveedor',
    'fecha_inicio_real', 'fecha_fin_real', 'fecha_entrega_proveedor', 'dias_desvio_entrega',
    'ambiente', 'fecha_creacion', 'fts', 'estimacion_elab_pruebas',
    'costo_hora_servicio_proveedor', 'costo_ot', 'monto_servicio_proveedor', 'monto_servicio_proveedor_iva',
    'clase_coste', 'folio_pds', 'programa', 'front_negocio', 'vobo_front_negocio',
    'fecha_vobo_front_negocio', 'horas', 'porcentaje_ejecucion'
  ];
  
  const setFields = [];
  const values = [id];
  let paramIndex = 2;
  
  for (const field of allowedFields) {
    if (updates.hasOwnProperty(field)) {
      setFields.push(`${field} = $${paramIndex}`);
      values.push(updates[field]);
      paramIndex++;
    }
  }
  
  if (setFields.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }
  
  setFields.push('updated_at = CURRENT_TIMESTAMP');
  
  try {
    const query = `UPDATE orders_of_work SET ${setFields.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(query, values);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'OT no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating order of work:', err);
    res.status(500).json({ error: 'Error updating order of work', details: err.message });
  }
});

// Eliminar OT
app.delete('/api/orders-of-work/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM orders_of_work WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'OT no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting order of work:', err);
    res.status(500).json({ error: 'Error deleting order of work' });
  }
});

// Listar todas las OTs
// Listar todas las OTs con sus proyectos (relación M:N)
// Cada fila representa una relación OT × Proyecto
app.get('/api/orders-of-work', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ow.*,
        p.id as project_id,
        p.name as project_name,
        p.project_manager as responsable_proyecto,
        p.cbt_responsible as cbt_responsable,
        p.start_date as project_start_date,
        p.end_date as project_end_date,
        mc.item as celula_name,
        por.id as relation_id,
        por.created_at as relation_created_at
      FROM orders_of_work ow
      LEFT JOIN project_ot_relations por ON ow.id = por.ot_id
      LEFT JOIN projects p ON por.project_id = p.id
      LEFT JOIN mastercode mc ON p.celula_id = mc.id AND mc.lista = 'Celulas'
      ORDER BY ow.created_at DESC, p.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching orders of work:', err);
    res.status(500).json({ error: 'Error fetching orders of work' });
  }
});

// Listar OTs por proyecto (usando tabla intermedia)
app.get('/api/projects/:projectId/orders-of-work', async (req, res) => {
  const { projectId } = req.params;
  try {
    const result = await db.query(`
      SELECT 
        ow.*,
        por.id as relation_id,
        por.created_at as relation_created_at
      FROM orders_of_work ow
      INNER JOIN project_ot_relations por ON ow.id = por.ot_id
      WHERE por.project_id = $1 
      ORDER BY ow.created_at DESC
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching project orders:', err);
    res.status(500).json({ error: 'Error fetching project orders' });
  }
});

// Importación masiva de OTs desde CSV/Excel con lógica M:N
app.post('/api/orders-of-work/import', async (req, res) => {
  const { orders, createProjectsIfNotExist = true } = req.body;
  
  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de órdenes de trabajo' });
  }

  const results = { 
    success: [], 
    failed: [], 
    warnings: [],
    duplicatesInFile: [],
    skipped: [], // OTs que ya existen y no se modifican
    updated: []  // OTs que ya existen y se actualiza solo el estado
  };

  // Helper: Encontrar o crear proyecto
  async function findOrCreateProject(projectName, projectData = {}) {
    if (!projectName || projectName.trim() === '') {
      return null;
    }

    // Buscar proyecto existente por nombre (case-insensitive)
    const existing = await db.query(
      `SELECT id, name FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [projectName.trim()]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Si no existe y está habilitado crear proyectos
    if (createProjectsIfNotExist) {
      const currentYear = new Date().getFullYear();
      const defaultStartDate = `${currentYear}-01-02`;
      const defaultEndDate = `${currentYear}-12-31`;

      const newProject = await db.query(
        `INSERT INTO projects (
          name, 
          start_date, 
          end_date, 
          status,
          project_manager,
          cbt_responsible,
          project_leader,
          description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          projectName.trim(),
          projectData.start_date || defaultStartDate,
          projectData.end_date || defaultEndDate,
          projectData.status || 'Activo',
          projectData.project_manager || null,
          projectData.cbt_responsible || null,
          projectData.project_leader || null,
          projectData.description || `Proyecto creado automáticamente desde importación de OT`
        ]
      );

      return newProject.rows[0];
    }

    return null;
  }

  // Detectar duplicados dentro del archivo
  const otCodesInFile = {};
  orders.forEach((order, index) => {
    const code = order.ot_code?.trim();
    if (code) {
      if (!otCodesInFile[code]) {
        otCodesInFile[code] = [];
      }
      otCodesInFile[code].push({ index, projectName: order.nombre_proyecto });
    }
  });

  // Identificar duplicados
  Object.keys(otCodesInFile).forEach(code => {
    if (otCodesInFile[code].length > 1) {
      results.duplicatesInFile.push({
        ot_code: code,
        occurrences: otCodesInFile[code].length,
        projects: otCodesInFile[code].map(o => o.projectName),
        message: `OT duplicada en el archivo: se creará 1 OT con ${otCodesInFile[code].length} proyectos`
      });
    }
  });

  try {
    // Procesar cada OT del archivo
    const processedOTs = new Map(); // Mapeo de ot_code -> ot_id para evitar duplicados
    const processedOTProjects = new Set(); // Set para evitar duplicar relación OT-Proyecto

    for (const order of orders) {
      const { 
        ot_code,
        nombre_proyecto,
        status,
        description,
        tipo_servicio,
        tecnologia,
        aplicativo,
        fecha_inicio_santander,
        fecha_fin_santander,
        fecha_inicio_proveedor,
        fecha_fin_proveedor,
        horas_acordadas,
        semaforo_esfuerzo,
        semaforo_plazo,
        lider_delivery,
        autorizacion_rdp,
        proveedor,
        fecha_inicio_real,
        fecha_fin_real,
        fecha_entrega_proveedor,
        dias_desvio_entrega,
        ambiente,
        fecha_creacion,
        fts,
        estimacion_elab_pruebas,
        costo_hora_servicio_proveedor,
        monto_servicio_proveedor,
        monto_servicio_proveedor_iva,
        clase_coste,
        folio_pds,
        programa,
        front_negocio,
        vobo_front_negocio,
        fecha_vobo_front_negocio,
        horas,
        porcentaje_ejecucion,
        folio_principal_santec,
        folio_santec,
        costo_ot, // Opcional - costo de la OT desde Excel
        // Datos del proyecto
        responsable_proyecto,
        cbt_responsable,
        project_leader
      } = order;

      // Validar campos requeridos
      if (!ot_code || !ot_code.trim()) {
        results.failed.push({ order, error: 'Número OT es requerido' });
        continue;
      }

      const otCodeTrimmed = ot_code.trim();

      try {
        // 1. Verificar si la OT ya existe en la BD
        const existingOT = await db.query(
          `SELECT id, ot_code, status FROM orders_of_work WHERE LOWER(ot_code) = LOWER($1) LIMIT 1`,
          [otCodeTrimmed]
        );

        let otId;
        let isNewOT = false;
        let statusChanged = false;

        if (existingOT.rows.length > 0) {
          // OT YA EXISTE
          otId = existingOT.rows[0].id;
          const currentStatus = existingOT.rows[0].status;

          // Verificar si el estado cambió
          if (status && status !== currentStatus) {
            // Actualizar solo el estado
            await db.query(
              `UPDATE orders_of_work SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [status, otId]
            );
            statusChanged = true;
            results.updated.push({
              ot_code: otCodeTrimmed,
              old_status: currentStatus,
              new_status: status,
              message: 'OT existente - estado actualizado'
            });
          } else {
            // OT existe y no hay cambios - NO procesar proyecto
            // Solo añadir a skipped una vez (sin duplicar)
            if (!processedOTs.has(otCodeTrimmed.toLowerCase())) {
              results.skipped.push({
                ot_code: otCodeTrimmed,
                message: 'OT ya existe con las mismas propiedades'
              });
            }
            // Marcar como procesada para evitar duplicados
            processedOTs.set(otCodeTrimmed.toLowerCase(), otId);
            // IMPORTANTE: NO continuar con el procesamiento de proyecto
            continue;
          }

          // Marcar como procesada (evitar crear duplicados en mismo archivo)
          processedOTs.set(otCodeTrimmed.toLowerCase(), otId);

        } else {
          // OT NO EXISTE - Crear nueva OT (solo si no fue procesada en este mismo archivo)
          if (processedOTs.has(otCodeTrimmed.toLowerCase())) {
            otId = processedOTs.get(otCodeTrimmed.toLowerCase());
          } else {
            const insertResult = await db.query(`
              INSERT INTO orders_of_work (
                ot_code, folio_principal_santec, folio_santec,
                status, description, tipo_servicio, tecnologia, aplicativo,
                fecha_inicio_santander, fecha_fin_santander, fecha_inicio_proveedor, fecha_fin_proveedor,
                horas_acordadas, semaforo_esfuerzo, semaforo_plazo, lider_delivery,
                autorizacion_rdp, proveedor,
                fecha_inicio_real, fecha_fin_real, fecha_entrega_proveedor, dias_desvio_entrega,
                ambiente, fecha_creacion, fts, estimacion_elab_pruebas,
                costo_hora_servicio_proveedor, monto_servicio_proveedor, monto_servicio_proveedor_iva,
                clase_coste, folio_pds, programa, front_negocio, vobo_front_negocio,
                fecha_vobo_front_negocio, horas, porcentaje_ejecucion, costo_ot
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35, $36, $37, $38
              )
              RETURNING *
            `, [
              otCodeTrimmed, folio_principal_santec, folio_santec,
              status || 'Pendiente', description, tipo_servicio, tecnologia, aplicativo,
              fecha_inicio_santander, fecha_fin_santander, fecha_inicio_proveedor, fecha_fin_proveedor,
              horas_acordadas, semaforo_esfuerzo, semaforo_plazo, lider_delivery,
              autorizacion_rdp, proveedor,
              fecha_inicio_real, fecha_fin_real, fecha_entrega_proveedor, dias_desvio_entrega,
              ambiente, fecha_creacion, fts, estimacion_elab_pruebas,
              costo_hora_servicio_proveedor, monto_servicio_proveedor, monto_servicio_proveedor_iva,
              clase_coste, folio_pds, programa, front_negocio, vobo_front_negocio,
              fecha_vobo_front_negocio, horas, porcentaje_ejecucion, 
              costo_ot || null // Opcional - puede venir o no desde Excel
            ]);

            otId = insertResult.rows[0].id;
            isNewOT = true;
            processedOTs.set(otCodeTrimmed.toLowerCase(), otId);
          }
        }

        // 2. Procesar el proyecto (encontrar, usar existente, o crear)
        let project = null;
        
        // PRIORIDAD 1: Si el usuario seleccionó un proyecto existente del dropdown
        if (order.useExistingProject && order.existingProjectId) {
          const existingProjectQuery = await db.query(
            `SELECT id, name FROM projects WHERE id = $1`,
            [order.existingProjectId]
          );
          
          if (existingProjectQuery.rows.length > 0) {
            project = existingProjectQuery.rows[0];
          } else {
            results.warnings.push({
              ot_code: otCodeTrimmed,
              warning: `Proyecto con ID ${order.existingProjectId} no encontrado`
            });
          }
        } 
        // PRIORIDAD 2: Si debe crear un proyecto nuevo
        else if (nombre_proyecto && order.createNewProject !== false) {
          project = await findOrCreateProject(nombre_proyecto, {
            project_manager: responsable_proyecto,
            cbt_responsible: cbt_responsable,
            project_leader: project_leader
          });
        }
        // PRIORIDAD 3: No crear ni vincular (checkbox desactivado)
        else if (order.createNewProject === false) {
          results.warnings.push({
            ot_code: otCodeTrimmed,
            warning: 'OT creada sin proyecto (creación desactivada por usuario)'
          });
        }

        if (project) {
          // Validar que esta combinación OT-Proyecto no se haya procesado ya en este batch
          const otProjectKey = `${otId}|${project.id}`;
          
          if (processedOTProjects.has(otProjectKey)) {
            // Ya se procesó esta combinación en este batch - omitir
            results.warnings.push({
              ot_code: otCodeTrimmed,
              warning: `Relación OT-Proyecto duplicada en el archivo (OT: ${otCodeTrimmed}, Proyecto: ${project.name})`
            });
          } else {
            // 3. Vincular OT con Proyecto (si no existe la relación en BD)
            const existingRelation = await db.query(
              `SELECT id FROM project_ot_relations WHERE project_id = $1 AND ot_id = $2`,
              [project.id, otId]
            );

            if (existingRelation.rows.length === 0) {
              await db.query(
                `INSERT INTO project_ot_relations (project_id, ot_id) VALUES ($1, $2)`,
                [project.id, otId]
              );

              results.success.push({
                ot_code: otCodeTrimmed,
                ot_id: otId,
                project_id: project.id,
                project_name: project.name,
                action: isNewOT ? 'created' : (statusChanged ? 'updated' : 'linked'),
                message: isNewOT ? 'OT creada y vinculada' : (statusChanged ? 'OT actualizada y vinculada' : 'OT existente vinculada a proyecto')
              });
              
              // Marcar esta combinación como procesada
              processedOTProjects.add(otProjectKey);
            } else {
              // Relación ya existe en BD
              if (!isNewOT && !statusChanged) {
                // Ya estaba registrado en results.skipped
              } else {
                results.warnings.push({
                  ot_code: otCodeTrimmed,
                  warning: `OT ya vinculada al proyecto "${project.name}"`
                });
              }
            }
          }
        } else if (nombre_proyecto && !order.useExistingProject && order.createNewProject !== false) {
          // Solo advertir si esperaba crear proyecto pero no pudo
          results.warnings.push({
            ot_code: otCodeTrimmed,
            warning: `Proyecto "${nombre_proyecto}" no encontrado y createProjectsIfNotExist = false`
          });
        }

      } catch (dbErr) {
        console.error('Error processing order:', dbErr);
        results.failed.push({ 
          ot_code: otCodeTrimmed, 
          order, 
          error: dbErr.message 
        });
      }
    }

    res.json({
      message: `Importación completada: ${results.success.length} exitosas, ${results.failed.length} fallidas, ${results.updated.length} actualizadas, ${results.skipped.length} omitidas`,
      summary: {
        created: results.success.filter(s => s.action === 'created').length,
        linked: results.success.filter(s => s.action === 'linked').length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        warnings: results.warnings.length,
        duplicatesInFile: results.duplicatesInFile.length
      },
      results
    });
  } catch (err) {
    console.error('Error in bulk import:', err);
    res.status(500).json({ error: 'Error en importación masiva', details: err.message });
  }
});

// Get single project
app.get('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT p.id, p.name, p.area_id, p.description, p.created_at,
              p.start_date, p.end_date, p.status, p.manager_id,
              p.project_manager, p.project_leader, p.cbt_responsible, p.user_assigned,
              mc.item as area_name
       FROM projects p
       LEFT JOIN mastercode mc ON p.area_id = mc.id AND mc.lista = 'Areas'
       WHERE p.id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'Error fetching project' });
  }
});

// Create project
app.post('/api/projects', async (req, res) => {
  const { 
    name, description, area_id, start_date, end_date, status, manager_id,
    project_manager, project_leader, cbt_responsible, user_assigned,
    celula_id, costo_asignado
  } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Required field: name' });
  }
  
  if (!start_date) {
    return res.status(400).json({ error: 'Required field: start_date' });
  }
  
  try {
    const result = await db.query(
      `INSERT INTO projects (
        name, area_id, description, start_date, end_date, status, manager_id,
        project_manager, project_leader, cbt_responsible, user_assigned,
        celula_id, costo_asignado
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, name, area_id, description, start_date, end_date, status, manager_id,
                 project_manager, project_leader, cbt_responsible, user_assigned,
                 celula_id, costo_asignado, created_at`,
      [
        name, 
        area_id || null, 
        description || null, 
        start_date,
        end_date || null,
        status || 'Planificación',
        manager_id || null,
        project_manager || null,
        project_leader || null,
        cbt_responsible || null,
        user_assigned || null,
        celula_id || null,
        costo_asignado || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Error creating project', details: err.message });
  }
});

// Update project
app.put('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, description, area_id, start_date, end_date, status, manager_id,
    project_manager, project_leader, cbt_responsible, user_assigned,
    celula_id, costo_asignado
  } = req.body;
  
  try {
    const result = await db.query(
      `UPDATE projects 
       SET name = COALESCE($1, name), 
           area_id = COALESCE($2, area_id), 
           description = COALESCE($3, description),
           start_date = COALESCE($4, start_date),
           end_date = $5,
           status = COALESCE($6, status),
           manager_id = $7,
           project_manager = $8,
           project_leader = $9,
           cbt_responsible = $10,
           user_assigned = $11,
           celula_id = $12,
           costo_asignado = $13
       WHERE id = $14
       RETURNING id, name, area_id, description, start_date, end_date, status, manager_id,
                 project_manager, project_leader, cbt_responsible, user_assigned,
                 celula_id, costo_asignado, created_at`,
      [
        name || null, 
        area_id || null, 
        description || null,
        start_date || null,
        end_date || null,
        status || null,
        manager_id || null,
        project_manager || null,
        project_leader || null,
        cbt_responsible || null,
        user_assigned || null,
        celula_id || null,
        costo_asignado || null,
        id
      ]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Error updating project', details: err.message });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM projects WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Error deleting project' });
  }
});

// Add employee to project
app.post('/api/projects/:id/assignments', async (req, res) => {
  const { id } = req.params;
  const { employee_id, ot_id, role, start_date, end_date, allocation_percentage, rate } = req.body;
  
  console.log('🔍 Creating assignment:', { employee_id, project_id: id, ot_id, role });
  
  if (!employee_id) {
    return res.status(400).json({ error: 'Required field: employee_id' });
  }
  
  try {
    // VALIDACIÓN: Verificar que el empleado no tenga asignaciones activas
    const activeAssignments = await db.query(
      `SELECT pa.id, p.name as project_name, pa.start_date, pa.end_date
       FROM project_assignments pa
       INNER JOIN projects p ON pa.project_id = p.id
       WHERE pa.employee_id = $1 
       AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)`,
      [employee_id]
    );
    
    if (activeAssignments.rowCount > 0) {
      const activeProject = activeAssignments.rows[0];
      return res.status(409).json({ 
        error: 'El empleado ya tiene una asignación activa',
        details: {
          message: `El empleado ya está asignado al proyecto "${activeProject.project_name}"`,
          conflicting_assignment: {
            project_name: activeProject.project_name,
            start_date: activeProject.start_date,
            end_date: activeProject.end_date
          }
        }
      });
    }
    
    // Si no hay conflictos, proceder con la asignación
    const result = await db.query(
      `INSERT INTO project_assignments (project_id, employee_id, ot_id, role, start_date, end_date, allocation_percentage, rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, project_id, employee_id, ot_id, role, start_date, end_date, allocation_percentage, rate, created_at`,
      [id, employee_id, ot_id || null, role || null, start_date || null, end_date || null, allocation_percentage || 100, rate || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating project assignment:', err);
    res.status(500).json({ error: 'Error creating project assignment' });
  }
});

// Update project assignment
app.put('/api/projects/assignments/:assignmentId', async (req, res) => {
  const { assignmentId } = req.params;
  const { ot_id, role, start_date, end_date, allocation_percentage, rate } = req.body;
  
  try {
    const result = await db.query(
      `UPDATE project_assignments 
       SET ot_id = COALESCE($1, ot_id),
           role = COALESCE($2, role),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date),
           allocation_percentage = COALESCE($5, allocation_percentage),
           rate = COALESCE($6, rate)
       WHERE id = $7
       RETURNING *`,
      [ot_id, role, start_date, end_date, allocation_percentage, rate, assignmentId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating assignment:', err);
    res.status(500).json({ error: 'Error updating assignment' });
  }
});

// Remove employee from project
app.delete('/api/projects/:projectId/assignments/:assignmentId', async (req, res) => {
  const { assignmentId } = req.params;
  try {
    const result = await db.query('DELETE FROM project_assignments WHERE id = $1', [assignmentId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json({ success: true, message: 'Assignment deleted successfully' });
  } catch (err) {
    console.error('Error deleting assignment:', err);
    res.status(500).json({ error: 'Error deleting assignment' });
  }
});

// Get assignments by employee (project history)
app.get('/api/employees/:id/assignments', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT 
        pa.id,
        pa.project_id,
        pa.ot_id,
        p.name as project_name,
        p.description as project_description,
        ow.ot_code,
        ow.description as ot_description,
        mc_celula.item as celula_name,
        pa.role as role_in_project,
        pa.start_date,
        pa.end_date,
        pa.allocation_percentage,
        pa.rate,
        CASE 
          WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE THEN true 
          ELSE false 
        END as is_active,
        pa.created_at
      FROM project_assignments pa
      INNER JOIN projects p ON pa.project_id = p.id
      LEFT JOIN orders_of_work ow ON pa.ot_id = ow.id
      LEFT JOIN mastercode mc_celula ON p.celula_id = mc_celula.id AND mc_celula.lista = 'Celulas'
      WHERE pa.employee_id = $1
      ORDER BY pa.start_date DESC`,
      [id]
    );
    
    // Calculate summary
    const activeAssignments = result.rows.filter(a => a.is_active);
    const completedAssignments = result.rows.filter(a => !a.is_active);
    const totalAllocation = result.rows.reduce((sum, a) => sum + (parseFloat(a.allocation_percentage) || 0), 0);
    const activeAllocation = activeAssignments.reduce((sum, a) => sum + (parseFloat(a.allocation_percentage) || 0), 0);
    
    res.json({
      assignments: result.rows,
      summary: {
        total_projects: result.rows.length,
        active_projects: activeAssignments.length,
        completed_projects: completedAssignments.length,
        total_allocation: totalAllocation,
        active_allocation: activeAllocation,
        average_allocation: result.rows.length > 0 ? (totalAllocation / result.rows.length).toFixed(2) : 0
      }
    });
  } catch (err) {
    console.error('Error fetching employee assignments:', err);
    res.status(500).json({ error: 'Error fetching employee assignments' });
  }
});

// Get unassigned employees (resources on bench)
app.get('/api/employees/unassigned', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        e.id,
        CONCAT(e.first_name, ' ', e.last_name) as nombre_completo,
        e.email,
        e.status,
        pos.item as position_name,
        area.item as area_name,
        ent.item as entity_name,
        MAX(pa.end_date) as last_assignment_end,
        CASE 
          WHEN MAX(pa.end_date) IS NOT NULL 
          THEN CURRENT_DATE - MAX(pa.end_date) 
          ELSE NULL 
        END as days_without_project
      FROM employees_v2 e
      LEFT JOIN mastercode pos ON e.position_id = pos.id
      LEFT JOIN mastercode area ON e.area_id = area.id
      LEFT JOIN mastercode ent ON e.entity_id = ent.id
      LEFT JOIN project_assignments pa ON e.id = pa.employee_id
      WHERE e.status = 'Activo'
      GROUP BY e.id, e.first_name, e.last_name, e.email, e.status, pos.item, area.item, ent.item
      HAVING COUNT(CASE 
        WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
        THEN 1 
      END) = 0
      ORDER BY last_assignment_end DESC NULLS LAST`,
      []
    );
    
    res.json({
      bench_resources: result.rows,
      total_available: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching unassigned employees:', err);
    res.status(500).json({ error: 'Error fetching unassigned employees' });
  }
});

// ========== REPORTES ==========

// Reporte: Recursos agrupados por Proyecto
app.get('/api/reports/resources-by-project', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.id as project_id,
        p.name as project_name,
        p.area_id,
        mc_area.item as area_name,
        COUNT(DISTINCT pa.employee_id) as total_resources,
        COUNT(DISTINCT CASE 
          WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
          THEN pa.employee_id 
        END) as active_resources,
        COALESCE(SUM(CASE 
          WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
          THEN pa.allocation_percentage 
        END), 0) as total_active_allocation,
        json_agg(
          json_build_object(
            'employee_id', e.id,
            'employee_name', e.first_name || ' ' || e.last_name,
            'position', mc_position.item,
            'role', pa.role,
            'start_date', pa.start_date,
            'end_date', pa.end_date,
            'allocation_percentage', pa.allocation_percentage,
            'is_active', CASE 
              WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
              THEN true 
              ELSE false 
            END
          ) ORDER BY pa.start_date DESC
        ) as resources
       FROM projects p
       LEFT JOIN mastercode mc_area ON p.area_id = mc_area.id AND mc_area.lista = 'Areas'
       LEFT JOIN project_assignments pa ON p.id = pa.project_id
       LEFT JOIN employees_v2 e ON pa.employee_id = e.id
       LEFT JOIN mastercode mc_position ON e.position_id = mc_position.id
       GROUP BY p.id, p.name, p.area_id, mc_area.item
       ORDER BY p.name`
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching resources by project report:', err);
    res.status(500).json({ error: 'Error generating report' });
  }
});

// Reporte: Proyectos agrupados por Recurso
app.get('/api/reports/projects-by-resource', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        e.employee_code,
        mc_position.item as position,
        mc_area.item as area,
        mc_entity.item as entity,
        e.status as employee_status,
        COUNT(DISTINCT pa.project_id) as total_projects,
        COUNT(DISTINCT CASE 
          WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
          THEN pa.project_id 
        END) as active_projects,
        COALESCE(SUM(CASE 
          WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
          THEN pa.allocation_percentage 
        END), 0) as total_active_allocation,
        json_agg(
          json_build_object(
            'project_id', p.id,
            'project_name', p.name,
            'role', pa.role,
            'start_date', pa.start_date,
            'end_date', pa.end_date,
            'allocation_percentage', pa.allocation_percentage,
            'is_active', CASE 
              WHEN pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE 
              THEN true 
              ELSE false 
            END
          ) ORDER BY pa.start_date DESC
        ) FILTER (WHERE pa.id IS NOT NULL) as projects
       FROM employees_v2 e
       LEFT JOIN project_assignments pa ON e.id = pa.employee_id
       LEFT JOIN projects p ON pa.project_id = p.id
       LEFT JOIN mastercode mc_position ON e.position_id = mc_position.id
       LEFT JOIN mastercode mc_area ON e.area_id = mc_area.id
       LEFT JOIN mastercode mc_entity ON e.entity_id = mc_entity.id
       WHERE e.status = 'Activo'
       GROUP BY e.id, e.first_name, e.last_name, e.employee_code, 
                mc_position.item, mc_area.item, mc_entity.item, e.status
       ORDER BY employee_name`
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching projects by resource report:', err);
    res.status(500).json({ error: 'Error generating report' });
  }
});

// Reporte: Resumen general de asignaciones
app.get('/api/reports/assignment-summary', async (req, res) => {
  try {
    const summary = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM employees_v2 WHERE status = 'Activo') as total_active_employees,
        (SELECT COUNT(*) FROM projects) as total_active_projects,
        (SELECT COUNT(DISTINCT employee_id) FROM project_assignments 
         WHERE end_date IS NULL OR end_date >= CURRENT_DATE) as employees_with_active_assignments,
        (SELECT COUNT(DISTINCT project_id) FROM project_assignments 
         WHERE end_date IS NULL OR end_date >= CURRENT_DATE) as projects_with_active_assignments,
        (SELECT COUNT(*) FROM employees_v2 e
         WHERE e.status = 'Activo' 
         AND NOT EXISTS (
           SELECT 1 FROM project_assignments pa 
           WHERE pa.employee_id = e.id 
           AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
         )) as employees_in_bench,
        (SELECT COALESCE(SUM(allocation_percentage), 0) FROM project_assignments
         WHERE end_date IS NULL OR end_date >= CURRENT_DATE) as total_active_allocation`
    );
    
    // Proyectos con más recursos
    const topProjects = await db.query(
      `SELECT p.name, COUNT(DISTINCT pa.employee_id) as resource_count
       FROM projects p
       INNER JOIN project_assignments pa ON p.id = pa.project_id
       WHERE pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE
       GROUP BY p.id, p.name
       ORDER BY resource_count DESC
       LIMIT 5`
    );
    
    // Recursos más activos
    const topResources = await db.query(
      `SELECT 
        e.first_name || ' ' || e.last_name as employee_name,
        COUNT(DISTINCT pa.project_id) as project_count,
        COALESCE(SUM(pa.allocation_percentage), 0) as total_allocation
       FROM employees_v2 e
       INNER JOIN project_assignments pa ON e.id = pa.employee_id
       WHERE pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE
       GROUP BY e.id, e.first_name, e.last_name
       ORDER BY total_allocation DESC
       LIMIT 5`
    );
    
    res.json({
      summary: summary.rows[0],
      top_projects: topProjects.rows,
      top_resources: topResources.rows
    });
  } catch (err) {
    console.error('Error fetching assignment summary:', err);
    res.status(500).json({ error: 'Error generating summary' });
  }
});

// ============ JOB OPENINGS (VACANTES) ENDPOINTS ============

// Get all job openings
app.get('/api/job-openings', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM job_openings WHERE status != 'Deleted' ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching job openings:', err);
    res.status(500).json({ error: 'Error fetching job openings' });
  }
});

// Get single job opening
app.get('/api/job-openings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM job_openings WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Job opening not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching job opening:', err);
    res.status(500).json({ error: 'Error fetching job opening' });
  }
});

// Create job opening
app.post('/api/job-openings', uploadJobFile.single('file'), async (req, res) => {
  // Si viene FormData con archivo, los datos vienen en req.body.data
  let bodyData = req.body;
  if (req.body.data) {
    try {
      bodyData = JSON.parse(req.body.data);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
  }

  const {
    // Sección 1: Datos para envío
    company, contact_person_name, contact_email, celula_id, area_id, cell_area, office_location, work_modality, salary,
    // Sección 2: Perfil
    position_name, role, years_experience, technical_tools, basic_knowledge, desirable_code,
    // Metadatos
    status, created_by,
    // Contactos comerciales
    commercial_contacts
  } = bodyData;

  // Validate required fields
  if (!company || !contact_person_name || !contact_email || !position_name) {
    return res.status(400).json({
      error: 'Required fields: company, contact_person_name, contact_email, position_name'
    });
  }

  // Get file URL if uploaded
  const fileUrl = req.file ? `/uploads/job-openings/${req.file.filename}` : null;

  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Crear la vacante
    const jobResult = await client.query(
      `INSERT INTO job_openings (
        company, contact_person_name, contact_email, celula_id, area_id, cell_area, office_location, work_modality, salary,
        position_name, role, years_experience, technical_tools, basic_knowledge, desirable_code,
        status, created_by, file_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        company, contact_person_name, contact_email, celula_id || null, area_id || null, cell_area || null, office_location || null,
        work_modality || null, salary || null,
        position_name, role || null, years_experience || null, technical_tools || null,
        basic_knowledge || null, desirable_code || null,
        status || 'Activa', created_by || 'system', fileUrl
      ]
    );
    
    const jobOpening = jobResult.rows[0];
    
    // Insertar contactos comerciales si los hay
    if (commercial_contacts && Array.isArray(commercial_contacts) && commercial_contacts.length > 0) {
      for (const contact of commercial_contacts) {
        if (contact.full_name && contact.email) {
          await client.query(
            `INSERT INTO commercial_contacts (job_opening_id, full_name, email, phone, location)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              jobOpening.id,
              contact.full_name,
              contact.email.toLowerCase(),
              contact.phone || null,
              contact.location || null
            ]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    res.status(201).json(jobOpening);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating job opening:', err);
    res.status(500).json({ error: 'Error creating job opening' });
  } finally {
    client.release();
  }
});

// TEMPORAL: Debug endpoint para verificar costos de OTs
app.get('/api/debug/ot-costs', async (req, res) => {
  try {
    // Ver proyectos recientes
    const projects = await db.query(`SELECT id, name FROM projects ORDER BY id DESC LIMIT 5`);
    
    // Ver relaciones y costos
    const relations = await db.query(`
      SELECT por.project_id, por.ot_id, ow.ot_code, ow.costo_ot
      FROM project_ot_relations por
      LEFT JOIN orders_of_work ow ON por.ot_id = ow.id
      ORDER BY por.project_id DESC
      LIMIT 20
    `);
    
    // Ver OTs recientes
    const ots = await db.query(`
      SELECT id, ot_code, costo_ot FROM orders_of_work ORDER BY id DESC LIMIT 10
    `);
    
    res.json({
      projects: projects.rows,
      relations: relations.rows,
      recent_ots: ots.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEMPORAL: Fix NULL costo_ot
app.post('/api/debug/fix-null-costs', async (req, res) => {
  try {
    // Actualizar todos los NULL a 0
    const result = await db.query(`
      UPDATE orders_of_work 
      SET costo_ot = 0 
      WHERE costo_ot IS NULL
    `);
    
    // Verificar el resultado
    const stats = await db.query(`
      SELECT COUNT(*) as total_ots, 
             SUM(CASE WHEN costo_ot IS NULL THEN 1 ELSE 0 END) as nulls,
             SUM(CASE WHEN costo_ot = 0 THEN 1 ELSE 0 END) as zeros,
             SUM(CASE WHEN costo_ot > 0 THEN 1 ELSE 0 END) as with_cost
      FROM orders_of_work
    `);
    
    res.json({
      updated: result.rowCount,
      stats: stats.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEMPORAL: Run migration 034
app.post('/api/debug/run-migration-034', async (req, res) => {
  try {
    await db.query(`
      ALTER TABLE project_assignments 
      ADD COLUMN IF NOT EXISTS ot_id INTEGER REFERENCES orders_of_work(id) ON DELETE CASCADE
    `);
    
    await db.query(`
      ALTER TABLE project_assignments 
      ADD COLUMN IF NOT EXISTS allocation_percentage NUMERIC(5,2) DEFAULT 100
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_project_assignments_ot_id ON project_assignments(ot_id)
    `);
    
    res.json({ success: true, message: 'Migration 034 executed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update job opening
app.put('/api/job-openings/:id', uploadJobFile.single('file'), async (req, res) => {
  const { id } = req.params;
  
  // Si viene FormData con archivo, los datos vienen en req.body.data
  let bodyData = req.body;
  if (req.body.data) {
    try {
      bodyData = JSON.parse(req.body.data);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
  }

  const {
    company, contact_person_name, contact_email, celula_id, area_id, cell_area, office_location, work_modality, salary,
    position_name, role, years_experience, technical_tools, basic_knowledge, desirable_code,
    status,
    commercial_contacts
  } = bodyData;

  // Get file URL if uploaded
  const fileUrl = req.file ? `/uploads/job-openings/${req.file.filename}` : undefined;

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    
    // Preparar valores, usar undefined para no actualizar si no viene el campo
    const updateValues = {
      company,
      contact_person_name,
      contact_email,
      celula_id: celula_id !== undefined ? (celula_id || null) : undefined,
      area_id: area_id !== undefined ? (area_id || null) : undefined,
      cell_area,
      office_location,
      work_modality,
      salary,
      position_name,
      role,
      years_experience,
      technical_tools,
      basic_knowledge,
      desirable_code,
      status,
      file_url: fileUrl
    };

    // Construir query dinámicamente solo con campos que vienen
    const updates = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updateValues).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE job_openings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const jobResult = await client.query(query, values);

    if (jobResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job opening not found' });
    }

    // Manejar contactos comerciales si se proporcionan
    if (commercial_contacts && Array.isArray(commercial_contacts)) {
      // Eliminar todos los contactos existentes
      await client.query(
        `DELETE FROM commercial_contacts WHERE job_opening_id = $1`,
        [id]
      );
      
      // Insertar los nuevos contactos
      for (const contact of commercial_contacts) {
        if (contact.full_name && contact.email) {
          await client.query(
            `INSERT INTO commercial_contacts (job_opening_id, full_name, email, phone, location)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              id,
              contact.full_name,
              contact.email.toLowerCase(),
              contact.phone || null,
              contact.location || null
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json(jobResult.rows[0]);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating job opening:', err);
    res.status(500).json({ error: 'Error updating job opening' });
  } finally {
    client.release();
  }
});

// Delete job opening
app.patch('/api/job-openings/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      `UPDATE job_openings SET
        status = COALESCE($1, status),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [ status, id ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Job opening not found' });
    }

    res.json({ success: true, message: 'Job opening deleted successfully' });
  } catch (err) {
    console.error('Error deleting job opening:', err);
    res.status(500).json({ error: 'Error deleting job opening' });
  }
});

// ============ COMMERCIAL CONTACTS ENDPOINTS ============

// Get commercial contacts for a job opening
app.get('/api/job-openings/:id/commercial-contacts', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM commercial_contacts WHERE job_opening_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching commercial contacts:', err);
    res.status(500).json({ error: 'Error fetching commercial contacts' });
  }
});

// Create commercial contact for a job opening
app.post('/api/job-openings/:id/commercial-contacts', async (req, res) => {
  const { id } = req.params;
  const { full_name, email, phone, location } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({
      error: 'Required fields: full_name, email'
    });
  }

  try {
    // Ensure email is lowercase
    const normalizedEmail = email.toLowerCase();

    const result = await db.query(
      `INSERT INTO commercial_contacts (job_opening_id, full_name, email, phone, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, full_name, normalizedEmail, phone || null, location || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating commercial contact:', err);
    res.status(500).json({ error: 'Error creating commercial contact' });
  }
});

// Update commercial contact
app.put('/api/commercial-contacts/:id', async (req, res) => {
  const { id } = req.params;
  const { full_name, email, phone, location } = req.body;

  try {
    // Ensure email is lowercase if provided
    const normalizedEmail = email ? email.toLowerCase() : null;

    const result = await db.query(
      `UPDATE commercial_contacts SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        location = COALESCE($4, location),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [full_name, normalizedEmail, phone, location, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Commercial contact not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating commercial contact:', err);
    res.status(500).json({ error: 'Error updating commercial contact' });
  }
});

// Delete commercial contact
app.delete('/api/commercial-contacts/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      `DELETE FROM commercial_contacts WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Commercial contact not found' });
    }

    res.json({ success: true, message: 'Commercial contact deleted' });
  } catch (err) {
    console.error('Error deleting commercial contact:', err);
    res.status(500).json({ error: 'Error deleting commercial contact' });
  }
});

// ============ LICITACIONES ENDPOINTS ============

// Get all licitaciones
app.get('/api/licitaciones', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        l.*,
        mc.item as celula_name
      FROM licitaciones l
      LEFT JOIN mastercode mc ON l.celula_id = mc.id
      ORDER BY l.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching licitaciones:', err);
    res.status(500).json({ error: 'Error fetching licitaciones' });
  }
});

// Get single licitacion
app.get('/api/licitaciones/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`
      SELECT 
        l.*,
        mc.item as celula_name
      FROM licitaciones l
      LEFT JOIN mastercode mc ON l.celula_id = mc.id
      WHERE l.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Licitación no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching licitacion:', err);
    res.status(500).json({ error: 'Error fetching licitacion' });
  }
});

// Create licitacion
app.post('/api/licitaciones', async (req, res) => {
  const {
    nombre,
    nombre_proyecto,
    clientes,
    responsable_negocio,
    celula_id,
    estado
  } = req.body;
  
  try {
    const result = await db.query(`
      INSERT INTO licitaciones (
        nombre,
        nombre_proyecto,
        clientes,
        responsable_negocio,
        celula_id,
        estado
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      nombre,
      nombre_proyecto,
      clientes || null,
      responsable_negocio || null,
      celula_id || null,
      estado || 'Solicitado'
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating licitacion:', err);
    res.status(500).json({ error: 'Error creating licitacion' });
  }
});

// Update licitacion
app.put('/api/licitaciones/:id', async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    nombre_proyecto,
    clientes,
    responsable_negocio,
    celula_id,
    estado
  } = req.body;
  
  try {
    const result = await db.query(`
      UPDATE licitaciones SET
        nombre = COALESCE($1, nombre),
        nombre_proyecto = COALESCE($2, nombre_proyecto),
        clientes = COALESCE($3, clientes),
        responsable_negocio = COALESCE($4, responsable_negocio),
        celula_id = COALESCE($5, celula_id),
        estado = COALESCE($6, estado),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [nombre, nombre_proyecto, clientes, responsable_negocio, celula_id, estado, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Licitación no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating licitacion:', err);
    res.status(500).json({ error: 'Error updating licitacion' });
  }
});

// Delete licitacion
app.delete('/api/licitaciones/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM licitaciones WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Licitación no encontrada' });
    }
    
    res.json({ message: 'Licitación eliminada', licitacion: result.rows[0] });
  } catch (err) {
    console.error('Error deleting licitacion:', err);
    res.status(500).json({ error: 'Error deleting licitacion' });
  }
});

// ============ CÉLULAS HELPERS ============

// Unassign projects from celula (set celula_id to NULL)
app.post('/api/celulas/:id/unassign-projects', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE projects SET celula_id = NULL WHERE celula_id = $1', [id]);
    res.json({ message: 'Proyectos desasignados de la célula' });
  } catch (err) {
    console.error('Error unassigning projects:', err);
    res.status(500).json({ error: 'Error unassigning projects' });
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'src')));

// Fallback to index.html for SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'src', 'index.html'));
});

const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`API server listening on ${HOST}:${PORT}`);
});

