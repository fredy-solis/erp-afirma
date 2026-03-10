// Variable global para almacenar todos los empleados
let allEmployees = [];

function showGridLoading() {
    document.getElementById('employee-grid-loading').style.display = 'block';
    document.getElementById('employeeTable').style.display = 'none';
    document.getElementById('employee-grid-empty').style.display = 'none';
    document.getElementById('employee-grid-error').style.display = 'none';
}

function showGridError(message = 'Error al cargar empleados') {
    document.getElementById('employee-grid-loading').style.display = 'none';
    document.getElementById('employeeTable').style.display = 'none';
    document.getElementById('employee-grid-empty').style.display = 'none';
    document.getElementById('employee-grid-error').style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

function showGridEmpty() {
    document.getElementById('employee-grid-loading').style.display = 'none';
    document.getElementById('employeeTable').style.display = 'none';
    document.getElementById('employee-grid-empty').style.display = 'block';
    document.getElementById('employee-grid-error').style.display = 'none';
}

function showGridTable() {
    document.getElementById('employee-grid-loading').style.display = 'none';
    document.getElementById('employeeTable').style.display = 'table';
    document.getElementById('employee-grid-empty').style.display = 'none';
    document.getElementById('employee-grid-error').style.display = 'none';
}

function renderEmployees(employees) {
    // Guardar empleados en variable global (solo si no es un resultado de filtro)
    const isFiltered = arguments[1] === 'filtered';
    if (!isFiltered) {
        allEmployees = employees || [];
    }
    
    const tableBody = document.getElementById('employee-table-body');
    if (!tableBody) {
        showGridError('Error: Elemento del grid no encontrado');
        return;
    }
    
    // Limpiar contenido anterior
    tableBody.innerHTML = '';

    // Manejar caso de error o datos vacíos
    if (!employees) {
        showGridError('Error al obtener datos de empleados');
        return;
    }

    if (employees.length === 0) {
        showGridEmpty();
        return;
    }

    // Mostrar tabla con datos
    showGridTable();

    // Renderizar cada empleado
    employees.forEach((emp, index) => {
        try {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #e5e7eb';
            tr.style.transition = 'background-color 0.2s ease';
            tr.onmouseenter = () => tr.style.backgroundColor = '#f9fafb';
            tr.onmouseleave = () => tr.style.backgroundColor = 'transparent';
            
            const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
            const status = emp.status || 'Activo';
            const statusColor = getStatusColor(status);

            tr.innerHTML = `
                <td style="padding:12px 8px;vertical-align:middle;text-align:center;font-weight:600;color:#1f2937;font-size:14px">${emp.id}</td>
                <td style="padding:12px 8px;vertical-align:middle;">
                    <div style="font-weight:600;color:#1f2937;font-size:14px;">${escapeHtml(fullName)}</div>
                    ${emp.employee_code ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">Código: ${escapeHtml(emp.employee_code)}</div>` : ''}
                </td>
                <td style="padding:12px 8px;vertical-align:middle;font-size:14px">${escapeHtml(emp.entity_name || '-')}</td>
                <td style="padding:12px 8px;vertical-align:middle;font-size:14px">${escapeHtml(emp.position_name || emp.position || '-')}</td>
                <td style="padding:12px 8px;vertical-align:middle;font-size:14px">${escapeHtml(emp.area_name || '-')}</td>
                <td style="padding:12px 8px;vertical-align:middle;font-size:14px">${escapeHtml(emp.project_name || '-')}</td>
                <td style="padding:12px 8px;vertical-align:middle;font-size:14px">${escapeHtml(emp.cell_name || '-')}</td>
                <td style="padding:12px 8px;vertical-align:middle;text-align:center">
                    <span style="background:${statusColor.bg};color:${statusColor.text};padding:4px 8px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap">${status}</span>
                </td>
                <td style="padding:12px 8px;vertical-align:middle;">
                    <div style="display:flex;gap:6px;justify-content:center">
                        <button class="view-employee btn-action-view" data-id="${emp.id}" title="Ver información del empleado">
                            👁️ Ver
                        </button>
                        <button class="edit-employee btn-action-edit" data-id="${emp.id}" title="Actualizar empleado">
                            ✏️ Actualizar
                        </button>
                        <button class="delete-employee btn-action-delete" data-id="${emp.id}" title="Eliminar empleado">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        } catch (error) {
            console.error('Error renderizando empleado:', emp, error);
        }
    });
}

function getStatusColor(status) {
    const colors = {
        'Activo': { bg: '#10b981', text: 'white' },
        'Inactivo': { bg: '#9ca3af', text: 'white' },
        'En licencia': { bg: '#f59e0b', text: 'white' },
        'Suspendido': { bg: '#ef4444', text: 'white' }
    };
    return colors[status] || { bg: '#9ca3af', text: 'white' };
}

function filterEmployees() {
    // Obtener valores de filtros y limpiar espacios
    const nameFilter = (document.getElementById('filter-name')?.value || '').trim().toLowerCase();
    const positionFilter = (document.getElementById('filter-position')?.value || '').trim().toLowerCase();
    const entityFilter = (document.getElementById('filter-entity')?.value || '').trim().toLowerCase();
    const statusFilter = (document.getElementById('filter-status')?.value || '').trim();

    // Si no hay filtros activos, mostrar todos los empleados
    if (!nameFilter && !positionFilter && !entityFilter && !statusFilter) {
        renderEmployees(allEmployees, 'filtered');
        return;
    }

    // Aplicar filtros
    const filtered = allEmployees.filter(emp => {
        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
        const position = (emp.position_name || emp.position || '').toLowerCase();
        const entity = (emp.entity_name || '').toLowerCase();
        const status = emp.status || 'Activo';

        const matchesName = !nameFilter || fullName.includes(nameFilter);
        const matchesPosition = !positionFilter || position.includes(positionFilter);
        const matchesEntity = !entityFilter || entity.includes(entityFilter);
        const matchesStatus = !statusFilter || status === statusFilter;

        return matchesName && matchesPosition && matchesEntity && matchesStatus;
    });

    renderEmployees(filtered, 'filtered');
}

// Función para aplicar filtros con debounce (evitar muchas ejecuciones)
let filterTimeout;
function applyFiltersWithDelay() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(filterEmployees, 300); // 300ms de delay
}

// Inicializar filtros
function initializeFilters() {
    // Eventos de input en tiempo real con debounce
    document.getElementById('filter-name')?.addEventListener('input', applyFiltersWithDelay);
    document.getElementById('filter-position')?.addEventListener('input', applyFiltersWithDelay);
    document.getElementById('filter-entity')?.addEventListener('input', applyFiltersWithDelay);
    document.getElementById('filter-status')?.addEventListener('change', filterEmployees);
    
    // Botón de búsqueda manual
    document.getElementById('filter-search-btn')?.addEventListener('click', filterEmployees);
    
    // Botón de limpiar filtros
    document.getElementById('filter-clear-btn')?.addEventListener('click', clearFilters);
    
    // Búsqueda al presionar Enter en los campos de texto
    ['filter-name', 'filter-position', 'filter-entity'].forEach(fieldId => {
        document.getElementById(fieldId)?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(filterTimeout); // Cancelar delay si presiona Enter
                filterEmployees();
            }
        });
    });
}

function clearFilters() {
    // Limpiar todos los campos de filtro
    const filterFields = ['filter-name', 'filter-position', 'filter-entity', 'filter-status'];
    filterFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = '';
        }
    });
    
    // Cancelar cualquier timeout pendiente
    clearTimeout(filterTimeout);
    
    // Mostrar todos los empleados
    renderEmployees(allEmployees);
    
    // Enfocar el primer campo para facilidad de uso
    document.getElementById('filter-name')?.focus();
}

// Llamar a initializeFilters cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFilters);
} else {
    initializeFilters();
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

function clearInputFields() {
    document.getElementById('employee-id').value = '';
    document.getElementById('employee-first').value = '';
    document.getElementById('employee-last').value = '';
    document.getElementById('employee-email').value = '';
    document.getElementById('employee-birth').value = '';
    document.getElementById('employee-code').value = '';
    document.getElementById('employee-phone').value = '';
    document.getElementById('employee-personal-phone').value = '';
    document.getElementById('employee-position').value = '';
    document.getElementById('employee-entity').value = '';
    document.getElementById('employee-area').value = '';
    document.getElementById('employee-project').value = '';
    document.getElementById('employee-cell').value = '';
    document.getElementById('employee-status').value = 'Activo';
    
    // Address fields
    document.getElementById('employee-address-street').value = '';
    document.getElementById('employee-address-exterior').value = '';
    document.getElementById('employee-address-interior').value = '';
    document.getElementById('employee-address-colonia').value = '';
    document.getElementById('employee-address-city').value = '';
    document.getElementById('employee-address-state').value = '';
    document.getElementById('employee-address-postal-code').value = '';
    document.getElementById('employee-address-country').value = 'México';
    
    // Expediente fields
    document.getElementById('employee-curp').value = '';
    document.getElementById('employee-rfc').value = '';
    document.getElementById('employee-nss').value = '';
    document.getElementById('employee-passport').value = '';
    document.getElementById('employee-gender').value = '';
    document.getElementById('employee-marital-status').value = '';
    document.getElementById('employee-nationality').value = '';
    document.getElementById('employee-blood-type').value = '';
    
    // Banking fields
    document.getElementById('employee-bank-name').value = '';
    document.getElementById('employee-account-holder').value = '';
    document.getElementById('employee-account-number').value = '';
    document.getElementById('employee-clabe').value = '';
    
    // Contract fields
    document.getElementById('employee-contract-type').value = '';
    document.getElementById('employee-obra').value = '';
    document.getElementById('employee-contract-scheme').value = '';
    document.getElementById('employee-initial-rate').value = '';
    document.getElementById('employee-gross-salary').value = '';
    document.getElementById('employee-net-salary').value = '';
    document.getElementById('employee-company-cost').value = '';
    document.getElementById('employee-hire-date').value = '';
    document.getElementById('employee-end-date').value = '';
    document.getElementById('employee-termination-reason').value = '';
    document.getElementById('employee-rehireable').checked = true;
}

// Function to ensure catalogs are loaded
async function ensureCatalogsLoaded() {
    const positionSelect = document.getElementById('employee-position');
    const entitySelect = document.getElementById('employee-entity');
    const areaSelect = document.getElementById('employee-area');
    const projectSelect = document.getElementById('employee-project');
    const cellSelect = document.getElementById('employee-cell');
    
    // Check if catalogs are already loaded (more than just the default option)
    if ((positionSelect && positionSelect.options.length <= 1) || (entitySelect && entitySelect.options.length <= 1) || (areaSelect && areaSelect.options.length <= 1)) {
        console.log('🔄 Loading catalogs for employee form...');
        try {
            const [entities, positions, areas, projects, cells] = await Promise.all([
                fetch(window.getApiUrl('/api/mastercode/Entidad')).then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl('/api/mastercode/Puestos%20roles')).then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl('/api/mastercode/Areas')).then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl('/api/mastercode/Proyecto')).then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl('/api/mastercode/Celulas')).then(r => r.json()).catch(() => [])
            ]);

            // Populate entities
            if (entitySelect) {
                entitySelect.innerHTML = '<option value="">Seleccionar entidad...</option>';
                entities.forEach(e => {
                    const opt = document.createElement('option');
                    opt.value = e.id;
                    opt.textContent = e.name;
                    entitySelect.appendChild(opt);
                });
            }

            // Populate positions
            if (positionSelect) {
                positionSelect.innerHTML = '<option value="">Seleccionar posición...</option>';
                positions.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    positionSelect.appendChild(opt);
                });
            }

            // Populate areas
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="">Seleccionar área...</option>';
                areas.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = a.name;
                    areaSelect.appendChild(opt);
                });
            }

            // Populate projects
            if (projectSelect) {
                projectSelect.innerHTML = '<option value="">Seleccionar proyecto...</option>';
                projects.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    projectSelect.appendChild(opt);
                });
            }

            // Populate cells
            if (cellSelect) {
                cellSelect.innerHTML = '<option value="">Seleccionar célula...</option>';
                cells.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    cellSelect.appendChild(opt);
                });
            }
            
            console.log(`✅ Catalogs loaded: ${entities.length} entities, ${positions.length} positions, ${areas.length} areas, ${projects.length} projects, ${cells.length} cells`);
        } catch (error) {
            console.error('❌ Error loading catalogs:', error);
        }
    }
}

async function populateForm(employee){
    console.log('📝 Populando formulario con empleado:', employee);
    
    // Primero cargar los catálogos si no están cargados
    await ensureCatalogsLoaded();
    
    // Información básica
    document.getElementById('employee-id').value = employee.id || '';
    document.getElementById('employee-first').value = employee.first_name || '';
    document.getElementById('employee-last').value = employee.last_name || '';
    document.getElementById('employee-email').value = employee.email || '';
    document.getElementById('employee-birth').value = employee.birth_date ? employee.birth_date.split('T')[0] : '';
    document.getElementById('employee-code').value = employee.employee_code || '';
    document.getElementById('employee-phone').value = employee.phone || '';
    document.getElementById('employee-personal-phone').value = employee.personal_phone || '';
    
    // Establecer valores de dropdowns (los catálogos ya están cargados por ensureCatalogsLoaded)
    const positionSelect = document.getElementById('employee-position');
    const entitySelect = document.getElementById('employee-entity');
    const areaSelect = document.getElementById('employee-area');
    const projectSelect = document.getElementById('employee-project');
    const cellSelect = document.getElementById('employee-cell');
    
    console.log('🔍 Setting dropdowns:', {
        position_id: employee.position_id || '',
        entity_id: employee.entity_id || '',
        position_options: positionSelect ? positionSelect.options.length : 0,
        entity_options: entitySelect ? entitySelect.options.length : 0
    });
    
    if (positionSelect) {
        positionSelect.value = employee.position_id || '';
        console.log('✅ Position value set to:', positionSelect.value);
    }
    
    if (entitySelect) {
        entitySelect.value = employee.entity_id || '';
        console.log('✅ Entity value set to:', entitySelect.value);
    }
    
    if (areaSelect) areaSelect.value = employee.area_id || '';
    if (projectSelect) projectSelect.value = employee.project_id || '';
    if (cellSelect) cellSelect.value = employee.cell_id || '';
    
    console.log('🔄 Valores establecidos:', {
        position_id: employee.position_id,
        entity_id: employee.entity_id,
        area_id: employee.area_id,
        project_id: employee.project_id,
        cell_id: employee.cell_id
    });
    
    document.getElementById('employee-status').value = employee.status || 'Activo';
    
    // Address fields con logging detallado
    console.log('📍 Datos de dirección del empleado:', {
        address: employee.address,
        exterior_number: employee.exterior_number,
        interior_number: employee.interior_number,
        colonia: employee.colonia,
        city: employee.city,
        state: employee.state,
        postal_code: employee.postal_code,
        country: employee.country,
        // También verificar si existen los campos con el prefijo address_
        address_street: employee.address_street,
        address_exterior: employee.address_exterior,
        address_interior: employee.address_interior,
        address_colonia: employee.address_colonia,
        address_city: employee.address_city,
        address_state: employee.address_state,
        address_postal_code: employee.address_postal_code,
        address_country: employee.address_country
    });
    
    const addressStreetField = document.getElementById('employee-address-street');
    const addressExteriorField = document.getElementById('employee-address-exterior');
    const addressInteriorField = document.getElementById('employee-address-interior');
    const addressColoniaField = document.getElementById('employee-address-colonia');
    const addressCityField = document.getElementById('employee-address-city');
    const addressStateField = document.getElementById('employee-address-state');
    const addressPostalField = document.getElementById('employee-address-postal-code');
    const addressCountryField = document.getElementById('employee-address-country');
    
    // Usar los campos que vengan de la API (pueden ser address o address_street)
    if (addressStreetField) addressStreetField.value = employee.address_street || employee.address || '';
    if (addressExteriorField) addressExteriorField.value = employee.address_exterior || employee.exterior_number || '';
    if (addressInteriorField) addressInteriorField.value = employee.address_interior || employee.interior_number || '';
    if (addressColoniaField) addressColoniaField.value = employee.address_colonia || employee.colonia || '';
    if (addressCityField) addressCityField.value = employee.address_city || employee.city || '';
    if (addressStateField) addressStateField.value = employee.address_state || employee.state || '';
    if (addressPostalField) addressPostalField.value = employee.address_postal_code || employee.postal_code || '';
    if (addressCountryField) addressCountryField.value = employee.address_country || employee.country || 'México';
    
    // Verificar que los campos se poblaron correctamente
    console.log('📍 Campos de dirección después de poblar:', {
        street: addressStreetField?.value,
        exterior: addressExteriorField?.value,
        interior: addressInteriorField?.value,
        colonia: addressColoniaField?.value,
        city: addressCityField?.value,
        state: addressStateField?.value,
        postal: addressPostalField?.value,
        country: addressCountryField?.value
    });
    
    // Expediente fields
    const curpField = document.getElementById('employee-curp');
    const rfcField = document.getElementById('employee-rfc');
    const nssField = document.getElementById('employee-nss');
    const passportField = document.getElementById('employee-passport');
    const genderField = document.getElementById('employee-gender');
    const maritalStatusField = document.getElementById('employee-marital-status');
    const nationalityField = document.getElementById('employee-nationality');
    const bloodTypeField = document.getElementById('employee-blood-type');
    
    if (curpField) curpField.value = employee.curp || '';
    if (rfcField) rfcField.value = employee.rfc || '';
    if (nssField) nssField.value = employee.nss || '';
    if (passportField) passportField.value = employee.passport || '';
    if (genderField) genderField.value = employee.gender || '';
    if (maritalStatusField) maritalStatusField.value = employee.marital_status || '';
    if (nationalityField) nationalityField.value = employee.nationality || '';
    if (bloodTypeField) bloodTypeField.value = employee.blood_type || '';
    
    // Load banking and contract data when opening form (will be loaded when switching to HR tab)
    // Banking and contract data will be loaded via loadEmployeeBanking() and loadEmployeeContracts()
}

function escapeHtml(unsafe){
    return String(unsafe||'').replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m];});
}

window.renderEmployees = renderEmployees;
window.clearInputFields = clearInputFields;
window.populateForm = populateForm;
window.formatDate = formatDate;
window.showGridLoading = showGridLoading;
window.showGridError = showGridError;
window.showGridEmpty = showGridEmpty;
window.showGridTable = showGridTable;
window.filterEmployees = filterEmployees;
window.clearFilters = clearFilters;

// Función global para recargar empleados
window.reloadEmployees = async function() {
    try {
        showGridLoading();
        const employees = await window.fetchEmployees();
        
        // Actualizar variable global
        allEmployees = employees || [];
        
        // Si hay filtros activos, aplicarlos a los nuevos datos
        const hasActiveFilters = ['filter-name', 'filter-position', 'filter-entity', 'filter-status']
            .some(fieldId => {
                const field = document.getElementById(fieldId);
                return field && field.value.trim();
            });
        
        if (hasActiveFilters) {
            filterEmployees();
        } else {
            renderEmployees(employees);
        }
    } catch (error) {
        console.error('Error recargando empleados:', error);
        showGridError('Error al recargar empleados');
    }
};