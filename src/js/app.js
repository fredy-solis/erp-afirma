// Configuración de la URL base del API
// Esta función permite que el frontend funcione tanto con el servidor de desarrollo (puerto 8082)
// como en producción (mismo puerto)
window.getApiUrl = function(endpoint) {
    // En desarrollo, el frontend está en puerto 8082 y el API en puerto 3000
    // En producción, ambos están en el mismo puerto
    const isDevelopment = window.location.port === '8082';
    const apiBaseUrl = isDevelopment ? 'http://localhost:3000' : '';
    return apiBaseUrl + endpoint;
};

document.addEventListener('DOMContentLoaded', async () => {
    // Toggle sidebar
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const appShell = document.getElementById('app-shell');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            // Guardar estado en localStorage
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
        
        // Restaurar estado del sidebar desde localStorage
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
        }
    }
    
        // Asociar botón de proyectos a la vista de importar OTs (solo una vez, sin duplicados)
        let otImportBtn = document.getElementById('ot-import-btn');
        if (otImportBtn && !otImportBtn.dataset.listenerAdded) {
            otImportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.showView('importar-ots');
            });
            otImportBtn.dataset.listenerAdded = 'true';
        }
    // --- Importar OTs desde Excel: Navegación y lógica avanzada ---
    const otImportBtnStandalone = document.querySelector('[data-view="importar-ots"]');
    if (otImportBtnStandalone) {
        otImportBtnStandalone.addEventListener('click', (e) => {
            e.preventDefault();
            window.showView('importar-ots');
        });
    }

    const otTemplateBtn = document.getElementById('ot-template-btn');
    if (otTemplateBtn) {
        otTemplateBtn.addEventListener('click', () => {
            const wb = window.XLSX ? window.XLSX.utils.book_new() : null;
            const ws_data = [
                ['Número OT', 'Folio Principal Santec', 'Folio Santec', 'Nombre Proyecto'],
                ['CPA-AFI-00073677', 'MXP6042', '30/01/2026', 'Fondos y Perfilamiento'],
                ['CPA-AFI-00073678', 'MXP6042', '30/01/2026', 'Plataforma global de inversiones']
            ];
            if (window.XLSX && wb) {
                const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
                window.XLSX.utils.book_append_sheet(wb, ws, 'OTs');
                const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'plantilla_ots.xlsx';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            } else {
                // fallback CSV
                const csv = ws_data.map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'plantilla_ots.csv';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            }
        });
    }

    const otImportFileStandalone = document.getElementById('ot-import-file-standalone');
    const otImportPreviewArea = document.getElementById('ot-import-preview-area');
    const otImportPreviewTable = document.getElementById('ot-import-preview-table');
    const otImportSaveBtn = document.getElementById('ot-import-save-btn');
    const otImportCancelBtn = document.getElementById('ot-import-cancel-btn');
    const otCreateProjectsCheckbox = document.getElementById('ot-create-projects-checkbox');
    const otDuplicatesAlert = document.getElementById('ot-duplicates-alert');
    const otDuplicatesList = document.getElementById('ot-duplicates-list');
    const otSkippedAlert = document.getElementById('ot-skipped-alert');
    const otSkippedList = document.getElementById('ot-skipped-list');
    const otUpdatedAlert = document.getElementById('ot-updated-alert');
    const otUpdatedList = document.getElementById('ot-updated-list');
    let otImportPreviewRows = [];
    let availableProjects = [];
    let existingOTsInDB = {}; // Mapa de ot_code -> [OTs]

    // Cargar proyectos disponibles
    async function loadAvailableProjects() {
        try {
            const response = await fetch(window.getApiUrl ? window.getApiUrl('/api/projects') : '/api/projects');
            availableProjects = await response.json();
        } catch (err) {
            console.error('Error loading projects:', err);
            availableProjects = [];
        }
    }

    // Cargar OTs existentes de la base de datos para detectar duplicados
    async function loadExistingOTs() {
        try {
            const response = await fetch(window.getApiUrl ? window.getApiUrl('/api/orders-of-work') : '/api/orders-of-work');
            const allOTs = await response.json();
            // Crear mapa de ot_code -> [OTs] para búsqueda rápida
            existingOTsInDB = allOTs.reduce((map, ot) => {
                const code = ot.ot_code ? ot.ot_code.toLowerCase() : '';
                if (code) {
                    if (!map[code]) {
                        map[code] = [];
                    }
                    map[code].push(ot);
                }
                return map;
            }, {});
        } catch (err) {
            console.error('Error loading existing OTs:', err);
            existingOTsInDB = {};
        }
    }

    // Encontrar proyecto por nombre
    function findProjectByName(projectName) {
        if (!projectName) return null;
        const normalized = projectName.trim().toLowerCase();
        return availableProjects.find(p => p.name && p.name.trim().toLowerCase() === normalized);
    }

    // Convertir número serial de Excel a fecha ISO (YYYY-MM-DD)
    function excelSerialToDate(serial) {
        if (!serial || serial === '') return null;
        
        // Si ya es una fecha válida en formato string, retornarla
        if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}/)) {
            return serial.split('T')[0]; // Tomar solo la parte de fecha
        }
        
        // Si es un número (serial de Excel)
        if (typeof serial === 'number') {
            // Excel guarda las fechas como días desde 1900-01-01
            // pero tiene un bug: cuenta 1900 como año bisiesto (no lo es)
            const excelEpoch = new Date(1899, 11, 30); // 30 de diciembre de 1899
            const days = Math.floor(serial);
            const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
            
            // Formatear como YYYY-MM-DD
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            
            return `${year}-${month}-${day}`;
        }
        
        // Si es string que parece una fecha de Excel (dd/mm/yyyy)
        if (typeof serial === 'string' && serial.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
            const parts = serial.split('/');
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
        
        return null;
    }

    // Convertir valor numérico si es necesario
    function parseNumericValue(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            // Limpiar formato de moneda o porcentaje
            const cleaned = value.replace(/[$,%]/g, '').trim();
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
        return null;
    }

    if (otImportFileStandalone) {
        // Listener para sincronizar checkbox global con checks individuales
        if (otCreateProjectsCheckbox) {
            otCreateProjectsCheckbox.addEventListener('change', function(e) {
                const isChecked = e.target.checked;
                // Actualizar todos los rows
                otImportPreviewRows.forEach(row => {
                    row.createNewProject = isChecked;
                    if (!isChecked) {
                        // Si se desmarca global, limpiar proyecto seleccionado también
                        row.selectedProjectId = null;
                    }
                });
                renderOTImportPreview();
            });
        }
        
        otImportFileStandalone.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            // Cargar proyectos y OTs existentes
            await Promise.all([loadAvailableProjects(), loadExistingOTs()]);
            
            // Cargar XLSX si no existe
            if (!window.XLSX) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }
            
            const reader = new FileReader();
            reader.onload = function(evt) {
                const data = evt.target.result;
                const workbook = window.XLSX.read(data, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                if (rows.length < 2) {
                    Swal.fire({ icon: 'error', title: 'El archivo está vacío' });
                    return;
                }
                
                const header = rows[0];
                
                // Mapeo de columnas
                const columnMap = {
                    ot_code: header.findIndex(h => h && h.toString().toLowerCase().includes('número ot')),
                    folio_principal_santec: header.findIndex(h => h && h.toString().toLowerCase().includes('folio principal santec')),
                    folio_santec: header.findIndex(h => h && h.toString().toLowerCase().includes('folio santec')),
                    nombre_proyecto: header.findIndex(h => h && h.toString().toLowerCase().includes('nombre proyecto')),
                    status: header.findIndex(h => h && h.toString().toLowerCase() === 'estado'),
                    description: header.findIndex(h => h && h.toString().toLowerCase().includes('descripción')),
                    tipo_servicio: header.findIndex(h => h && h.toString().toLowerCase().includes('tipo servicio')),
                    tecnologia: header.findIndex(h => h && h.toString().toLowerCase().includes('tecnología')),
                    aplicativo: header.findIndex(h => h && h.toString().toLowerCase().includes('aplicativo')),
                    fecha_inicio_proveedor: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha inicio proveedor')),
                    fecha_fin_proveedor: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha fin proveedor')),
                    lider_delivery: header.findIndex(h => h && h.toString().toLowerCase().includes('líder delivery')),
                    responsable_proyecto: header.findIndex(h => h && h.toString().toLowerCase().includes('responsable de proyecto')),
                    cbt_responsable: header.findIndex(h => h && h.toString().toLowerCase().includes('cbt responsable')),
                    monto_servicio_proveedor: header.findIndex(h => h && h.toString().toLowerCase().includes('monto del servicio (proveedor)') && !h.toString().toLowerCase().includes('iva')),
                    monto_servicio_proveedor_iva: header.findIndex(h => h && h.toString().toLowerCase().includes('monto del servicio (proveedor) con iva')),
                    horas: header.findIndex(h => h && h.toString().toLowerCase() === 'horas'),
                    porcentaje_ejecucion: header.findIndex(h => h && h.toString().toLowerCase().includes('% ejecución')),
                    // Columnas adicionales
                    fecha_inicio_santander: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha inicio santander')),
                    fecha_fin_santander: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha fin santander')),
                    horas_acordadas: header.findIndex(h => h && h.toString().toLowerCase().includes('hras. acordadas')),
                    semaforo_esfuerzo: header.findIndex(h => h && h.toString().toLowerCase().includes('semáforo de esfuerzo')),
                    semaforo_plazo: header.findIndex(h => h && h.toString().toLowerCase().includes('semáforo de plazo')),
                    autorizacion_rdp: header.findIndex(h => h && h.toString().toLowerCase().includes('autorización rdp')),
                    proveedor: header.findIndex(h => h && h.toString().toLowerCase().includes('proveedor') && !h.toString().toLowerCase().includes('fecha') && !h.toString().toLowerCase().includes('monto')),
                    fecha_inicio_real: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha inicio real')),
                    fecha_fin_real: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha fin real')),
                    fecha_entrega_proveedor: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha entrega proveedor')),
                    dias_desvio_entrega: header.findIndex(h => h && h.toString().toLowerCase().includes('días desvío entrega')),
                    ambiente: header.findIndex(h => h && h.toString().toLowerCase().includes('ambiente')),
                    fecha_creacion: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha creación')),
                    fts: header.findIndex(h => h && h.toString().toLowerCase().includes("ft's")),
                    estimacion_elab_pruebas: header.findIndex(h => h && h.toString().toLowerCase().includes('estimación e-lab + pruebas')),
                    costo_hora_servicio_proveedor: header.findIndex(h => h && h.toString().toLowerCase().includes('costo por hora del servicio')),
                    clase_coste: header.findIndex(h => h && h.toString().toLowerCase().includes('clase de coste')),
                    folio_pds: header.findIndex(h => h && h.toString().toLowerCase().includes('folio pds')),
                    programa: header.findIndex(h => h && h.toString().toLowerCase().includes('programa')),
                    front_negocio: header.findIndex(h => h && h.toString().toLowerCase().includes('front de negocio') && !h.toString().toLowerCase().includes('vobo')),
                    vobo_front_negocio: header.findIndex(h => h && h.toString().toLowerCase().includes('vobo front de negocio') && !h.toString().toLowerCase().includes('fecha')),
                    fecha_vobo_front_negocio: header.findIndex(h => h && h.toString().toLowerCase().includes('fecha vobo front de negocio'))
                };

                // Validar columnas obligatorias
                if (columnMap.ot_code < 0 || columnMap.nombre_proyecto < 0) {
                    Swal.fire({ 
                        icon: 'error', 
                        title: 'Columnas requeridas no encontradas',
                        text: 'Se requieren al menos: "Número OT" y "Nombre Proyecto"'
                    });
                    return;
                }

                otImportPreviewRows = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row[columnMap.ot_code]) continue;
                    
                    const nombreProyecto = row[columnMap.nombre_proyecto] ? row[columnMap.nombre_proyecto].toString().trim() : '';
                    const project = findProjectByName(nombreProyecto);
                    
                    const otData = {
                        ot_code: row[columnMap.ot_code],
                        nombre_proyecto: nombreProyecto,
                        project_id: project ? project.id : null,
                        hasError: !project,
                        // Mapear todas las columnas
                        folio_principal_santec: columnMap.folio_principal_santec >= 0 ? row[columnMap.folio_principal_santec] : null,
                        folio_santec: columnMap.folio_santec >= 0 ? row[columnMap.folio_santec] : null,
                        status: columnMap.status >= 0 ? row[columnMap.status] : 'en ejecucion',
                        description: columnMap.description >= 0 ? row[columnMap.description] : null,
                        tipo_servicio: columnMap.tipo_servicio >= 0 ? row[columnMap.tipo_servicio] : null,
                        tecnologia: columnMap.tecnologia >= 0 ? row[columnMap.tecnologia] : null,
                        aplicativo: columnMap.aplicativo >= 0 ? row[columnMap.aplicativo] : null,
                        // Convertir fechas de Excel
                        fecha_inicio_santander: columnMap.fecha_inicio_santander >= 0 ? excelSerialToDate(row[columnMap.fecha_inicio_santander]) : null,
                        fecha_fin_santander: columnMap.fecha_fin_santander >= 0 ? excelSerialToDate(row[columnMap.fecha_fin_santander]) : null,
                        fecha_inicio_proveedor: columnMap.fecha_inicio_proveedor >= 0 ? excelSerialToDate(row[columnMap.fecha_inicio_proveedor]) : null,
                        fecha_fin_proveedor: columnMap.fecha_fin_proveedor >= 0 ? excelSerialToDate(row[columnMap.fecha_fin_proveedor]) : null,
                        // Valores numéricos
                        horas_acordadas: columnMap.horas_acordadas >= 0 ? parseNumericValue(row[columnMap.horas_acordadas]) : null,
                        semaforo_esfuerzo: columnMap.semaforo_esfuerzo >= 0 ? row[columnMap.semaforo_esfuerzo] : null,
                        semaforo_plazo: columnMap.semaforo_plazo >= 0 ? row[columnMap.semaforo_plazo] : null,
                        lider_delivery: columnMap.lider_delivery >= 0 ? row[columnMap.lider_delivery] : null,
                        autorizacion_rdp: columnMap.autorizacion_rdp >= 0 ? row[columnMap.autorizacion_rdp] : null,
                        responsable_proyecto: columnMap.responsable_proyecto >= 0 ? row[columnMap.responsable_proyecto] : null,
                        cbt_responsable: columnMap.cbt_responsable >= 0 ? row[columnMap.cbt_responsable] : null,
                        proveedor: columnMap.proveedor >= 0 ? row[columnMap.proveedor] : null,
                        // Más fechas convertidas
                        fecha_inicio_real: columnMap.fecha_inicio_real >= 0 ? excelSerialToDate(row[columnMap.fecha_inicio_real]) : null,
                        fecha_fin_real: columnMap.fecha_fin_real >= 0 ? excelSerialToDate(row[columnMap.fecha_fin_real]) : null,
                        fecha_entrega_proveedor: columnMap.fecha_entrega_proveedor >= 0 ? excelSerialToDate(row[columnMap.fecha_entrega_proveedor]) : null,
                        dias_desvio_entrega: columnMap.dias_desvio_entrega >= 0 ? parseNumericValue(row[columnMap.dias_desvio_entrega]) : null,
                        ambiente: columnMap.ambiente >= 0 ? row[columnMap.ambiente] : null,
                        fecha_creacion: columnMap.fecha_creacion >= 0 ? excelSerialToDate(row[columnMap.fecha_creacion]) : null,
                        fts: columnMap.fts >= 0 ? row[columnMap.fts] : null,
                        estimacion_elab_pruebas: columnMap.estimacion_elab_pruebas >= 0 ? parseNumericValue(row[columnMap.estimacion_elab_pruebas]) : null,
                        // Valores monetarios
                        costo_hora_servicio_proveedor: columnMap.costo_hora_servicio_proveedor >= 0 ? parseNumericValue(row[columnMap.costo_hora_servicio_proveedor]) : null,
                        monto_servicio_proveedor: columnMap.monto_servicio_proveedor >= 0 ? parseNumericValue(row[columnMap.monto_servicio_proveedor]) : null,
                        monto_servicio_proveedor_iva: columnMap.monto_servicio_proveedor_iva >= 0 ? parseNumericValue(row[columnMap.monto_servicio_proveedor_iva]) : null,
                        clase_coste: columnMap.clase_coste >= 0 ? row[columnMap.clase_coste] : null,
                        folio_pds: columnMap.folio_pds >= 0 ? row[columnMap.folio_pds] : null,
                        programa: columnMap.programa >= 0 ? row[columnMap.programa] : null,
                        front_negocio: columnMap.front_negocio >= 0 ? row[columnMap.front_negocio] : null,
                        vobo_front_negocio: columnMap.vobo_front_negocio >= 0 ? row[columnMap.vobo_front_negocio] : null,
                        fecha_vobo_front_negocio: columnMap.fecha_vobo_front_negocio >= 0 ? excelSerialToDate(row[columnMap.fecha_vobo_front_negocio]) : null,
                        horas: columnMap.horas >= 0 ? parseNumericValue(row[columnMap.horas]) : null,
                        porcentaje_ejecucion: columnMap.porcentaje_ejecucion >= 0 ? parseNumericValue(row[columnMap.porcentaje_ejecucion]) : null
                    };
                    
                    otImportPreviewRows.push(otData);
                }
                
                // DETECCIÓN DE DUPLICADOS Y CLASIFICACIÓN
                const duplicatesInFile = {};
                const duplicateOTProjects = {}; // Mapa para detectar OT+Proyecto duplicado
                const toCreate = [];
                const toSkip = [];
                const toUpdate = [];

                // Primera pasada: detectar duplicados OT+Proyecto
                otImportPreviewRows.forEach((row, index) => {
                    const otCodeLower = row.ot_code ? row.ot_code.toString().toLowerCase() : '';
                    const projectNameLower = row.nombre_proyecto ? row.nombre_proyecto.toString().toLowerCase() : '';
                    const otProjectKey = `${otCodeLower}|${projectNameLower}`;
                    
                    if (otCodeLower && projectNameLower) {
                        if (!duplicateOTProjects[otProjectKey]) {
                            duplicateOTProjects[otProjectKey] = [];
                        }
                        duplicateOTProjects[otProjectKey].push(index);
                    }
                });

                // Marcar duplicados OT+Proyecto (solo mantener el último)
                const indicesToRemove = new Set();
                Object.keys(duplicateOTProjects).forEach(key => {
                    const indices = duplicateOTProjects[key];
                    if (indices.length > 1) {
                        // Mantener solo el último (índice más alto), marcar los demás para remover
                        for (let i = 0; i < indices.length - 1; i++) {
                            indicesToRemove.add(indices[i]);
                        }
                    }
                });

                // Filtrar duplicados OT+Proyecto (eliminar todos excepto el último)
                otImportPreviewRows = otImportPreviewRows.filter((row, index) => !indicesToRemove.has(index));

                otImportPreviewRows.forEach((row, index) => {
                    const otCodeLower = row.ot_code ? row.ot_code.toString().toLowerCase() : '';
                    
                    // Verificar duplicados en el archivo (mismo OT, distintos proyectos)
                    if (otCodeLower) {
                        if (!duplicatesInFile[otCodeLower]) {
                            duplicatesInFile[otCodeLower] = [];
                        }
                        duplicatesInFile[otCodeLower].push({ index, projectName: row.nombre_proyecto });
                    }
                    
                    // Verificar si existe en la BD
                    const existingInDB = existingOTsInDB[otCodeLower];
                    if (existingInDB && existingInDB.length > 0) {
                        const existing = existingInDB[0];
                        if (row.status && row.status !== existing.status) {
                            // OT existe pero estado diferente → actualizar
                            row.action = 'update';
                            row.oldStatus = existing.status;
                            toUpdate.push(row);
                        } else {
                            // OT existe con todo igual → omitir
                            row.action = 'skip';
                            toSkip.push(row);
                        }
                    } else {
                        // OT no existe → crear
                        row.action = 'create';
                        toCreate.push(row);
                    }
                    
                    // Inicializar createNewProject por defecto según checkbox global
                    const globalCheckbox = document.getElementById('ot-create-projects-checkbox');
                    row.createNewProject = globalCheckbox ? globalCheckbox.checked : true;
                });

                // Mostrar alertas de duplicados en archivo
                const duplicateOTs = Object.keys(duplicatesInFile).filter(code => duplicatesInFile[code].length > 1);
                if (duplicateOTs.length > 0 && otDuplicatesAlert && otDuplicatesList) {
                    let html = '<ul style="margin:0;padding-left:20px;">';
                    duplicateOTs.forEach(code => {
                        const occurrences = duplicatesInFile[code];
                        const projects = occurrences.map(o => o.projectName || 'Sin proyecto').join(', ');
                        html += `<li><strong>${code.toUpperCase()}</strong> aparece ${occurrences.length} veces con proyectos: ${projects}</li>`;
                    });
                    html += '</ul><p style="margin-top:8px;color:#856404;">Se creará 1 OT y se vinculará a todos los proyectos listados.</p>';
                    otDuplicatesList.innerHTML = html;
                    otDuplicatesAlert.style.display = 'block';
                } else if (otDuplicatesAlert) {
                    otDuplicatesAlert.style.display = 'none';
                }

                // Mostrar alertas de OTs a omitir
                if (toSkip.length > 0 && otSkippedAlert && otSkippedList) {
                    let html = '<ul style="margin:0;padding-left:20px;">';
                    toSkip.forEach(ot => {
                        html += `<li><strong>${ot.ot_code}</strong> - ${ot.nombre_proyecto || 'Sin proyecto'} (ya existe con las mismas propiedades)</li>`;
                    });
                    html += '</ul>';
                    otSkippedList.innerHTML = html;
                    otSkippedAlert.style.display = 'block';
                } else if (otSkippedAlert) {
                    otSkippedAlert.style.display = 'none';
                }

                // Mostrar alertas de OTs a actualizar
                if (toUpdate.length > 0 && otUpdatedAlert && otUpdatedList) {
                    let html = '<ul style="margin:0;padding-left:20px;">';
                    toUpdate.forEach(ot => {
                        html += `<li><strong>${ot.ot_code}</strong> - Estado cambiará de "${ot.oldStatus}" a "${ot.status}"</li>`;
                    });
                    html += '</ul>';
                    otUpdatedList.innerHTML = html;
                    otUpdatedAlert.style.display = 'block';
                } else if (otUpdatedAlert) {
                    otUpdatedAlert.style.display = 'none';
                }

                // Filtrar solo las que se van a crear/actualizar para la tabla de previsualización
                otImportPreviewRows = otImportPreviewRows.filter(row => row.action !== 'skip');
                
                renderOTImportPreview();
            };
            reader.readAsBinaryString(file);
        });
    }

    function renderOTImportPreview() {
        if (!otImportPreviewTable) return;
        const tbody = otImportPreviewTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        if (!otImportPreviewRows.length) {
            otImportPreviewArea.style.display = 'none';
            otImportSaveBtn.style.display = 'none';
            otImportCancelBtn.style.display = 'none';
            return;
        }
        
        otImportPreviewArea.style.display = 'block';
        otImportSaveBtn.style.display = 'inline-block';
        otImportCancelBtn.style.display = 'inline-block';
        
        otImportPreviewRows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            
            // Determinar si debe crear nuevo proyecto o usar existente
            const willCreateNew = row.createNewProject !== false && !row.selectedProjectId;
            const hasExistingSelected = row.selectedProjectId ? true : false;
            const noProjectAction = !willCreateNew && !hasExistingSelected;
            
            // Colorear según acción/estado
            if (noProjectAction) {
                // ROJO: Sin proyecto (requiere atención)
                tr.style.backgroundColor = '#f8d7da';
                tr.style.border = '2px solid #dc3545';
            } else if (row.action === 'update') {
                tr.style.backgroundColor = '#d1ecf1'; // Azul claro
            } else if (row.action === 'create') {
                tr.style.backgroundColor = '#d4edda'; // Verde claro
            }
            
            // Badge de acción
            let actionBadge = '';
            if (row.action === 'create') {
                actionBadge = '<span style="background:#28a745;color:white;padding:4px 8px;border-radius:4px;font-size:11px;">✨ CREAR</span>';
            } else if (row.action === 'update') {
                actionBadge = '<span style="background:#17a2b8;color:white;padding:4px 8px;border-radius:4px;font-size:11px;">🔵 ACTUALIZAR</span>';
            }
            
            // Checkbox individual para crear proyecto
            const isCreateChecked = row.createNewProject !== false;
            const createCheckbox = `
                <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;cursor:pointer;">
                    <input type="checkbox" 
                        ${isCreateChecked ? 'checked' : ''} 
                        onchange="window.toggleCreateProject(${idx}, this.checked)"
                        style="cursor:pointer;">
                    <span style="font-weight:bold;color:${isCreateChecked ? '#28a745' : '#6c757d'};">
                        ${isCreateChecked ? '➕ Crear Nuevo' : '➕ Crear Nuevo'}
                    </span>
                </label>
            `;
            
            // Dropdown de proyectos existentes (habilitado/deshabilitado según checkbox)
            const projectOptions = availableProjects.map(p => 
                `<option value="${p.id}" ${row.selectedProjectId == p.id ? 'selected' : ''}>${p.name || p.nombre_proyecto || 'Sin nombre'}</option>`
            ).join('');
            const isDropdownDisabled = isCreateChecked;
            const projectDropdown = `
                <select 
                    id="project-select-${idx}"
                    onchange="window.selectExistingProject(${idx}, this.value)" 
                    ${isDropdownDisabled ? 'disabled' : ''}
                    style="width:100%;padding:6px;border:1px solid ${isDropdownDisabled ? '#ccc' : '#007bff'};border-radius:4px;background:${isDropdownDisabled ? '#e9ecef' : 'white'};cursor:${isDropdownDisabled ? 'not-allowed' : 'pointer'};">
                    <option value="">-- Seleccionar proyecto existente --</option>
                    ${projectOptions}
                </select>
            `;
            
            // Combinar checkbox y dropdown en la misma celda
            const projectControlCell = `
                <div style="padding:4px;">
                    ${createCheckbox}
                    ${projectDropdown}
                    ${noProjectAction ? '<small style="color:#dc3545;font-weight:bold;margin-top:4px;display:block;">⚠️ Seleccione una opción</small>' : ''}
                </div>
            `;
            
            // Select editable para Estado
            const estadoSelect = `
                <select onchange="window.updateOTImportCell(${idx}, 'status', this.value)"
                    style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;">
                    <option value="Cancelado sin importe" ${row.status === 'Cancelado sin importe' ? 'selected' : ''}>Cancelado sin importe</option>
                    <option value="Cerrado" ${row.status === 'Cerrado' ? 'selected' : ''}>Cerrado</option>
                    <option value="En autorizacion de cierre" ${row.status === 'En autorizacion de cierre' ? 'selected' : ''}>En autorizacion de cierre</option>
                    <option value="en ejecucion" ${row.status === 'en ejecucion' ? 'selected' : ''}>en ejecucion</option>
                    <option value="Formalizacion" ${row.status === 'Formalizacion' ? 'selected' : ''}>Formalizacion</option>
                </select>
            `;
            
            // Input editable para Tipo de Servicio
            const tipoServicioInput = `
                <input type="text" 
                    value="${row.tipo_servicio || ''}"
                    onchange="window.updateOTImportCell(${idx}, 'tipo_servicio', this.value)"
                    placeholder="Tipo de servicio"
                    style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;">
            `;
            
            tr.innerHTML = `
                <td style="padding:8px;"><strong>${row.ot_code || ''}</strong></td>
                <td style="padding:8px;">${row.nombre_proyecto || '-'}</td>
                <td style="padding:8px;">${projectControlCell}</td>
                <td style="padding:8px;">${estadoSelect}</td>
                <td style="padding:8px;">${tipoServicioInput}</td>
                <td style="padding:8px;">${actionBadge}</td>
                <td style="padding:8px;">
                    <button type="button" onclick="window.deleteOTImportRow(${idx})" 
                        style="background:#dc3545;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">
                        🗑️
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.updateOTImportCell = function(idx, field, value) {
        if (otImportPreviewRows[idx]) {
            otImportPreviewRows[idx][field] = value;
        }
    };

    window.selectExistingProject = function(idx, projectId) {
        if (otImportPreviewRows[idx]) {
            otImportPreviewRows[idx].selectedProjectId = projectId ? parseInt(projectId) : null;
            // Si selecciona un proyecto existente, desactivar "crear nuevo"
            if (projectId) {
                otImportPreviewRows[idx].createNewProject = false;
            }
            renderOTImportPreview();
        }
    };

    window.toggleCreateProject = function(idx, checked) {
        if (otImportPreviewRows[idx]) {
            otImportPreviewRows[idx].createNewProject = checked;
            // Si activa "crear nuevo", limpiar proyecto seleccionado
            if (checked) {
                otImportPreviewRows[idx].selectedProjectId = null;
            }
            renderOTImportPreview();
        }
    };

    window.assignProjectToOT = function(idx, projectId) {
        if (otImportPreviewRows[idx]) {
            const project = availableProjects.find(p => p.id == projectId);
            otImportPreviewRows[idx].project_id = project ? project.id : null;
            otImportPreviewRows[idx].hasError = !project;
            renderOTImportPreview();
        }
    };

    window.deleteOTImportRow = function(idx) {
        otImportPreviewRows.splice(idx, 1);
        renderOTImportPreview();
    };

    if (otImportCancelBtn) {
        otImportCancelBtn.addEventListener('click', () => {
            otImportPreviewRows = [];
            renderOTImportPreview();
            if (otImportFileStandalone) otImportFileStandalone.value = '';
        });
    }

    if (otImportSaveBtn) {
        otImportSaveBtn.addEventListener('click', async () => {
            if (!otImportPreviewRows.length) {
                Swal.fire({ icon: 'warning', title: 'No hay OTs para guardar' });
                return;
            }
            
            const createProjectsGlobal = otCreateProjectsCheckbox ? otCreateProjectsCheckbox.checked : true;
            
            // Contar cuántos tienen proyecto seleccionado vs crear nuevo
            const withExistingProject = otImportPreviewRows.filter(r => r.selectedProjectId).length;
            const willCreateNew = otImportPreviewRows.filter(r => !r.selectedProjectId && (r.createNewProject !== false)).length;
            
            // Mostrar confirmación
            const result = await Swal.fire({
                title: '¿Continuar con la importación?',
                html: `
                    <p>Se procesarán <strong>${otImportPreviewRows.length}</strong> registros:</p>
                    <ul style="text-align:left;margin:auto;max-width:350px;">
                        <li>✨ Crear OTs: ${otImportPreviewRows.filter(r => r.action === 'create').length}</li>
                        <li>🔵 Actualizar OTs: ${otImportPreviewRows.filter(r => r.action === 'update').length}</li>
                        <li>🔗 Vincular a proyecto existente: ${withExistingProject}</li>
                        <li>➕ Crear proyectos nuevos: ${willCreateNew}</li>
                    </ul>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, importar',
                cancelButtonText: 'Cancelar'
            });
            
            if (!result.isConfirmed) return;
            
            // Mostrar loading
            Swal.fire({
                title: 'Importando...',
                html: 'Por favor espera',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            try {
                // Preparar datos con información de proyecto individual
                const ordersToSend = otImportPreviewRows.map(row => ({
                    ...row,
                    // Si tiene proyecto seleccionado, usarlo; si no, permitir crear según checkbox individual
                    useExistingProject: row.selectedProjectId ? true : false,
                    existingProjectId: row.selectedProjectId || null,
                    createNewProject: row.selectedProjectId ? false : (row.createNewProject !== false)
                }));
                
                const response = await fetch(
                    window.getApiUrl ? window.getApiUrl('/api/orders-of-work/import') : '/api/orders-of-work/import',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            orders: ordersToSend,
                            createProjectsIfNotExist: createProjectsGlobal
                        })
                    }
                );
                
                const data = await response.json();
                
                if (response.ok) {
                    const summary = data.summary || {};
                    let html = `
                        <div style="text-align:left;margin:auto;max-width:400px;">
                            <p><strong>Resumen de importación:</strong></p>
                            <ul>
                                <li>✅ Creadas: ${summary.created || 0}</li>
                                <li>🔗 Vinculadas: ${summary.linked || 0}</li>
                                <li>🔵 Actualizadas: ${summary.updated || 0}</li>
                                <li>⏭️ Omitidas: ${summary.skipped || 0}</li>
                                <li>❌ Fallidas: ${summary.failed || 0}</li>
                            </ul>
                    `;
                    
                    if (data.results.duplicatesInFile && data.results.duplicatesInFile.length > 0) {
                        html += `<p style="margin-top:12px;"><strong>⚠️ Duplicados procesados:</strong> ${data.results.duplicatesInFile.length}</p>`;
                    }
                    
                    html += '</div>';
                    
                    Swal.fire({
                        icon: summary.failed > 0 ? 'warning' : 'success',
                        title: 'Importación completada',
                        html: html,
                        width: '600px'
                    });
                    
                    // Limpiar y recargar
                    otImportPreviewRows = [];
                    renderOTImportPreview();
                    if (otImportFileStandalone) otImportFileStandalone.value = '';
                    
                    // Recargar lista de OTs
                    if (typeof loadOrdersOfWork === 'function') {
                        loadOrdersOfWork();
                    }
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error en importación',
                        text: data.error || 'No se pudo completar la importación'
                    });
                }
            } catch (err) {
                console.error('Error saving orders:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error de conexión',
                    text: 'No se pudo conectar con el servidor'
                });
            }
        });
    }
// ...existing code...
            // --- Importar OTs desde Excel ---
            // Usar la declaración existente de otImportBtn
            const otImportFile = document.getElementById('ot-import-file');
            const otImportStatus = document.getElementById('ot-import-status');
            if (otImportBtn && otImportFile) {
                otImportBtn.addEventListener('click', () => otImportFile.click());
                otImportFile.addEventListener('change', async function(e) {
                    const file = e.target.files[0];
                    if (!file) return;
                    otImportStatus.textContent = 'Procesando archivo...';
                    try {
                        // Cargar XLSX si no existe
                        if (!window.XLSX) {
                            otImportStatus.textContent = 'Cargando librería XLSX...';
                            await new Promise((resolve, reject) => {
                                const script = document.createElement('script');
                                script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                                script.onload = resolve;
                                script.onerror = reject;
                                document.head.appendChild(script);
                            });
                        }
                        const reader = new FileReader();
                        reader.onload = function(evt) {
                            const data = evt.target.result;
                            const workbook = window.XLSX.read(data, { type: 'binary' });
                            const sheet = workbook.Sheets[workbook.SheetNames[0]];
                            const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
                            // Buscar encabezados
                            const header = rows[0];
                            // Indices de columnas necesarias
                            const idxNumOT = header.findIndex(h => h && h.toString().toLowerCase().includes('número ot'));
                            const idxFolioPrincipal = header.findIndex(h => h && h.toString().toLowerCase().includes('folio principal'));
                            const idxFolioSantec = header.findIndex(h => h && h.toString().toLowerCase().includes('folio santec'));
                            const idxNombreProyecto = header.findIndex(h => h && h.toString().toLowerCase().includes('nombre proyecto'));
                            if (idxNumOT < 0 || idxFolioPrincipal < 0 || idxFolioSantec < 0 || idxNombreProyecto < 0) {
                                otImportStatus.textContent = 'No se encontraron las columnas requeridas.';
                                return;
                            }
                            const ots = [];
                            for (let i = 1; i < rows.length; i++) {
                                const row = rows[i];
                                if (!row[idxNumOT]) continue;
                                ots.push({
                                    ot_code: row[idxNumOT],
                                    folio_principal: row[idxFolioPrincipal],
                                    folio_santec: row[idxFolioSantec],
                                    description: row[idxNombreProyecto],
                                    status: 'en ejecucion',
                                    start_date: '',
                                    end_date: ''
                                });
                            }
                            // Agregar OTs a la lista temporal
                            window.currentProjectOTs = window.currentProjectOTs.concat(ots);
                            renderOTList(window.currentProjectOTs);
                            otImportStatus.textContent = `Se importaron ${ots.length} OTs.`;
                        };
                        reader.readAsBinaryString(file);
                    } catch (err) {
                        otImportStatus.textContent = 'Error al procesar archivo.';
                    }
                });
            }
        // --- Vacaciones ---
        const addVacationBtn = document.getElementById('add-vacation-btn');
        const vacationTableBody = document.getElementById('vacation-table-body');
        const vacationGridLoading = document.getElementById('vacation-grid-loading');
        const vacationGridEmpty = document.getElementById('vacation-grid-empty');
        const vacationTable = document.getElementById('vacation-table');
        let allVacations = [];

        async function fetchVacations() {
            try {
                vacationGridLoading.style.display = 'block';
                vacationTable.style.display = 'none';
                vacationGridEmpty.style.display = 'none';
                const url = window.getApiUrl ? window.getApiUrl('/api/vacations') : '/api/vacations';
                const res = await fetch(url);
                if (!res.ok) throw new Error('Error al cargar vacaciones');
                const data = await res.json();
                allVacations = data;
                populateYearFilter();
                renderVacations(data);
            } catch (e) {
                vacationGridLoading.style.display = 'none';
                vacationTable.style.display = 'none';
                vacationGridEmpty.style.display = 'block';
                vacationGridEmpty.innerHTML = '<div style="color:#e53e3e">Error al cargar vacaciones</div>';
            }
        }

        function renderVacations(vacations) {
            vacationTableBody.innerHTML = '';
            if (!vacations || vacations.length === 0) {
                vacationGridLoading.style.display = 'none';
                vacationTable.style.display = 'none';
                vacationGridEmpty.style.display = 'block';
                return;
            }
            vacationGridLoading.style.display = 'none';
            vacationGridEmpty.style.display = 'none';
            vacationTable.style.display = 'table';
            vacations.forEach(vac => {
                const tr = document.createElement('tr');
                // Buscar nombre real del empleado si existe el ID
                let empName = vac.employee_name || '';
                if (vac.employee_id && allEmployeesList.length) {
                    const emp = allEmployeesList.find(e => String(e.id) === String(vac.employee_id));
                    if (emp) empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                }
                tr.innerHTML = `
                    <td>${vac.id}</td>
                    <td>${empName}</td>
                    <td>${vac.start_date || ''}</td>
                    <td>${vac.end_date || ''}</td>
                    <td>${vac.status || ''}</td>
                    <td>
                        <button class="btn-action-edit" data-id="${vac.id}">✏️</button>
                        <button class="btn-action-delete" data-id="${vac.id}" style="margin-left:4px">🗑️</button>
                    </td>
                `;
                vacationTableBody.appendChild(tr);
            });
        }
    // Delegar clicks para editar/eliminar vacaciones
    vacationTableBody?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-action-edit');
        const delBtn = e.target.closest('.btn-action-delete');
        if (editBtn) {
            const id = editBtn.dataset.id;
            const vac = allVacations.find(v => String(v.id) === String(id));
            if (!vac) return alert('No encontrada');
            openVacationModal(true, vac);
        }
        if (delBtn) {
            const id = delBtn.dataset.id;
            const result = await Swal.fire({
                title: '¿Eliminar esta solicitud?',
                text: 'Esta acción no se puede deshacer',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            });
            if (!result.isConfirmed) return;
            await fetch((window.getApiUrl ? window.getApiUrl(`/api/vacations/${id}`) : `/api/vacations/${id}`), {
                method: 'DELETE'
            });
            Swal.fire({
                icon: 'success',
                title: 'Solicitud eliminada',
                timer: 2000,
                showConfirmButton: false
            });
            fetchVacations();
        }
    });

    function filterVacations() {
        const employeeId = document.getElementById('filter-vacation-employee')?.value;
        const status = (document.getElementById('filter-vacation-status')?.value || '').trim();
        const year = (document.getElementById('filter-vacation-year')?.value || '').trim();
        const month = (document.getElementById('filter-vacation-month')?.value || '').trim();
        
        let filtered = allVacations;
        
        if (employeeId) {
            filtered = filtered.filter(v => String(v.employee_id) === String(employeeId));
        }
        if (status) {
            filtered = filtered.filter(v => v.status === status);
        }
        if (year) {
            filtered = filtered.filter(v => {
                const startDate = v.start_date?.split('T')[0] || '';
                return startDate.startsWith(year);
            });
        }
        if (month) {
            filtered = filtered.filter(v => {
                const startDate = v.start_date?.split('T')[0] || '';
                return startDate.includes('-' + month + '-');
            });
        }
        
        renderVacations(filtered);
    }
    
    function populateYearFilter() {
        const years = new Set();
        allVacations.forEach(v => {
            const startDate = v.start_date?.split('T')[0] || '';
            if (startDate) {
                const year = startDate.substring(0, 4);
                if (year) years.add(year);
            }
        });
        
        const yearSelect = document.getElementById('filter-vacation-year');
        if (yearSelect) {
            const selectedYear = yearSelect.value;
            yearSelect.innerHTML = '<option value="">📆 Todos los años</option>';
            
            Array.from(years).sort().reverse().forEach(year => {
                const opt = document.createElement('option');
                opt.value = year;
                opt.textContent = year;
                yearSelect.appendChild(opt);
            });
            
            yearSelect.value = selectedYear;
        }
    }    // Cargar lista de empleados para vacaciones
    let allEmployeesList = [];
    async function loadVacationEmployeeDropdown() {
        const select = document.getElementById('filter-vacation-employee');
        if (!select) return;
        allEmployeesList = await (window.fetchEmployees ? window.fetchEmployees() : []);
        select.innerHTML = '<option value="">👤 Todos los empleados</option>';
        allEmployeesList.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
            select.appendChild(opt);
        });
    }

    document.getElementById('filter-vacation-employee')?.addEventListener('change', filterVacations);
    document.getElementById('filter-vacation-status')?.addEventListener('change', filterVacations);
    document.getElementById('filter-vacation-year')?.addEventListener('change', filterVacations);
    document.getElementById('filter-vacation-month')?.addEventListener('change', filterVacations);
    document.getElementById('filter-vacation-search-btn')?.addEventListener('click', filterVacations);
    document.getElementById('filter-vacation-clear-btn')?.addEventListener('click', () => {
        document.getElementById('filter-vacation-employee').value = '';
        document.getElementById('filter-vacation-status').value = '';
        document.getElementById('filter-vacation-year').value = '';
        document.getElementById('filter-vacation-month').value = '';
        renderVacations(allVacations);
    });

    // Funciones para el modal de vacaciones
    const vacationModal = document.getElementById('vacation-modal');
    const vacationForm = document.getElementById('vacation-form');
    const vacationModalClose = document.getElementById('vacation-modal-close');
    const vacationCancel = document.getElementById('vacation-cancel');
    const vacationSubmit = document.getElementById('vacation-submit');

    async function openVacationModal(isEdit = false, vacation = null) {
        document.getElementById('vacation-modal-title').textContent = isEdit ? 'Editar Solicitud de Vacaciones' : 'Nueva Solicitud de Vacaciones';
        
        // Primero, cargar el dropdown de empleados
        await loadVacationEmployeeDropdownForModal();

        // Luego, llenar los valores
        if (!isEdit) {
            vacationForm.reset();
            document.getElementById('vacation-id').value = '';
        } else if (vacation) {
            console.log('📝 Loading vacation data for edit:', vacation);
            document.getElementById('vacation-id').value = vacation.id || '';
            document.getElementById('vacation-employee').value = vacation.employee_id || '';
            
            // Formatear fechas correctamente (YYYY-MM-DD)
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                // Si es un objeto Date, convertir a string ISO
                if (dateStr instanceof Date) {
                    return dateStr.toISOString().split('T')[0];
                }
                // Si es string, extraer solo la parte YYYY-MM-DD
                if (typeof dateStr === 'string') {
                    return dateStr.split('T')[0];
                }
                return '';
            };
            
            document.getElementById('vacation-start-date').value = formatDate(vacation.start_date);
            document.getElementById('vacation-end-date').value = formatDate(vacation.end_date);
            document.getElementById('vacation-status').value = vacation.status || 'Pendiente';
            console.log('✅ Vacation data loaded', {
                startDate: formatDate(vacation.start_date),
                endDate: formatDate(vacation.end_date)
            });
        }

        vacationModal.style.display = 'flex';
    }

    async function closeVacationModal(skipConfirmation = false) {
        if (!skipConfirmation) {
            const result = await Swal.fire({
                title: '¿Cancelar solicitud?',
                text: 'Los cambios no guardados se perderán',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, cerrar',
                cancelButtonText: 'Continuar editando',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            });
            if (!result.isConfirmed) return;
        }
        vacationModal.style.display = 'none';
        vacationForm.reset();
    }

    async function loadVacationEmployeeDropdownForModal() {
        const select = document.getElementById('vacation-employee');
        allEmployeesList = await (window.fetchEmployees ? window.fetchEmployees() : []);
        select.innerHTML = '<option value="">Seleccionar empleado...</option>';
        allEmployeesList.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
            select.appendChild(opt);
        });
    }

    addVacationBtn?.addEventListener('click', () => openVacationModal(false));
    vacationModalClose?.addEventListener('click', async () => await closeVacationModal());
    vacationCancel?.addEventListener('click', async () => await closeVacationModal());
    vacationModal?.addEventListener('click', async (e) => {
        if (e.target === vacationModal) await closeVacationModal();
    });

    vacationForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('🔔 Submit event fired for vacation form');
        const vacationId = document.getElementById('vacation-id').value;
        const employeeId = document.getElementById('vacation-employee').value;
        const startDate = document.getElementById('vacation-start-date').value;
        const endDate = document.getElementById('vacation-end-date').value;
        const status = document.getElementById('vacation-status').value;

        console.log('📝 Vacation form data:', { vacationId, employeeId, startDate, endDate, status });

        if (!employeeId || !startDate || !endDate) {
            alert('Todos los campos son obligatorios');
            return;
        }

        const emp = allEmployeesList.find(e => String(e.id) === String(employeeId));
        const payload = {
            employee_id: employeeId,
            employee_name: emp ? `${emp.first_name} ${emp.last_name}`.trim() : '',
            start_date: startDate,
            end_date: endDate,
            status: status || 'Pendiente'
        };

        console.log('📤 Sending payload:', payload);

        try {
            const url = vacationId 
                ? (window.getApiUrl ? window.getApiUrl(`/api/vacations/${vacationId}`) : `/api/vacations/${vacationId}`)
                : (window.getApiUrl ? window.getApiUrl('/api/vacations') : '/api/vacations');
            
            const method = vacationId ? 'PUT' : 'POST';
            console.log(`📡 ${method} request to:`, url);
            
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('✅ Response status:', response.status);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            console.log('✅ Success response:', result);
            closeVacationModal(true); // true = skip confirmation
            fetchVacations();
        } catch (err) {
            console.error('❌ Error:', err);
            alert('Error al guardar: ' + err.message);
        }
    });

    // ============ JOB OPENINGS (VACANTES) ============
    const addVacantBtn = document.getElementById('add-vacant-btn');
    const vacantList = document.getElementById('vacant-list');
    const jobOpeningModal = document.getElementById('job-opening-modal');
    const jobOpeningForm = document.getElementById('job-opening-form');
    const jobOpeningModalClose = document.getElementById('job-opening-modal-close');
    const jobOpeningCancel = document.getElementById('job-opening-cancel');
    let allJobOpenings = [];

    // Fetch all job openings
    async function fetchJobOpenings() {
        try {
            const url = window.getApiUrl ? window.getApiUrl('/api/job-openings') : '/api/job-openings';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error al cargar vacantes');
            const data = await res.json();
            allJobOpenings = data;
            renderJobOpenings(data);
        } catch (e) {
            console.error('❌ Error fetching job openings:', e);
            if (vacantList) {
                vacantList.innerHTML = '<li style="color:red;text-align:center;padding:20px">Error al cargar vacantes: ' + e.message + '</li>';
            }
        }
    }

    // Render job openings list
    function renderJobOpenings(jobOpenings) {
        if (!vacantList) return;
        vacantList.innerHTML = '';
        
        if (!jobOpenings || jobOpenings.length === 0) {
            vacantList.innerHTML = '<li style="text-align:center;padding:40px;color:#999"><div style="font-size:48px;margin-bottom:10px">🎯</div><div>No hay vacantes registradas</div></li>';
            return;
        }

        jobOpenings.forEach(job => {
            const li = document.createElement('li');
            li.className = 'candidate-item';
            li.style.cssText = 'background:white;border:1px solid #e0e0e0;border-radius:6px;padding:15px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center';
            
            const statusColorMap = {
                'Activa': '#10b981',
                'Inactiva': '#6b7280',
                'Cubierta': '#3b82f6',
                'Cancelada': '#ef4444'
            };
            const statusColor = statusColorMap[job.status] || '#6b7280';

            li.innerHTML = `
                <div style="flex:1">
                    <div style="font-weight:600;color:#1f2937;margin-bottom:8px">
                        📍 ${job.position_name || 'Sin nombre'}
                    </div>
                    <div style="font-size:13px;color:#6b7280;margin-bottom:6px">
                        <strong>Empresa:</strong> ${job.company || 'N/A'}
                    </div>
                    <div style="font-size:13px;color:#6b7280;margin-bottom:6px">
                        <strong>Contacto:</strong> ${job.contact_person_name || 'N/A'} 
                        ${job.contact_email ? '(' + job.contact_email + ')' : ''}
                    </div>
                    <div style="font-size:12px;color:#9ca3af">
                        <strong>Rol:</strong> ${job.role || 'N/A'} | 
                        <strong>Modalidad:</strong> ${job.work_modality || 'N/A'} |
                        <strong>Sueldo:</strong> $${job.salary || 'N/A'}
                    </div>
                    <div style="font-size:12px;color:#9ca3af;margin-top:6px">
                        <strong>Exp:</strong> ${job.years_experience || 'N/A'} años
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-left:15px">
                    <div style="background:${statusColor};color:white;padding:4px 12px;border-radius:4px;font-size:12px;text-align:center">
                        ${job.status === 'Activa' ? '📍' : job.status === 'Cubierta' ? '✅' : job.status === 'Inactiva' ? '❌' : '🚫'} ${job.status}
                    </div>
                    <button class="btn-action-edit" data-id="${job.id}" style="padding:6px 12px;font-size:12px">✏️ Editar</button>
                    <button class="btn-action-delete" data-id="${job.id}" style="padding:6px 12px;font-size:12px">🗑️ Eliminar</button>
                </div>
            `;
            vacantList.appendChild(li);
        });

        // Agregar event listeners después de renderizar
        vacantList.querySelectorAll('.btn-action-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                const job = allJobOpenings.find(j => String(j.id) === String(id));
                if (job) openJobOpeningModal(true, job);
            });
        });

        vacantList.querySelectorAll('.btn-action-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.closest('button').dataset.id;
                const result = await Swal.fire({
                    title: '¿Eliminar esta vacante?',
                    text: 'Esta acción no se puede deshacer',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#6b7280'
                });
                if (!result.isConfirmed) return;

                try {
                    const url = window.getApiUrl ? window.getApiUrl(`/api/job-openings/${id}`) : `/api/job-openings/${id}`;
                    const res = await fetch(url, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'Deleted' })
                    });
                    if (!res.ok) throw new Error('Error al eliminar');
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Vacante eliminada',
                        timer: 2000,
                        showConfirmButton: false
                    });
                    fetchJobOpenings();
                } catch (err) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error al eliminar',
                        text: err.message
                    });
                }
            });
        });
    }

    // Open/Close modal
    function openJobOpeningModal(isEdit = false, job = null) {
        const title = document.getElementById('job-opening-modal-title');
        title.textContent = isEdit ? '✏️ Editar Vacante' : '🎯 Nueva Vacante';

        // Reset form
        jobOpeningForm.reset();
        document.getElementById('job-opening-id').value = '';

        // Reset file display
        const currentFileDisplay = document.getElementById('current-file-display');
        if (currentFileDisplay) currentFileDisplay.style.display = 'none';

        // Reset tabs - específico para modal de vacantes
        const jobModal = document.getElementById('job-opening-modal');
        if (jobModal) {
            const tabButtons = jobModal.querySelectorAll('.tab-button');
            const tabContents = jobModal.querySelectorAll('.tab-content');
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Activar primer tab
            if (tabButtons.length > 0) tabButtons[0].classList.add('active');
            const firstTab = jobModal.querySelector('#tab-job-opening-datos');
            if (firstTab) firstTab.classList.add('active');
        }

        if (isEdit && job) {
            document.getElementById('job-opening-id').value = job.id;
            document.getElementById('job-company').value = job.company || '';
            document.getElementById('job-contact-name').value = job.contact_person_name || '';
            document.getElementById('job-contact-email').value = job.contact_email || '';
            document.getElementById('job-celula').value = job.celula_id || '';
            document.getElementById('job-area').value = job.area_id || '';
            document.getElementById('job-cell-area').value = job.cell_area || '';
            document.getElementById('job-office-location').value = job.office_location || '';
            document.getElementById('job-work-modality').value = job.work_modality || '';
            document.getElementById('job-salary').value = job.salary || '';
            document.getElementById('job-position-name').value = job.position_name || '';
            document.getElementById('job-role').value = job.role || '';
            document.getElementById('job-years-experience').value = job.years_experience || '';
            document.getElementById('job-technical-tools').value = job.technical_tools || '';
            document.getElementById('job-basic-knowledge').value = job.basic_knowledge || '';
            document.getElementById('job-desirable-code').value = job.desirable_code || '';
            document.getElementById('job-status').value = job.status || 'Activa';
            
            // Mostrar archivo actual si existe
            if (job.file_url) {
                const currentFileDisplay = document.getElementById('current-file-display');
                const currentFileLink = document.getElementById('current-file-link');
                if (currentFileDisplay && currentFileLink) {
                    currentFileDisplay.style.display = 'block';
                    // Construir URL completa del archivo usando el servidor API
                    const apiBaseUrl = window.getApiUrl ? window.getApiUrl('') : 'http://localhost:3000';
                    currentFileLink.href = apiBaseUrl + job.file_url;
                    currentFileLink.textContent = job.file_url.split('/').pop() || 'Ver archivo';
                }
            }
            
            // Cargar contactos comerciales
            loadCommercialContacts(job.id);
        } else {
            // Limpiar contactos si es nueva vacante
            clearCommercialContacts();
        }

        jobOpeningModal.style.display = 'flex';
    }

    function closeJobOpeningModal() {
        jobOpeningModal.style.display = 'none';
        jobOpeningForm.reset();
        // Limpiar contactos comerciales al cerrar el modal
        clearCommercialContacts();
    }

    async function confirmCloseJobOpeningModal(e) {
        e.preventDefault();
        
        // Mostrar confirmación con SweetAlert2 siempre
        const result = await Swal.fire({
            title: '¿Cancelar creación de vacante?',
            text: 'Se perderán los cambios no guardados',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, cerrar',
            cancelButtonText: 'Continuar creando',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#3b82f6'
        });
        
        if (result.isConfirmed) {
            closeJobOpeningModal();
        }
    }

    // Event listeners for modal
    addVacantBtn?.addEventListener('click', () => openJobOpeningModal(false));
    jobOpeningModalClose?.addEventListener('click', confirmCloseJobOpeningModal);
    jobOpeningCancel?.addEventListener('click', confirmCloseJobOpeningModal);
    jobOpeningModal?.addEventListener('click', (e) => {
        if (e.target === jobOpeningModal) confirmCloseJobOpeningModal(e);
    });

    // ============ COMMERCIAL CONTACTS MANAGEMENT ============
    let commercialContactsList = []; // Lista temporal de contactos

    // Función manejadora para eliminar contacto (MÉTODO 3: delegación de eventos)
    const handleDeleteContact = function(e) {
        // Buscar el botón en el target o sus padres (por si se hace click en el emoji)
        let target = e.target;
        let maxDepth = 3; // Máximo 3 niveles hacia arriba
        let depth = 0;
        
        while (target && depth < maxDepth) {
            if (target.classList && target.classList.contains('delete-contact-btn')) {
                e.preventDefault();
                e.stopImmediatePropagation(); // Detener TODOS los eventos
                
                const index = parseInt(target.getAttribute('data-contact-index'));
                deleteCommercialContactByIndex(index);
                return; // Detener la búsqueda si se encontró el botón
            }
            target = target.parentElement;
            depth++;
        }
    };

    // Función global para eliminar contacto por índice (usada por todos los métodos)
    window.deleteCommercialContactByIndex = function(index) {
        if (!isNaN(index) && index >= 0 && index < commercialContactsList.length) {
            const contact = commercialContactsList[index];
            
            Swal.fire({
                title: '¿Eliminar contacto?',
                text: `Se eliminará ${contact.full_name} de la lista`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            }).then((result) => {
                if (result.isConfirmed) {
                    commercialContactsList.splice(index, 1);
                    renderCommercialContacts();
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Contacto eliminado',
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
            });
        }
    };

    // Función para renderizar la lista de contactos
    function renderCommercialContacts() {
        const listContainer = document.getElementById('commercial-contacts-list');
        const noContactsMsg = document.getElementById('no-contacts-message');
        const contactsCount = document.getElementById('contacts-count');
        
        if (!listContainer) return;

        // Actualizar contador
        if (contactsCount) {
            contactsCount.textContent = commercialContactsList.length;
        }

        // Si no hay contactos, mostrar mensaje
        if (commercialContactsList.length === 0) {
            if (noContactsMsg) {
                noContactsMsg.style.display = 'block';
            }
            // Limpiar lista excepto el mensaje
            const items = listContainer.querySelectorAll('.contact-list-item');
            items.forEach(item => item.remove());
            return;
        }

        // Ocultar mensaje de "no hay contactos"
        if (noContactsMsg) {
            noContactsMsg.style.display = 'none';
        }

        // Limpiar lista actual
        const items = listContainer.querySelectorAll('.contact-list-item');
        items.forEach(item => item.remove());

        // Renderizar cada contacto
        commercialContactsList.forEach((contact, index) => {
            const item = document.createElement('div');
            item.className = 'contact-list-item';
            item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #e5e7eb;transition:background 0.2s';
            
            // Crear el contenido del contacto
            const contactInfo = document.createElement('div');
            contactInfo.style.cssText = 'flex:1';
            contactInfo.innerHTML = `
                <div style="font-weight:600;color:#374151;margin-bottom:4px">
                    👤 ${contact.full_name}
                </div>
                <div style="font-size:13px;color:#6b7280">
                    <span style="margin-right:15px">📧 ${contact.email}</span>
                    ${contact.phone ? `<span style="margin-right:15px">📱 ${contact.phone}</span>` : ''}
                    ${contact.location ? `<span>📍 ${contact.location}</span>` : ''}
                </div>
            `;
            
            // Crear el botón de eliminar con MÚLTIPLES formas de activación
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.setAttribute('data-contact-index', index);
            deleteBtn.className = 'delete-contact-btn';
            deleteBtn.style.cssText = 'background:#ef4444;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:14px;transition:background 0.2s';
            deleteBtn.title = 'Eliminar contacto';
            deleteBtn.innerHTML = '🗑️ Eliminar';
            
            // MÉTODO 1: Onclick directo (respaldo más inmediato)
            deleteBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                deleteCommercialContactByIndex(index);
            };
            
            // MÉTODO 2: Event listener directo en el botón
            deleteBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                deleteCommercialContactByIndex(index);
            }, true);
            
            // Event listeners para hover
            deleteBtn.addEventListener('mouseover', function() {
                this.style.background = '#dc2626';
            });
            deleteBtn.addEventListener('mouseout', function() {
                this.style.background = '#ef4444';
            });
            
            item.appendChild(contactInfo);
            item.appendChild(deleteBtn);
            listContainer.appendChild(item);
        });
        
        // SOLUCIÓN ROBUSTA: Múltiples listeners + atributo onclick de respaldo
        // 1. Listener en el contenedor específico (más directo)
        const contactsContainer = document.getElementById('commercial-contacts-list');
        if (contactsContainer) {
            // Remover listeners anteriores clonando el nodo
            const newContainer = contactsContainer.cloneNode(true);
            contactsContainer.parentNode.replaceChild(newContainer, contactsContainer);
            
            // Agregar nuevo listener con captura = true (fase de captura, más temprano)
            newContainer.addEventListener('click', handleDeleteContact, true);
        }
        
        // 2. Listener global de respaldo
        document.removeEventListener('click', handleDeleteContact, true);
        document.addEventListener('click', handleDeleteContact, true);
    }

    // Función para agregar contacto desde el formulario fijo
    function addCommercialContactFromForm() {
        const nameInput = document.getElementById('new-contact-name');
        const emailInput = document.getElementById('new-contact-email');
        const phoneInput = document.getElementById('new-contact-phone');
        const locationInput = document.getElementById('new-contact-location');
        
        if (!nameInput || !emailInput) return;

        const fullName = nameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        const phone = phoneInput.value.trim();
        const location = locationInput.value.trim();

        // Validación
        if (!fullName || !email) {
            Swal.fire({
                icon: 'warning',
                title: 'Campos requeridos',
                text: 'El nombre completo y el email son obligatorios'
            });
            return;
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Swal.fire({
                icon: 'warning',
                title: 'Email inválido',
                text: 'Por favor ingresa un email válido'
            });
            return;
        }

        // Verificar si el email ya existe en la lista
        const emailExists = commercialContactsList.some(c => c.email === email);
        if (emailExists) {
            Swal.fire({
                icon: 'warning',
                title: 'Email duplicado',
                text: 'Ya existe un contacto con este email'
            });
            return;
        }

        // Agregar a la lista
        commercialContactsList.push({
            full_name: fullName,
            email: email,
            phone: phone || null,
            location: location || null
        });

        // Limpiar formulario
        nameInput.value = '';
        emailInput.value = '';
        phoneInput.value = '';
        locationInput.value = '';

        // Re-renderizar lista
        renderCommercialContacts();

        // Feedback visual
        Swal.fire({
            icon: 'success',
            title: 'Contacto agregado',
            text: `${fullName} ha sido agregado a la lista`,
            timer: 1500,
            showConfirmButton: false
        });

        // Focus en el campo de nombre para agregar otro
        nameInput.focus();
    }
    
    // Exponer función globalmente para acceso desde event listeners
    window.addCommercialContactFromForm = addCommercialContactFromForm;

    // Obtener datos de todos los contactos (para enviar al guardar)
    function getCommercialContactsData() {
        return commercialContactsList;
    }

    // Limpiar contactos (cuando se cierra el modal o se crea nueva vacante)
    function clearCommercialContacts() {
        commercialContactsList = [];
        renderCommercialContacts();
        
        // Limpiar también los inputs del formulario
        const nameInput = document.getElementById('new-contact-name');
        const emailInput = document.getElementById('new-contact-email');
        const phoneInput = document.getElementById('new-contact-phone');
        const locationInput = document.getElementById('new-contact-location');
        
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (locationInput) locationInput.value = '';
    }

    // Cargar contactos desde API (cuando se edita una vacante)
    async function loadCommercialContacts(jobOpeningId) {
        try {
            const url = window.getApiUrl 
                ? window.getApiUrl(`/api/job-openings/${jobOpeningId}/commercial-contacts`) 
                : `/api/job-openings/${jobOpeningId}/commercial-contacts`;
            
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('No se pudieron cargar contactos comerciales');
                return;
            }
            
            const contacts = await res.json();
            
            // Limpiar lista actual
            commercialContactsList = [];
            
            // Agregar contactos de la DB a la lista
            contacts.forEach(contact => {
                commercialContactsList.push({
                    id: contact.id, // Mantener el ID de DB para actualizaciones
                    full_name: contact.full_name,
                    email: contact.email,
                    phone: contact.phone,
                    location: contact.location
                });
            });
            
            // Renderizar lista
            renderCommercialContacts();
            
        } catch (err) {
            console.error('Error cargando contactos comerciales:', err);
        }
    }

    // Event listener para Enter en los campos del formulario
    ['new-contact-name', 'new-contact-email', 'new-contact-phone', 'new-contact-location'].forEach(inputId => {
        const input = document.getElementById(inputId);
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCommercialContactFromForm();
            }
        });
    });

    // ============ END COMMERCIAL CONTACTS MANAGEMENT ============

    // Real-time validation for job opening form inputs
    const jobContactNameInput = document.getElementById('new-contact-name');
    const jobContactPhoneInput = document.getElementById('new-contact-phone');
    const jobCompanyContactNameInput = document.getElementById('job-contact-name');

    if (jobContactNameInput) {
        jobContactNameInput.addEventListener('input', (e) => {
            // Replace invalid characters in real-time
            e.target.value = e.target.value.replace(/[^A-Za-zñÑáéíóúÁÉÍÓÚ\s]/g, '');
        });
    }

    if (jobContactPhoneInput) {
        jobContactPhoneInput.addEventListener('input', (e) => {
            // Only allow numbers and limit to 10 digits
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
    }

    if (jobCompanyContactNameInput) {
        jobCompanyContactNameInput.addEventListener('input', (e) => {
            // Replace invalid characters in real-time
            e.target.value = e.target.value.replace(/[^A-Za-zñÑáéíóúÁÉÍÓÚ\s]/g, '');
        });
    }

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = btn.dataset.tab;
            
            // Remove active from all tabs
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active to clicked tab
            btn.classList.add('active');
            const tabContent = document.getElementById(tabName);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    // Form submit
    jobOpeningForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('job-opening-id').value;
        
        // Obtener valores con trim() para evitar problemas con espacios
        const company = document.getElementById('job-company').value.trim();
        const contactName = document.getElementById('job-contact-name').value.trim();
        const contactEmail = document.getElementById('job-contact-email').value.trim();
        const positionName = document.getElementById('job-position-name').value.trim();
        const celulaId = document.getElementById('job-celula').value;
        const areaId = document.getElementById('job-area').value;
        
        const payload = {
            company: company,
            contact_person_name: contactName,
            contact_email: contactEmail,
            celula_id: celulaId ? parseInt(celulaId) : null,
            area_id: areaId ? parseInt(areaId) : null,
            cell_area: document.getElementById('job-cell-area').value.trim(),
            office_location: document.getElementById('job-office-location').value.trim(),
            work_modality: document.getElementById('job-work-modality').value,
            salary: parseFloat(document.getElementById('job-salary').value) || null,
            position_name: positionName,
            role: document.getElementById('job-role').value.trim(),
            years_experience: document.getElementById('job-years-experience').value.trim(),
            technical_tools: document.getElementById('job-technical-tools').value.trim(),
            basic_knowledge: document.getElementById('job-basic-knowledge').value.trim(),
            desirable_code: document.getElementById('job-desirable-code').value.trim(),
            status: document.getElementById('job-status').value,
            commercial_contacts: getCommercialContactsData()
        };

        // Validación con valores trimmed
        if (!company || !contactName || !contactEmail || !positionName) {
            Swal.fire({
                icon: 'warning',
                title: 'Campos requeridos',
                text: 'Empresa, Contacto, Email y Puesto son obligatorios'
            });
            return;
        }

        // Validar que nombre del contacto solo contenga letras
        const nameRegex = /^[A-Za-zñÑáéíóúÁÉÍÓÚ\s]+$/;
        if (!nameRegex.test(contactName)) {
            Swal.fire({
                icon: 'warning',
                title: 'Nombre de contacto inválido',
                text: 'El nombre del contacto solo puede contener letras'
            });
            return;
        }

        // Validar contactos comerciales - que nombres solo contengan letras y teléfono sea válido
        const commercialContacts = getCommercialContactsData();
        for (const contact of commercialContacts) {
            if (contact.name && !nameRegex.test(contact.name)) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Nombre de contacto comercial inválido',
                    text: 'El nombre solo puede contener letras: ' + contact.name
                });
                return;
            }
            if (contact.phone && !/^[0-9]{10}$/.test(contact.phone)) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Teléfono de contacto inválido',
                    text: 'El teléfono debe contener exactamente 10 dígitos. Contacto: ' + contact.name
                });
                return;
            }
        }

        try {
            // Crear FormData si hay archivo
            const fileInput = document.getElementById('job-file');
            let finalPayload = payload;
            let headers = { 'Content-Type': 'application/json' };
            let body = JSON.stringify(payload);

            // Si hay archivo, usar FormData
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const formData = new FormData();
                formData.append('file', fileInput.files[0]);
                formData.append('data', JSON.stringify(payload));
                body = formData;
                headers = {}; // Dejar que el navegador establezca Content-Type con boundary
            }

            const url = id 
                ? (window.getApiUrl ? window.getApiUrl(`/api/job-openings/${id}`) : `/api/job-openings/${id}`)
                : (window.getApiUrl ? window.getApiUrl('/api/job-openings') : '/api/job-openings');

            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers,
                body
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const result = await res.json();

            Swal.fire({
                icon: 'success',
                title: id ? 'Vacante actualizada' : 'Vacante creada',
                timer: 2000,
                showConfirmButton: false
            });

            closeJobOpeningModal();
            fetchJobOpenings();
        } catch (err) {
            console.error('❌ Error:', err);
            Swal.fire({
                icon: 'error',
                title: 'Error al guardar',
                text: err.message
            });
        }
    });

    // Filtrado de vacantes
    function filterJobOpenings() {
        const empresa = document.getElementById('filter-vacante-empresa')?.value.toLowerCase() || '';
        const puesto = document.getElementById('filter-vacante-puesto')?.value.toLowerCase() || '';
        const status = document.getElementById('filter-vacante-status')?.value || '';

        const filtered = allJobOpenings.filter(job => {
            const matchEmpresa = !empresa || (job.company || '').toLowerCase().includes(empresa);
            const matchPuesto = !puesto || (job.position_name || '').toLowerCase().includes(puesto) || (job.role || '').toLowerCase().includes(puesto);
            const matchStatus = !status || job.status === status;
            
            return matchEmpresa && matchPuesto && matchStatus;
        });

        renderJobOpenings(filtered);
    }

    // Event listeners para filtros
    document.getElementById('filter-vacante-search-btn')?.addEventListener('click', filterJobOpenings);
    document.getElementById('filter-vacante-clear-btn')?.addEventListener('click', () => {
        document.getElementById('filter-vacante-empresa').value = '';
        document.getElementById('filter-vacante-puesto').value = '';
        document.getElementById('filter-vacante-status').value = '';
        renderJobOpenings(allJobOpenings);
    });

    // Filtrar en tiempo real cuando cambia el status
    document.getElementById('filter-vacante-status')?.addEventListener('change', filterJobOpenings);

    // Initial load
    fetchJobOpenings();

    const employeeForm = document.getElementById('employee-form');
    const candidateForm = document.getElementById('candidate-form');
    const navLinks = document.querySelectorAll('.nav a');
    const views = document.querySelectorAll('.view');
    const modal = document.getElementById('employee-modal');
    const candidateModal = document.getElementById('candidate-modal');
    const addBtn = document.getElementById('add-employee-btn');
    const addCandidateBtn = document.getElementById('add-candidate-btn');
    const modalClose = document.getElementById('modal-close');
    const candidateModalClose = document.getElementById('candidate-modal-close');
    const candidateCancelBtn = document.getElementById('candidate-cancel');
    const cancelBtn = document.getElementById('employee-cancel');

    // Load catalog dropdowns for employee form
    async function loadCatalogDropdowns() {
        console.log('🔄 Loading catalog dropdowns...');
        try {
            const [entities, positions, areas, projects, cells, contractTypes, contractSchemes] = await Promise.all([
                fetch(window.getApiUrl ? window.getApiUrl('/api/mastercode/Entidad') : '/api/mastercode/Entidad').then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl ? window.getApiUrl('/api/mastercode/Puestos%20roles') : '/api/mastercode/Puestos%20roles').then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl ? window.getApiUrl('/api/mastercode/Areas') : '/api/mastercode/Areas').then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl ? window.getApiUrl('/api/projects') : '/api/projects').then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl ? window.getApiUrl('/api/mastercode/Celulas') : '/api/mastercode/Celulas').then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl ? window.getApiUrl('/api/contract-types') : '/api/contract-types').then(r => r.json()).catch(() => []),
                fetch(window.getApiUrl ? window.getApiUrl('/api/contract-schemes') : '/api/contract-schemes').then(r => r.json()).catch(() => [])
            ]);

            console.log(`✅ Loaded catalogs: ${entities.length} entities, ${positions.length} positions, ${areas.length} areas, ${projects.length} projects, ${cells.length} cells`);

            const entitySelect = document.getElementById('employee-entity');
            const positionSelect = document.getElementById('employee-position');
            const areaSelect = document.getElementById('employee-area');
            const projectSelect = document.getElementById('employee-project');
            const cellSelect = document.getElementById('employee-cell');
            const contractTypeSelect = document.getElementById('employee-contract-type');
            const contractSchemeSelect = document.getElementById('employee-contract-scheme');

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

            // Populate projects (with celula_id as data attribute)
            if (projectSelect) {
                projectSelect.innerHTML = '<option value="">Seleccionar proyecto...</option>';
                projects.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    // Store celula_id for auto-selection
                    if (p.celula_id) {
                        opt.setAttribute('data-celula-id', p.celula_id);
                    }
                    projectSelect.appendChild(opt);
                });
                
                // Add listener to auto-select celula when project is selected
                projectSelect.addEventListener('change', function() {
                    const selectedOption = this.options[this.selectedIndex];
                    const celulaId = selectedOption.getAttribute('data-celula-id');
                    const cellSelect = document.getElementById('employee-cell');
                    
                    if (celulaId && cellSelect) {
                        // Auto-select the celula
                        cellSelect.value = celulaId;
                        // Disable celula select when project is selected
                        cellSelect.disabled = this.value !== '';
                    } else if (cellSelect) {
                        // Re-enable celula select if no project selected
                        cellSelect.disabled = false;
                    }
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

            // Populate cells for job openings
            const jobCelulaSelect = document.getElementById('job-celula');
            if (jobCelulaSelect) {
                jobCelulaSelect.innerHTML = '<option value="">Seleccionar célula...</option>';
                cells.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    jobCelulaSelect.appendChild(opt);
                });
            }

            // Populate areas for job openings
            const jobAreaSelect = document.getElementById('job-area');
            if (jobAreaSelect) {
                jobAreaSelect.innerHTML = '<option value="">Seleccionar área (opcional)...</option>';
                areas.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = a.name;
                    jobAreaSelect.appendChild(opt);
                });
            }
               
            // Populate contract types
            if (contractTypeSelect) {
                contractTypeSelect.innerHTML = '<option value="">Seleccionar tipo...</option>';
                contractTypes.forEach(ct => {
                    const opt = document.createElement('option');
                    opt.value = ct.id;
                    opt.textContent = ct.name;
                    contractTypeSelect.appendChild(opt);
                });
            }

            // Populate contract schemes
            if (contractSchemeSelect) {
                contractSchemeSelect.innerHTML = '<option value="">Seleccionar esquema...</option>';
                contractSchemes.forEach(cs => {
                    const opt = document.createElement('option');
                    opt.value = cs.id;
                    opt.textContent = cs.name;
                    contractSchemeSelect.appendChild(opt);
                });
            }

            // Populate project celula selector
            const projectCelulaSelect = document.getElementById('project-celula');
            if (projectCelulaSelect) {
                projectCelulaSelect.innerHTML = '<option value="">-- Seleccione una célula --</option>';
                cells.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.item || c.name; // mastercode usa 'item' como nombre
                    projectCelulaSelect.appendChild(opt);
                });
                console.log(`✅ ${cells.length} células cargadas en selector de proyecto`);
            }

            // Populate project celula filter
            const filterProjectCelula = document.getElementById('filter-project-celula');
            if (filterProjectCelula) {
                filterProjectCelula.innerHTML = '<option value="">🏢 Todas las células</option>';
                cells.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.item || c.name; // mastercode usa 'item' como nombre
                    filterProjectCelula.appendChild(opt);
                });
                console.log(`✅ ${cells.length} células cargadas en filtro`);
            }

            console.log('✅ All dropdowns populated successfully');
        } catch (e) {
            console.error('❌ Error loading catalog dropdowns:', e);
        }
    }

    function showView(id){
        views.forEach(v=> v.id === id ? v.style.display = '' : v.style.display = 'none');
        navLinks.forEach(a=> a.dataset.view === id ? a.classList.add('active') : a.classList.remove('active'));
        // Recargar datos cuando se accede a la vista de empleados
        if (id === 'alta') {
            loadAndRender();
        }
        // Cargar órdenes de trabajo cuando se accede a la vista
        if (id === 'ordenes-trabajo') {
            window.loadOrdersOfWork();
        }
        // Cargar células cuando se accede a la vista
        if (id === 'celulas') {
            if (typeof window.loadCelulas === 'function') {
                window.loadCelulas();
            }
        }
        // Cargar licitaciones cuando se accede a la vista
        if (id === 'licitaciones') {
            if (typeof window.loadLicitaciones === 'function') {
                window.loadLicitaciones();
            }
        }
    }

    // Hacer showView global para HTML inline onclick
    window.showView = showView;

    async function openModal(isEdit = false, isReadOnly = false){
        console.log('🔓 Abriendo modal, isEdit:', isEdit, 'isReadOnly:', isReadOnly);
        
        // Configurar título según modo
        const titleMap = {
            readOnly: '👁️ Ver Información del Empleado',
            edit: 'Actualizar Empleado',
            new: 'Agregar Empleado'
        };
        const mode = isReadOnly ? 'readOnly' : (isEdit ? 'edit' : 'new');
        document.getElementById('modal-title').textContent = titleMap[mode];
        
        // Guardar estado readOnly en el modal
        modal.dataset.readOnly = isReadOnly ? 'true' : 'false';
        
        modal.style.display = 'flex';
        if (!isEdit) {
            window.clearInputFields();
        }
        
        // Always reload catalogs to ensure they're up to date
        await loadCatalogDropdowns();
        
        // Configurar botones según modo
        const submitBtn = document.getElementById('employee-submit');
        const cancelBtn = document.getElementById('employee-cancel');
        
        // Configurar botones según modo (la aplicación de readOnly se hará después de populateForm)
        if (isReadOnly) {
            // Ocultar botón de guardar
            if (submitBtn) submitBtn.style.display = 'none';
            
            // Cambiar botón Cancelar a Cerrar
            if (cancelBtn) {
                cancelBtn.textContent = 'Cerrar';
                cancelBtn.style.background = '#6b7280';
            }
        } else {
            // Habilitar campos en modo edición/creación
            const form = document.getElementById('employee-form');
            
            // Remover cualquier div de solo lectura previo
            const readOnlyFields = form.querySelectorAll('.readonly-field');
            readOnlyFields.forEach(field => field.remove());
            
            // Restaurar y habilitar todos los campos
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                input.style.display = '';
                input.disabled = false;
                input.style.color = '';
                input.style.opacity = '1';
                input.style.backgroundColor = '';
            });
            
            // Mostrar botón de guardar
            if (submitBtn) submitBtn.style.display = 'inline-block';
            
            // Restaurar botón Cancelar
            if (cancelBtn) {
                cancelBtn.textContent = 'Cancelar';
                cancelBtn.style.background = '';
            }
        }
        
        // Ocultar/mostrar pestaña de Asignaciones según el modo
        const assignmentsTab = document.querySelector('.tab-button[data-tab="asignaciones"]');
        const assignmentsContent = document.getElementById('tab-asignaciones');
        
        if (isEdit) {
            // Modo edición/visualización: mostrar pestaña de Asignaciones
            if (assignmentsTab) assignmentsTab.style.display = '';
            if (assignmentsContent) assignmentsContent.style.display = '';
        } else {
            // Modo agregar nuevo: ocultar pestaña de Asignaciones
            if (assignmentsTab) assignmentsTab.style.display = 'none';
            if (assignmentsContent) assignmentsContent.style.display = 'none';
        }
        
        // Activar primera pestaña automáticamente con más tiempo para el modo editar
        const delay = isEdit ? 300 : 100;
        setTimeout(() => {
            console.log('⏰ Activando pestaña general después de', delay, 'ms');
            switchTab('general');
        }, delay);
    }

    // Función para aplicar modo solo lectura DESPUÉS de poblar el formulario
    function applyReadOnlyMode() {
        const form = document.getElementById('employee-form');
        if (!form) return;
        
        // Reemplazar selects con divs de solo lectura
        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            const selectedOption = select.options[select.selectedIndex];
            const displayValue = selectedOption && selectedOption.value ? selectedOption.textContent : 'Sin datos';
            
            // Crear div de reemplazo
            const readOnlyDiv = document.createElement('div');
            readOnlyDiv.className = 'readonly-field';
            readOnlyDiv.textContent = displayValue;
            readOnlyDiv.style.cssText = 'padding:12px; background:#f5f5f5; border:1px solid #e5e7eb; border-radius:6px; color:#000000; min-height:44px; display:flex; align-items:center;';
            readOnlyDiv.dataset.originalSelectId = select.id;
            
            // Insertar después del select y ocultar select
            select.style.display = 'none';
            select.parentNode.insertBefore(readOnlyDiv, select.nextSibling);
        });
        
        // Procesar inputs y textareas
        const inputs = form.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const value = input.value?.trim();
            
            if (!value) {
                // Si está vacío, reemplazar con "Sin datos"
                const readOnlyDiv = document.createElement('div');
                readOnlyDiv.className = 'readonly-field';
                readOnlyDiv.textContent = 'Sin datos';
                readOnlyDiv.style.cssText = 'padding:12px; background:#f5f5f5; border:1px solid #e5e7eb; border-radius:6px; color:#999999; min-height:44px; display:flex; align-items:center; font-style:italic;';
                readOnlyDiv.dataset.originalInputId = input.id;
                
                input.style.display = 'none';
                input.parentNode.insertBefore(readOnlyDiv, input.nextSibling);
            } else {
                // Si tiene valor, solo deshabilitar y estilizar
                input.disabled = true;
                input.style.color = '#000000';
                input.style.opacity = '1';
                input.style.backgroundColor = '#f5f5f5';
            }
        });
    }
    
    // Exponer función globalmente
    window.applyReadOnlyMode = applyReadOnlyMode;

    async function closeModal(skipConfirmation = false){
        // Si está en modo solo lectura, cerrar sin confirmación
        const isReadOnly = modal.dataset.readOnly === 'true';
        
        if (!skipConfirmation && !isReadOnly) {
            const result = await Swal.fire({
                title: '¿Cancelar edición de empleado?',
                text: 'Se perderán los cambios no guardados',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, cerrar',
                cancelButtonText: 'Continuar editando',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#3b82f6'
            });
            if (!result.isConfirmed) return;
        }
        
        // Limpiar campos de solo lectura antes de cerrar
        const form = document.getElementById('employee-form');
        if (form) {
            const readOnlyFields = form.querySelectorAll('.readonly-field');
            readOnlyFields.forEach(field => field.remove());
            
            // Restaurar visibilidad de todos los campos
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                input.style.display = '';
                input.disabled = false;
                input.style.color = '';
                input.style.opacity = '';
                input.style.backgroundColor = '';
            });
        }
        
        modal.style.display = 'none';
        modal.dataset.readOnly = 'false';
        window.clearInputFields();
    }

    // Simplified direct tab switching function
    function switchTabDirect(tabName) {
        console.log('🎯 Direct tab switch to:', tabName);
        
        try {
            // Remove active from all buttons
            const allButtons = document.querySelectorAll('.tab-button');
            console.log('Found buttons:', allButtons.length);
            allButtons.forEach(btn => {
                btn.classList.remove('active');
                console.log('Removed active from button:', btn.textContent.trim());
            });
            
            // Remove active from all contents
            const allContents = document.querySelectorAll('.tab-content');
            console.log('Found contents:', allContents.length);
            allContents.forEach(content => {
                content.classList.remove('active');
                console.log('Removed active from content:', content.id);
            });
            
            // Add active to selected content
            const selectedContent = document.getElementById(`tab-${tabName}`);
            if (selectedContent) {
                selectedContent.classList.add('active');
                console.log('✅ Activated content:', `tab-${tabName}`);
            } else {
                console.error('❌ Content not found:', `tab-${tabName}`);
                return false;
            }
            
            // Add active to correct button - find by onclick text content
            let buttonActivated = false;
            allButtons.forEach(btn => {
                if (btn.onclick && btn.onclick.toString().includes(`'${tabName}'`)) {
                    btn.classList.add('active');
                    console.log('✅ Activated button:', btn.textContent.trim());
                    buttonActivated = true;
                }
            });
            
            if (!buttonActivated) {
                console.error('❌ No button activated for:', tabName);
            }
            
            console.log('✅ Tab switch completed successfully');
            
            // Load HR data if needed
            if (tabName === 'hr') {
                const employeeId = document.getElementById('employee-id')?.value;
                if (employeeId) {
                    console.log('📊 Loading HR data for employee:', employeeId);
                    loadEmployeeContracts(employeeId);
                    loadEmployeeBanking(employeeId);
                }
            }
            
            // Load Assignments data if needed
            if (tabName === 'asignaciones') {
                const employeeId = document.getElementById('employee-id')?.value;
                if (employeeId) {
                    console.log('📋 Loading assignments data for employee:', employeeId);
                    loadEmployeeAssignments(employeeId);
                }
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error in switchTabDirect:', error);
            return false;
        }
    }

    // Make it globally available
    window.switchTabDirect = switchTabDirect;

    // Make switchTab available globally for backwards compatibility
    window.switchTab = switchTabDirect;
    
    // Global test function
    window.testTabs = function() {
        console.log('=== TESTING ALL TABS ===');
        ['general', 'expediente', 'hr'].forEach(tab => {
            console.log(`\n--- Testing ${tab} ---`);
            const result = switchTabDirect(tab);
            console.log(`Result: ${result ? 'SUCCESS' : 'FAILED'}`);
        });
    };
    
    // Global debug function
    window.debugTabState = function() {
        console.log('=== TAB STATE DEBUG ===');
        
        const buttons = document.querySelectorAll('.tab-button');
        console.log(`\nButtons (${buttons.length}):`);
        buttons.forEach((btn, i) => {
            console.log(`  ${i+1}. "${btn.textContent.trim()}" - active: ${btn.classList.contains('active')} - onclick: ${!!btn.onclick}`);
        });
        
        const contents = document.querySelectorAll('.tab-content');
        console.log(`\nContents (${contents.length}):`);
        contents.forEach((content, i) => {
            console.log(`  ${i+1}. ${content.id} - active: ${content.classList.contains('active')} - display: ${getComputedStyle(content).display}`);
        });
        
        console.log('\nFunctions available:');
        console.log('  window.switchTabDirect:', typeof window.switchTabDirect);
        console.log('  window.testTabs:', typeof window.testTabs);
    };

    // Load employee contracts for HR tab
    async function loadEmployeeContracts(employeeId) {
        if (!employeeId) {
            document.getElementById('contracts-list').innerHTML = '<p><em>No hay contratos aún</em></p>';
            return;
        }

        try {
            const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${employeeId}/contracts`) : `/api/employees-v2/${employeeId}/contracts`;
            const contracts = await fetch(url).then(r => r.json());
            const contractsList = document.getElementById('contracts-list');
            
            if (contracts.length === 0) {
                contractsList.innerHTML = '<p><em>No hay contratos aún</em></p>';
                return;
            }

            contractsList.innerHTML = contracts.map(contract => {
                const isActive = contract.is_active;
                const startDate = contract.start_date ? new Date(contract.start_date).toLocaleDateString() : 'N/A';
                const endDate = contract.end_date ? new Date(contract.end_date).toLocaleDateString() : 'Vigente';
                
                return `
                    <div class="contract-item ${isActive ? 'contract-active' : ''}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <strong>${contract.contract_type_name || 'Tipo no especificado'}</strong>
                            ${isActive ? '<span style="color:#007bff;font-weight:bold;">ACTIVO</span>' : ''}
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:14px;">
                            <div><strong>Esquema:</strong> ${contract.contract_scheme_name || 'N/A'}</div>
                            <div><strong>Período:</strong> ${startDate} - ${endDate}</div>
                            <div><strong>Salario bruto:</strong> ${contract.gross_monthly_salary ? '$' + parseFloat(contract.gross_monthly_salary).toLocaleString() : 'N/A'}</div>
                            <div><strong>Salario neto:</strong> ${contract.net_monthly_salary ? '$' + parseFloat(contract.net_monthly_salary).toLocaleString() : 'N/A'}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading contracts:', error);
            document.getElementById('contracts-list').innerHTML = '<p><em>Error cargando historial de contratos</em></p>';
        }
    }

    // Load employee banking info for HR tab
    async function loadEmployeeBanking(employeeId) {
        if (!employeeId) return;

        try {
            const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${employeeId}/banking`) : `/api/employees-v2/${employeeId}/banking`;
            const banking = await fetch(url).then(r => r.json());
            if (banking) {
                document.getElementById('employee-bank-name').value = banking.bank_name || '';
                document.getElementById('employee-account-holder').value = banking.account_holder_name || '';
                document.getElementById('employee-account-number').value = banking.account_number || '';
                document.getElementById('employee-clabe').value = banking.clabe_interbancaria || '';
            }
        } catch (error) {
            console.error('Error loading banking info:', error);
        }
    }

    // Load employee assignments history for Asignaciones tab
    async function loadEmployeeAssignments(employeeId) {
        const loadingEl = document.getElementById('employee-assignments-loading');
        const emptyEl = document.getElementById('employee-assignments-empty');
        const containerEl = document.getElementById('employee-assignments-container');
        const listEl = document.getElementById('employee-assignments-list');
        
        if (!employeeId) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'block';
            if (containerEl) containerEl.style.display = 'none';
            return;
        }

        try {
            // Show loading
            if (loadingEl) loadingEl.style.display = 'block';
            if (emptyEl) emptyEl.style.display = 'none';
            if (containerEl) containerEl.style.display = 'none';
            
            const url = window.getApiUrl ? window.getApiUrl(`/api/employees/${employeeId}/assignments`) : `/api/employees/${employeeId}/assignments`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Error al cargar asignaciones');
            
            const data = await response.json();
            
            // Hide loading
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (!data.assignments || data.assignments.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
                if (containerEl) containerEl.style.display = 'none';
                return;
            }
            
            // Show container
            if (containerEl) containerEl.style.display = 'block';
            if (emptyEl) emptyEl.style.display = 'none';
            
            // Update summary
            document.getElementById('emp-total-projects').textContent = data.total || 0;
            document.getElementById('emp-active-projects').textContent = data.active || 0;
            document.getElementById('emp-completed-projects').textContent = data.completed || 0;
            
            // Render assignments as cards
            if (listEl) {
                listEl.innerHTML = data.assignments.map(assignment => {
                    const isActive = assignment.status === 'Activo';
                    const statusColor = isActive ? '#28a745' : '#6c757d';
                    const statusIcon = isActive ? '✅' : '🏁';
                    const startDate = assignment.start_date ? new Date(assignment.start_date).toLocaleDateString('es-MX') : 'N/A';
                    const endDate = assignment.end_date ? new Date(assignment.end_date).toLocaleDateString('es-MX') : 'Sin definir';
                    
                    return `
                        <div style="background:white;border:1px solid ${isActive ? '#28a745' : '#e5e7eb'};border-left:4px solid ${statusColor};border-radius:8px;padding:16px;transition:all 0.2s" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='none';this.style.transform='translateY(0)'">
                            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
                                <div style="flex:1">
                                    <div style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:6px">
                                        📊 ${assignment.project_name || 'Proyecto sin nombre'}
                                    </div>
                                    ${assignment.celula_name ? `<div style="display:inline-block;background:#3b82f6;color:white;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-bottom:4px">🔷 ${assignment.celula_name}</div>` : ''}
                                    ${assignment.ot_code ? `<div style="font-size:13px;color:#6b7280;margin-top:4px">📦 OT: ${assignment.ot_code}</div>` : ''}
                                </div>
                                <div style="display:flex;align-items:center;gap:6px;background:${statusColor};color:white;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
                                    ${statusIcon} ${assignment.status}
                                </div>
                            </div>
                            
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:14px;background:#f9fafb;border-radius:6px;margin-top:8px">
                                ${assignment.role_in_project ? `
                                <div>
                                    <div style="font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">🎯 Rol</div>
                                    <div style="font-size:14px;color:#374151;font-weight:600">${assignment.role_in_project}</div>
                                </div>
                                ` : ''}
                                
                                <div>
                                    <div style="font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">📅 Inicio</div>
                                    <div style="font-size:14px;color:#374151;font-weight:600">${startDate}</div>
                                </div>
                                
                                <div>
                                    <div style="font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${isActive ? '⏳ Fin Proyectado' : '🏁 Fin'}</div>
                                    <div style="font-size:14px;color:#374151;font-weight:600">${endDate}</div>
                                </div>
                                
                                ${assignment.rate ? `
                                <div>
                                    <div style="font-size:11px;color:#6b7280;margin-bottom:2px">💵 Tarifa</div>
                                    <div style="font-size:14px;color:#374151;font-weight:500">$${parseFloat(assignment.rate).toLocaleString()}</div>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
        } catch (error) {
            console.error('Error loading assignments:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.style.display = 'block';
                emptyEl.innerHTML = '<div style="font-size:32px;margin-bottom:10px;color:#ef4444">⚠️</div><div>Error al cargar el historial de asignaciones</div>';
            }
            if (containerEl) containerEl.style.display = 'none';
        }
    }

    function openCandidateModal(isEdit = false, candidate = null){
        document.getElementById('candidate-modal-title').textContent = isEdit ? 'Actualizar Candidato' : 'Agregar Candidato';
        candidateModal.style.display = 'flex';
        if (!isEdit) {
            window.clearCandidateForm();
        }
        // Cargar opciones de posiciones del catálogo
        const positionToPreload = isEdit && candidate ? candidate.position_applied : null;
        loadCandidatePositions(positionToPreload);
    }

    async function loadCandidatePositions(preloadPosition = null) {
        try {
            // Cargar vacantes activas
            const vacantesUrl = window.getApiUrl ? window.getApiUrl('/api/job-openings') : '/api/job-openings';
            const vacantesResponse = await fetch(vacantesUrl);
            
            if (!vacantesResponse.ok) {
                console.error('Error al cargar vacantes:', vacantesResponse.status);
                return;
            }
            
            const vacantes = await vacantesResponse.json();
            
            // Verificar que la respuesta sea un array
            if (!Array.isArray(vacantes)) {
                console.error('La respuesta no es un array de vacantes:', vacantes);
                return;
            }
            
            const positionSelect = document.getElementById('candidate-position');
            if (positionSelect) {
                positionSelect.innerHTML = '<option value="">Seleccionar posición solicitada...</option>';
                
                // Solo mostrar las posiciones de las vacantes activas
                vacantes.forEach(v => {
                    // Filtrar solo vacantes activas
                    if (v.status === 'Activa') {
                        const opt = document.createElement('option');
                        opt.value = v.position_name;
                        opt.textContent = v.position_name;
                        positionSelect.appendChild(opt);
                    }
                });
                
                // Pre-cargar la posición si está disponible
                if (preloadPosition) {
                    positionSelect.value = preloadPosition;
                }
            }
        } catch (error) {
            console.error('Error al cargar posiciones:', error);
        }
    }

    function closeCandidateModal(){
        candidateModal.style.display = 'none';
        window.clearCandidateForm();
    }

    // Real-time validation for candidate form inputs
    const candidateFirstInput = document.getElementById('candidate-first');
    const candidateLastInput = document.getElementById('candidate-last');
    const candidatePhoneInput = document.getElementById('candidate-phone');

    if (candidateFirstInput) {
        candidateFirstInput.addEventListener('input', (e) => {
            // Replace invalid characters in real-time
            e.target.value = e.target.value.replace(/[^A-Za-zñÑáéíóúÁÉÍÓÚ\s]/g, '');
        });
    }

    if (candidateLastInput) {
        candidateLastInput.addEventListener('input', (e) => {
            // Replace invalid characters in real-time
            e.target.value = e.target.value.replace(/[^A-Za-zñÑáéíóúÁÉÍÓÚ\s]/g, '');
        });
    }

    if (candidatePhoneInput) {
        candidatePhoneInput.addEventListener('input', (e) => {
            // Only allow numbers and limit to 10 digits
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
    }

    // Real-time validation for employee form inputs
    const employeeFirstInput = document.getElementById('employee-first');
    const employeeLastInput = document.getElementById('employee-last');
    const employeePhoneInput = document.getElementById('employee-phone');
    const employeePersonalPhoneInput = document.getElementById('employee-personal-phone');

    if (employeeFirstInput) {
        employeeFirstInput.addEventListener('input', (e) => {
            // Replace invalid characters in real-time
            e.target.value = e.target.value.replace(/[^A-Za-zñÑáéíóúÁÉÍÓÚ\s]/g, '');
        });
    }

    if (employeeLastInput) {
        employeeLastInput.addEventListener('input', (e) => {
            // Replace invalid characters in real-time
            e.target.value = e.target.value.replace(/[^A-Za-zñÑáéíóúÁÉÍÓÚ\s]/g, '');
        });
    }

    if (employeePhoneInput) {
        employeePhoneInput.addEventListener('input', (e) => {
            // Only allow numbers and limit to 10 digits
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
    }

    if (employeePersonalPhoneInput) {
        employeePersonalPhoneInput.addEventListener('input', (e) => {
            // Only allow numbers and limit to 10 digits
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
    }

    // navigation - Combinado en un solo listener para evitar duplicación
    navLinks.forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const view = a.dataset.view;
            showView(view);
            
            // Cargar datos específicos según la vista
            if (view === 'vacaciones') {
                loadVacationEmployeeDropdown();
                fetchVacations();
            } else if (view === 'reclutamiento') {
                loadCandidatePositions();
            } else if (view === 'proyectos') {
                fetchProjects();
            } else if (view === 'celulas') {
                if (typeof window.loadCelulas === 'function') {
                    window.loadCelulas();
                }
            } else if (view === 'licitaciones') {
                if (typeof window.loadLicitaciones === 'function') {
                    window.loadLicitaciones();
                }
            } else if (view === 'asignaciones') {
                if (typeof window.loadAssignments === 'function') {
                    window.loadAssignments();
                }
                if (typeof window.loadAssignmentFilters === 'function') {
                    window.loadAssignmentFilters();
                }
            } else if (view === 'reportes') {
                if (typeof window.loadAllReports === 'function') {
                    window.loadAllReports();
                }
            }
        });
    });

    // modal controls
    addBtn.addEventListener('click', async () => await openModal(false));
    modalClose.addEventListener('click', async () => await closeModal());
    cancelBtn.addEventListener('click', async () => await closeModal());

    modal.addEventListener('click', async (e) => {
        if (e.target === modal) await closeModal();
    });
    
    // Prevent modal from closing when clicking inside modal content
    // BUT allow buttons to work normally
    document.querySelector('#employee-modal .modal-content').addEventListener('click', (e) => {
        // No bloquear clicks en botones de control
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return; // Permitir que el evento se propague
        }
        e.stopPropagation();
    });

    // Tab controls - now using inline onclick handlers (working solution)
    // Tabs functionality is embedded directly in HTML onclick attributes

    // candidate modal controls
    addCandidateBtn.addEventListener('click', () => openCandidateModal(false));
    candidateModalClose.addEventListener('click', () => {
        closeCandidateModal();
    });
    
    // Add event listener for candidate cancel button
    candidateCancelBtn?.addEventListener('click', () => {
        closeCandidateModal();
    });
    
    candidateModal.addEventListener('click', (e) => {
        if (e.target === candidateModal) closeCandidateModal();
    });

    // CV Viewer Modal controls
    const cvViewerModal = document.getElementById('cv-viewer-modal');
    const cvViewerClose = document.getElementById('cv-viewer-close');
    
    cvViewerClose?.addEventListener('click', () => {
        cvViewerModal.style.display = 'none';
        document.getElementById('cv-iframe').src = '';
        document.getElementById('cv-loader').style.display = 'flex'; // Mostrar loader nuevamente
    });
    
    cvViewerModal?.addEventListener('click', (e) => {
        if (e.target === cvViewerModal) {
            cvViewerModal.style.display = 'none';
            document.getElementById('cv-iframe').src = '';
            document.getElementById('cv-loader').style.display = 'flex'; // Mostrar loader nuevamente
        }
    });

    async function loadAndRender() {
        try {
            if (typeof window.showGridLoading === 'function') {
                window.showGridLoading();
            }
            
            const employees = await window.fetchEmployees();
            
            if (employees && employees.length > 0) {
                window.renderEmployees(employees);
            } else {
                window.renderEmployees([]);
            }
        } catch (error) {
            console.error('Error cargando empleados:', error);
            if (typeof window.showGridError === 'function') {
                window.showGridError('Error de conexión con la API');
            } else {
                window.renderEmployees([]);
            }
        }
    }

    async function loadAndRenderCandidates() {
        const candidates = await window.fetchCandidates();
        window.renderCandidates(candidates);
    }

    // Inicialización simple
    await loadAndRender();
    await loadAndRenderCandidates();
    await loadCatalogDropdowns();
    // show default view
    showView('alta');

    // handle submit for create/update employees
    employeeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Eliminar todas las validaciones y alertas, solo tomar los valores y guardar
        const id = document.getElementById('employee-id').value;
        const first = document.getElementById('employee-first').value;
        const last = document.getElementById('employee-last').value;
        const email = document.getElementById('employee-email').value;
        const birth = document.getElementById('employee-birth').value;
        const code = document.getElementById('employee-code').value;
        const phone = document.getElementById('employee-phone').value;
        const personalPhone = document.getElementById('employee-personal-phone').value;
        const positionId = document.getElementById('employee-position').value || null;
        const entityId = document.getElementById('employee-entity').value || null;
        const areaId = document.getElementById('employee-area').value || null;
        const projectId = document.getElementById('employee-project').value || null;
        const cellId = document.getElementById('employee-cell').value || null;
        const status = document.getElementById('employee-status').value;
        const addressStreet = document.getElementById('employee-address-street').value;
        const addressExterior = document.getElementById('employee-address-exterior').value;
        const addressInterior = document.getElementById('employee-address-interior').value;
        const addressColonia = document.getElementById('employee-address-colonia').value;
        const addressCity = document.getElementById('employee-address-city').value;
        const addressState = document.getElementById('employee-address-state').value;
        const addressPostal = document.getElementById('employee-address-postal-code').value;
        const addressCountry = document.getElementById('employee-address-country').value;
        const curp = document.getElementById('employee-curp').value;
        const rfc = document.getElementById('employee-rfc').value;
        const nss = document.getElementById('employee-nss').value;
        const passport = document.getElementById('employee-passport').value;
        const gender = document.getElementById('employee-gender').value;
        const maritalStatus = document.getElementById('employee-marital-status').value;
        const nationality = document.getElementById('employee-nationality').value;
        const bloodType = document.getElementById('employee-blood-type').value;
        const bankName = document.getElementById('employee-bank-name').value;
        const accountHolder = document.getElementById('employee-account-holder').value;
        const accountNumber = document.getElementById('employee-account-number').value;
        const clabe = document.getElementById('employee-clabe').value;
        const contractTypeId = document.getElementById('employee-contract-type').value || null;
        const obra = document.getElementById('employee-obra').value;
        const contractSchemeId = document.getElementById('employee-contract-scheme').value || null;
        const initialRate = document.getElementById('employee-initial-rate').value;
        const grossSalary = document.getElementById('employee-gross-salary').value;
        const netSalary = document.getElementById('employee-net-salary').value;
        const companyCost = document.getElementById('employee-company-cost').value;
        const hireDate = document.getElementById('employee-hire-date').value;
        const endDate = document.getElementById('employee-end-date').value;
        const terminationReason = document.getElementById('employee-termination-reason').value;
        const rehireable = document.getElementById('employee-rehireable').checked;

        // Validar que nombre y apellido solo contengan letras
        const nameRegex = /^[A-Za-zñÑáéíóúÁÉÍÓÚ\s]+$/;
        if (!nameRegex.test(first)) {
            Swal.fire({
                icon: 'warning',
                title: 'Nombre inválido',
                text: 'El nombre solo puede contener letras'
            });
            return;
        }
        if (!nameRegex.test(last)) {
            Swal.fire({
                icon: 'warning',
                title: 'Apellido inválido',
                text: 'El apellido solo puede contener letras'
            });
            return;
        }
        
        // Validar código de empleado duplicado (solo al crear, no al editar)
        if (!id && code) {
            try {
                const existingEmployees = await window.fetchEmployees();
                const codeExists = existingEmployees.some(emp => emp.employee_code === code);
                if (codeExists) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Código duplicado',
                        html: `El código <strong>${code}</strong> ya está en uso.<br>Usa un código diferente o déjalo vacío para generar uno automático.`
                    });
                    return;
                }
            } catch (err) {
                console.error('Error verificando código:', err);
                // Continuar de todos modos, el backend también validará
            }
        }

        // Validar teléfono corporativo: exactamente 10 dígitos (si se proporciona)
        if (phone && !/^[0-9]{10}$/.test(phone)) {
            Swal.fire({
                icon: 'warning',
                title: 'Teléfono corporativo inválido',
                text: 'El teléfono debe contener exactamente 10 dígitos'
            });
            return;
        }

        // Validar teléfono personal: exactamente 10 dígitos (si se proporciona)
        if (personalPhone && !/^[0-9]{10}$/.test(personalPhone)) {
            Swal.fire({
                icon: 'warning',
                title: 'Teléfono personal inválido',
                text: 'El teléfono debe contener exactamente 10 dígitos'
            });
            return;
        }

        const payload = {
            first_name: first,
            last_name: last,
            email: email || null,
            birth_date: birth || null,
            employee_code: code || null,
            phone: phone || null,
            personal_phone: personalPhone || null,
            position_id: positionId ? parseInt(positionId) : null,
            entity_id: entityId ? parseInt(entityId) : null,
            area_id: areaId ? parseInt(areaId) : null,
            project_id: projectId ? parseInt(projectId) : null,
            cell_id: cellId ? parseInt(cellId) : null,
            status: status || null,
            address: addressStreet || null,
            exterior_number: addressExterior || null,
            interior_number: addressInterior || null,
            colonia: addressColonia || null,
            city: addressCity || null,
            state: addressState || null,
            postal_code: addressPostal || null,
            country: addressCountry || 'México',
            curp: curp || null,
            rfc: rfc || null,
            nss: nss || null,
            passport: passport || null,
            gender: gender || null,
            marital_status: maritalStatus || null,
            nationality: nationality || null,
            blood_type: bloodType || null,
            created_by: 'web'
        };

        console.log('📤 Payload a enviar:', payload);

        try {
            let employeeId;
            let result;
            if (id) {
                result = await window.updateEmployee(id, payload);
                employeeId = id;
                Swal.fire({
                    icon: 'success',
                    title: 'Empleado actualizado',
                    text: 'Los datos del empleado se actualizaron correctamente',
                    timer: 2000,
                    showConfirmButton: false
                });
                console.log('✅ Empleado actualizado:', result);
            } else {
                result = await window.createEmployee(payload);
                employeeId = result.id;
                Swal.fire({
                    icon: 'success',
                    title: 'Empleado creado',
                    text: 'El empleado se creó correctamente',
                    timer: 2000,
                    showConfirmButton: false
                });
                console.log('✅ Empleado creado:', result);
            }

            // Save banking info if provided
            if (bankName || accountHolder || accountNumber || clabe) {
                const bankingData = {
                    bank_name: bankName,
                    account_holder_name: accountHolder,
                    account_number: accountNumber,
                    clabe_interbancaria: clabe
                };
                try {
                    const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${employeeId}/banking`) : `/api/employees-v2/${employeeId}/banking`;
                    const bankingRes = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(bankingData)
                    });
                    if (!bankingRes.ok) throw new Error('Error guardando datos bancarios');
                    Swal.fire({
                        icon: 'success',
                        title: 'Datos bancarios guardados',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } catch (bankingError) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error guardando datos bancarios',
                        text: bankingError.message || bankingError
                    });
                    console.error('Error saving banking info:', bankingError);
                }
            }

            // Save contract info if provided
            if (contractTypeId || grossSalary || hireDate) {
                const contractData = {
                    contract_type_id: contractTypeId || null,
                    obra: obra || null,
                    contract_scheme_id: contractSchemeId || null,
                    initial_rate: initialRate ? parseFloat(initialRate) : null,
                    gross_monthly_salary: grossSalary ? parseFloat(grossSalary) : null,
                    net_monthly_salary: netSalary ? parseFloat(netSalary) : null,
                    company_cost: companyCost ? parseFloat(companyCost) : null,
                    start_date: hireDate || null,
                    end_date: endDate || null,
                    termination_reason: terminationReason || null,
                    is_rehireable: rehireable,
                    is_active: true // New contracts are active by default
                };
                try {
                    const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${employeeId}/contracts`) : `/api/employees-v2/${employeeId}/contracts`;
                    const contractRes = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(contractData)
                    });
                    if (!contractRes.ok) throw new Error('Error guardando contrato');
                    Swal.fire({
                        icon: 'success',
                        title: 'Contrato guardado',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } catch (contractError) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error guardando contrato',
                        text: contractError.message || contractError
                    });
                    console.error('Error saving contract info:', contractError);
                }
            }

        } catch (err) {
            // No mostrar alerta de error aquí porque employees.js ya lo maneja
            console.error('❌ Error guardando empleado:', err);
            return;
        }

        closeModal(true); // true = skip confirmation
        await loadAndRender();
    });

    // handle submit for create/update candidates
    candidateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('candidate-id').value;
        const first = document.getElementById('candidate-first').value.trim();
        const last = document.getElementById('candidate-last').value.trim();
        const email = document.getElementById('candidate-email').value.trim();
        const phone = document.getElementById('candidate-phone').value.trim();
        const salaryExpectation = parseFloat(document.getElementById('candidate-salary-expectation').value) || null;
        const position = document.getElementById('candidate-position').value.trim();
        const status = document.getElementById('candidate-status').value.trim();
        const notes = document.getElementById('candidate-notes').value.trim();
        const cvFile = document.getElementById('candidate-cv').files[0];
        let cvUrl = document.getElementById('candidate-cv-url').value;
        
        // Subir CV si hay un nuevo archivo seleccionado
        if (cvFile) {
            try {
                const formData = new FormData();
                formData.append('file', cvFile);
                formData.append('candidateId', id || 'new');
                
                const uploadUrl = window.getApiUrl ? window.getApiUrl('/api/candidates/upload-cv') : '/api/candidates/upload-cv';
                const uploadRes = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData
                });
                
                if (!uploadRes.ok) throw new Error('Error al subir CV');
                
                const uploadResult = await uploadRes.json();
                cvUrl = uploadResult.cv_url;
                console.log('✅ CV subido:', cvUrl);
            } catch (err) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Advertencia',
                    text: 'No se pudo subir el CV, pero se guardará el candidato sin el archivo',
                    timer: 3000,
                    showConfirmButton: false
                });
                console.error('Error subiendo CV:', err);
            }
        }
        
        // Si el status es "Contratado", asignar automáticamente el usuario logueado y la fecha
        let recruitedBy = null;
        let hiredDate = null;
        if (status === 'Contratado') {
            const currentUser = getCurrentUser();
            if (currentUser && currentUser.first_name && currentUser.last_name) {
                recruitedBy = currentUser.first_name + ' ' + currentUser.last_name;
                console.log('✅ Reclutador asignado:', recruitedBy);
            } else {
                console.log('⚠️ No se encontró usuario logueado');
            }
            
            // Capturar la fecha de contratación (hoy)
            const today = new Date();
            hiredDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
            console.log('📅 Fecha de contratación asignada:', hiredDate);
        }
        
        if (!first || !last || !position) return;

        // Validar que nombre y apellido solo contengan letras
        const nameRegex = /^[A-Za-zñÑáéíóúÁÉÍÓÚ\s]+$/;
        if (!nameRegex.test(first)) {
            Swal.fire({
                icon: 'warning',
                title: 'Nombre inválido',
                text: 'El nombre solo puede contener letras'
            });
            return;
        }
        if (!nameRegex.test(last)) {
            Swal.fire({
                icon: 'warning',
                title: 'Apellido inválido',
                text: 'El apellido solo puede contener letras'
            });
            return;
        }

        // Validar teléfono: exactamente 10 dígitos
        if (phone && !/^[0-9]{10}$/.test(phone)) {
            Swal.fire({
                icon: 'warning',
                title: 'Teléfono inválido',
                text: 'El teléfono debe contener exactamente 10 dígitos'
            });
            return;
        }

        // client-side email validation (if provided)
        if (email) {
            const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRe.test(String(email))) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Email inválido',
                    text: 'Por favor ingresa un formato de email válido'
                });
                return;
            }
        }

        const payload = { 
            first_name: first, 
            last_name: last, 
            email: email || null, 
            phone: phone || null, 
            salary_expectation: salaryExpectation,
            position_applied: position, 
            status, 
            notes: notes || null, 
            recruited_by: recruitedBy, 
            hired_date: hiredDate, 
            cv_url: cvUrl || null 
        };
        
        console.log('📤 Payload siendo enviado:', payload);
        
        try {
            if (id) {
                console.log('🔄 Actualizando candidato ID:', id);
                await window.updateCandidate(id, payload);
                
                // Mensaje especial si fue contratado
                if (status === 'Contratado') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Candidato Contratado!',
                        html: `
                            <div style="text-align:left;margin:15px 0">
                                <p><strong>${first} ${last}</strong> ha sido contratado</p>
                                <p style="font-size:14px;color:#666;margin:10px 0">
                                    ✅ Candidato actualizado<br>
                                    👤 Reclutador: ${recruitedBy || 'N/A'}<br>
                                    📅 Fecha: ${hiredDate || 'Hoy'}<br>
                                    <strong style="color:#10b981">👨‍💼 Se agregó como empleado</strong>
                                </p>
                            </div>
                        `,
                        timer: 3000,
                        showConfirmButton: false
                    });
                } else {
                    Swal.fire({
                        icon: 'success',
                        title: 'Candidato actualizado',
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
            } else {
                console.log('➕ Creando nuevo candidato');
                await window.createCandidate(payload);
                Swal.fire({
                    icon: 'success',
                    title: 'Candidato creado',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        } catch (err) {
            // Error ya manejado en las funciones
            console.error('❌ Error al guardar candidato:', err);
            return;
        }
        closeCandidateModal();
        await loadAndRenderCandidates();
    });

    // ========== TAB SWITCHING FUNCTION ==========
    function switchTab(tabName) {
        console.log('🔄 switchTab llamada con:', tabName);
        
        // Get the currently open modal to work within its context
        const openModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display: block"]');
        if (!openModal) {
            console.warn('⚠️ No hay modal abierto');
            return;
        }
        
        console.log('📋 Modal encontrado:', openModal.id);
        
        // Remove active class from all tab buttons in this modal
        const tabButtons = openModal.querySelectorAll('.tab-button');
        console.log('🔘 Botones encontrados:', tabButtons.length);
        tabButtons.forEach((button, index) => {
            button.classList.remove('active');
            console.log(`  Botón ${index + 1}: ${button.textContent.trim()} - data-tab: ${button.dataset.tab}`);
        });
        
        // Hide all tab content in this modal
        const tabContents = openModal.querySelectorAll('.tab-content');
        console.log('📄 Contenidos encontrados:', tabContents.length);
        tabContents.forEach((content, index) => {
            content.classList.remove('active');
            content.style.display = 'none';
            console.log(`  Contenido ${index + 1}: ${content.id}`);
        });
        
        // Activate selected tab button
        const activeButton = openModal.querySelector(`[data-tab="${tabName}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
            console.log('✅ Botón activado:', activeButton.textContent.trim());
        } else {
            console.error('❌ No se encontró botón para pestaña:', tabName);
        }
        
        // Show selected tab content
        const activeContent = openModal.querySelector(`#tab-${tabName}`);
        if (activeContent) {
            activeContent.classList.add('active');
            activeContent.style.display = 'block';
            console.log('✅ Contenido mostrado:', activeContent.id);
            console.log('📋 Display después del cambio:', getComputedStyle(activeContent).display);
        } else {
            console.error('❌ No se encontró contenido para pestaña:', `#tab-${tabName}`);
        }
        
        // Cargar datos específicos según el tab
        if (tabName === 'asignaciones') {
            const employeeId = document.getElementById('employee-id')?.value;
            if (employeeId && window.loadEmployeeAssignments) {
                console.log('📊 Cargando asignaciones del empleado:', employeeId);
                window.loadEmployeeAssignments(employeeId);
            }
        } else if (tabName === 'project-assignments') {
            const projectId = document.getElementById('project-id')?.value;
            if (projectId && window.loadProjectAssignments) {
                console.log('📊 Cargando asignaciones del proyecto:', projectId);
                window.loadProjectAssignments(projectId);
                
                // Si está en modo viewOnly, ocultar botones de acción después de cargar
                const projectModal = document.getElementById('project-modal');
                const isViewOnly = projectModal?.dataset.viewOnly === 'true';
                if (isViewOnly) {
                    setTimeout(() => {
                        const finishButtons = document.querySelectorAll('#project-assignments-tbody button[onclick^="finishAssignmentFromProject"]');
                        finishButtons.forEach(btn => btn.style.display = 'none');
                    }, 200);
                }
            }
        }
        
        console.log('✅ switchTab completado para:', tabName);
    }
    
    // ========== EMPLOYEE DATA LOADING FUNCTIONS ==========
    async function loadEmployeeContracts(employeeId) {
        console.log('💼 Cargando contratos para empleado:', employeeId);
        try {
            const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${employeeId}/contracts`) : `/api/employees-v2/${employeeId}/contracts`;
            const response = await fetch(url);
            if (!response.ok) {
                console.warn('⚠️ No se pudieron cargar los contratos');
                return;
            }
            const contracts = await response.json();
            
            // Update contracts list in the UI
            const contractsList = document.getElementById('contracts-list');
            if (contractsList && contracts.length > 0) {
                contractsList.innerHTML = contracts.map(contract => `
                    <div class="contract-item ${contract.is_current ? 'contract-active' : ''}">
                        <h5>${contract.position_name || 'Sin posición'}</h5>
                        <p><strong>Periodo:</strong> ${contract.start_date} - ${contract.end_date || 'Actual'}</p>
                        <p><strong>Salario:</strong> $${contract.gross_salary || 'No especificado'}</p>
                        <p><strong>Estado:</strong> ${contract.is_current ? 'Activo' : 'Inactivo'}</p>
                    </div>
                `).join('');
            } else if (contractsList) {
                contractsList.innerHTML = '<p><em>No hay contratos registrados</em></p>';
            }
        } catch (error) {
            console.error('❌ Error cargando contratos:', error);
        }
    }
    
    async function loadEmployeeBanking(employeeId) {
        console.log('🏦 Cargando información bancaria para empleado:', employeeId);
        try {
            const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${employeeId}/banking`) : `/api/employees-v2/${employeeId}/banking`;
            const response = await fetch(url);
            if (!response.ok) {
                console.warn('⚠️ No se pudo cargar la información bancaria');
                return;
            }
            const banking = await response.json();
            
            // Update banking fields if they exist
            if (banking) {
                const bankNameField = document.getElementById('employee-bank-name');
                const accountHolderField = document.getElementById('employee-account-holder');
                const accountNumberField = document.getElementById('employee-account-number');
                const clabeField = document.getElementById('employee-clabe');
                
                if (bankNameField) bankNameField.value = banking.bank_name || '';
                if (accountHolderField) accountHolderField.value = banking.account_holder || '';
                if (accountNumberField) accountNumberField.value = banking.account_number || '';
                if (clabeField) clabeField.value = banking.clabe || '';
            }
        } catch (error) {
            console.error('❌ Error cargando información bancaria:', error);
        }
    }

    // delegate edit/delete/view clicks for employees (supports table or legacy list)
    const employeeClicksHost = document.getElementById('employee-table-body') || document.getElementById('employee-list');
    if (employeeClicksHost) {
        employeeClicksHost.addEventListener('click', async (e)=>{
            const view = e.target.closest('.view-employee');
            const edit = e.target.closest('.edit-employee');
            const del = e.target.closest('.delete-employee');
            
            if (view) {
                const id = view.dataset.id;
                const employees = await window.fetchEmployees();
                const emp = employees.find(x=> String(x.id) === String(id));
                if (emp) {
                    await openModal(true, true); // Abre modal en modo solo lectura
                    setTimeout(() => {
                        window.populateForm(emp);
                        // Aplicar modo solo lectura DESPUÉS de poblar el formulario
                        setTimeout(() => {
                            window.applyReadOnlyMode();
                        }, 100);
                        // Cambiar a tab de asignaciones si existe historial
                        const assignmentsTab = document.querySelector('.tab-button[data-tab="asignaciones"]');
                        if (assignmentsTab) assignmentsTab.click();
                    }, 200);
                }
                return;
            }
            
            if (edit) {
                const id = edit.dataset.id;
                const employees = await window.fetchEmployees();
                const emp = employees.find(x=> String(x.id) === String(id));
                if (emp) {
                    await openModal(true); // Abre el modal y espera catálogos
                    // Espera a que los catálogos estén listos antes de poblar el formulario
                    setTimeout(() => {
                        window.populateForm(emp);
                        // Re-verificar que los event listeners funcionen después de populate
                        const modal = document.getElementById('employee-modal');
                        const buttons = modal.querySelectorAll('.tab-button');
                        buttons.forEach((btn, index) => {
                            console.log(`  Botón ${index + 1}: ${btn.textContent.trim()} - data-tab: ${btn.getAttribute('data-tab')}`);
                        });
                    }, 200);
                }
                return;
            }
            if (del) {
                const id = del.dataset.id;
                const result = await Swal.fire({
                    title: '¿Eliminar empleado?',
                    text: 'Esta acción no se puede deshacer',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#6b7280'
                });
                if (!result.isConfirmed) return;
                await window.deleteEmployee(id);
                await loadAndRender();
            }
        });
    }

    // delegate edit/delete clicks for candidates
    document.getElementById('candidate-list').addEventListener('click', async (e)=>{
        const viewCv = e.target.closest('.view-candidate-cv');
        const edit = e.target.closest('.edit-candidate');
        const del = e.target.closest('.delete-candidate');
        if (viewCv) {
            const id = viewCv.dataset.id;
            const candidates = await window.fetchCandidates();
            const cand = candidates.find(x=> String(x.id) === String(id));
            if (cand && cand.cv_url) {
                // Mostrar CV en modal con iframe
                const modal = document.getElementById('cv-viewer-modal');
                const iframe = document.getElementById('cv-iframe');
                const loader = document.getElementById('cv-loader');
                const downloadLink = document.getElementById('cv-download-link');
                const titleEl = document.getElementById('cv-viewer-title');
                const nameEl = document.getElementById('cv-viewer-candidate-name');
                
                // Mostrar loader mientras carga
                loader.style.display = 'flex';
                iframe.style.display = 'none';
                
                // Construir URL desde el API (puerto 3000) para asegurar que los archivos se sirvan correctamente
                let cvUrl = cand.cv_url;
                if (cvUrl.startsWith('/')) {
                    // Si es una URL relativa, usar el API como base
                    const apiBase = window.getApiUrl ? window.getApiUrl('') : 'http://localhost:3000';
                    cvUrl = apiBase + cvUrl;
                }
                
                console.log('📄 CV PDF URL:', cvUrl);
                
                // Cargar PDF directamente en el iframe
                iframe.src = cvUrl;
                downloadLink.href = cvUrl;
                titleEl.textContent = '📄 Ver Curriculum Vitae';
                nameEl.textContent = `${cand.first_name || ''} ${cand.last_name || ''}`.trim();
                
                modal.style.display = 'flex';
                console.log('✅ CV viewer modal abierto');
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'CV no disponible',
                    text: 'Este candidato no tiene un CV cargado',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
            return;
        }
        if (edit) {
            const id = edit.dataset.id;
            const candidates = await window.fetchCandidates();
            const cand = candidates.find(x=> String(x.id) === String(id));
            if (cand) {
                window.populateCandidateForm(cand);
                openCandidateModal(true, cand);
            }
            return;
        }
        if (del) {
            const id = del.dataset.id;
            const result = await Swal.fire({
                title: '¿Eliminar candidato?',
                text: 'Esta acción no se puede deshacer',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            });
            if (!result.isConfirmed) return;
            await window.deleteCandidate(id,'Deleted');
            await loadAndRenderCandidates();
        }
    });

    // ========== TAB EVENT LISTENERS ==========
    // Add event listeners to tab buttons with event delegation
    document.addEventListener('click', (e) => {
        // Only handle clicks on tab buttons
        if (e.target.matches('.tab-button[data-tab]')) {
            e.preventDefault();
            e.stopPropagation();
            
            const tabName = e.target.getAttribute('data-tab');
            const modal = e.target.closest('.modal');
            
            console.log('🎯 Click en tab-button detectado:', tabName);
            
            // Only proceed if we're inside a modal
            if (tabName && modal && modal.style.display !== 'none') {
                console.log('🖱️ Procesando click en pestaña:', tabName);
                switchTab(tabName);
            } else {
                console.warn('⚠️ Click ignorado - modal no visible o sin tabName');
            }
        } else {
            // Debug para otros clics solo dentro de modales (ignorar tabs de reportes)
            if (e.target.classList.contains('tab-button') && e.target.closest('.modal')) {
                console.log('🔍 Click en tab-button pero sin data-tab:', e.target);
            }
        }
    }, true); // Usar capture phase para interceptar antes que otros handlers

    // Expose functions for global access
    window.switchTab = switchTab;
    window.loadEmployeeContracts = loadEmployeeContracts;
    window.loadEmployeeBanking = loadEmployeeBanking;
    window.openModal = openModal;
    window.closeCandidateModal = closeCandidateModal;
    
    // --- PROYECTOS ---
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectTableBody = document.getElementById('project-table-body');
    const projectGridLoading = document.getElementById('project-grid-loading');
    const projectGridEmpty = document.getElementById('project-grid-empty');
    const projectTable = document.getElementById('project-table');
    let allProjects = [];

    async function fetchProjects() {
        try {
            projectGridLoading.style.display = 'block';
            projectTable.style.display = 'none';
            projectGridEmpty.style.display = 'none';
            const url = window.getApiUrl ? window.getApiUrl('/api/projects') : '/api/projects';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error al cargar proyectos');
            const data = await res.json();
            allProjects = data;
            renderProjects(data);
        } catch (e) {
            projectGridLoading.style.display = 'none';
            projectTable.style.display = 'none';
            projectGridEmpty.style.display = 'block';
            projectGridEmpty.innerHTML = '<div style="color:#e53e3e">Error al cargar proyectos</div>';
        }
    }

    function renderProjects(projects) {
        projectTableBody.innerHTML = '';
        if (!projects || projects.length === 0) {
            projectGridLoading.style.display = 'none';
            projectTable.style.display = 'none';
            projectGridEmpty.style.display = 'block';
            return;
        }
        projectGridLoading.style.display = 'none';
        projectGridEmpty.style.display = 'none';
        projectTable.style.display = 'table';
        projects.forEach(proj => {
            const tr = document.createElement('tr');
            const montoTotal = proj.monto_total_ots ? `$${parseFloat(proj.monto_total_ots).toFixed(2)}` : '$0.00';
            tr.innerHTML = `
                <td>${proj.id}</td>
                <td>${proj.nombre_proyecto || proj.name || ''}</td>
                <td>${proj.responsable_proyecto || proj.project_manager || ''}</td>
                <td>${proj.celula_nombre || proj.celula_name || ''}</td>
                <td style="font-weight:600;color:#059669;">${montoTotal}</td>
                <td>${proj.fecha_inicio || proj.start_date ? (proj.fecha_inicio || proj.start_date).split('T')[0] : ''}</td>
                <td>${proj.fecha_fin || proj.end_date ? (proj.fecha_fin || proj.end_date).split('T')[0] : ''}</td>
                <td><span style="background:${proj.estado_proyecto === 'Completado' || proj.status === 'Completado' ? '#10b981' : proj.estado_proyecto === 'En Progreso' || proj.status === 'En Progreso' ? '#3b82f6' : proj.estado_proyecto === 'Planificación' || proj.status === 'Planificación' ? '#f59e0b' : '#6b7280'};color:white;padding:4px 8px;border-radius:4px;font-size:12px">${proj.estado_proyecto || proj.status || ''}</span></td>
                <td>
                    <button class="btn-action-view" data-id="${proj.id}" title="Ver detalles">👁️</button>
                    <button class="btn-action-edit" data-id="${proj.id}" style="margin-left:4px" title="Editar">✏️</button>
                    <button class="btn-action-delete" data-id="${proj.id}" style="margin-left:4px" title="Eliminar">🗑️</button>
                </td>
            `;
            projectTableBody.appendChild(tr);
        });
    }

    projectTableBody?.addEventListener('click', async (e) => {
        const viewBtn = e.target.closest('.btn-action-view');
        const editBtn = e.target.closest('.btn-action-edit');
        const delBtn = e.target.closest('.btn-action-delete');
        if (viewBtn) {
            const id = viewBtn.dataset.id;
            const proj = allProjects.find(p => String(p.id) === String(id));
            if (!proj) {
                Swal.fire({
                    icon: 'error',
                    title: 'Proyecto no encontrado',
                    text: 'No se encontró el proyecto seleccionado'
                });
                return;
            }
            openProjectModal(true, proj, true); // viewOnly = true
        }
        if (editBtn) {
            const id = editBtn.dataset.id;
            const proj = allProjects.find(p => String(p.id) === String(id));
            if (!proj) {
                Swal.fire({
                    icon: 'error',
                    title: 'Proyecto no encontrado',
                    text: 'No se encontró el proyecto seleccionado'
                });
                return;
            }
            openProjectModal(true, proj, false); // viewOnly = false
        }
        if (delBtn) {
            const id = delBtn.dataset.id;
            const result = await Swal.fire({
                title: '¿Eliminar proyecto?',
                text: 'Esta acción no se puede deshacer. Se eliminarán todas las asignaciones relacionadas.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            });
            if (!result.isConfirmed) return;
            try {
                const response = await fetch((window.getApiUrl ? window.getApiUrl(`/api/projects/${id}`) : `/api/projects/${id}`), {
                    method: 'DELETE'
                });
                if (!response.ok) throw new Error('Error al eliminar proyecto');
                Swal.fire({
                    icon: 'success',
                    title: 'Proyecto eliminado',
                    timer: 2000,
                    showConfirmButton: false
                });
                fetchProjects();
            } catch (err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error al eliminar proyecto',
                    text: err.message || err
                });
            }
        }
    });

    function filterProjects() {
        const nameFilter = (document.getElementById('filter-project-name')?.value || '').trim().toLowerCase();
        const responsibleFilter = (document.getElementById('filter-project-responsible')?.value || '').trim().toLowerCase();
        const cityFilter = (document.getElementById('filter-project-city')?.value || '').trim().toLowerCase();
        const statusFilter = (document.getElementById('filter-project-status')?.value || '').trim();
        const startDateFilter = document.getElementById('filter-project-start-date')?.value || '';
        const endDateFilter = document.getElementById('filter-project-end-date')?.value || '';

        let filtered = allProjects.filter(p => {
            // Filtro por nombre
            if (nameFilter) {
                const projectName = (p.nombre_proyecto || p.name || '').toLowerCase();
                if (!projectName.includes(nameFilter)) return false;
            }

            // Filtro por responsable
            if (responsibleFilter) {
                const responsible = (p.responsable_proyecto || '').toLowerCase();
                if (!responsible.includes(responsibleFilter)) return false;
            }

            // Filtro por ciudad
            if (cityFilter) {
                const city = (p.ciudad || '').toLowerCase();
                if (!city.includes(cityFilter)) return false;
            }

            // Filtro por estado del proyecto
            if (statusFilter) {
                const projectStatus = p.estado_proyecto || p.status || '';
                if (projectStatus !== statusFilter) return false;
            }

            // Filtro por fecha de inicio (mayor o igual)
            if (startDateFilter) {
                const projectStartDate = (p.fecha_inicio || p.start_date || '').split('T')[0];
                if (projectStartDate < startDateFilter) return false;
            }

            // Filtro por fecha de fin (menor o igual)
            if (endDateFilter) {
                const projectEndDate = (p.fecha_fin || p.end_date || '').split('T')[0];
                if (projectEndDate > endDateFilter) return false;
            }

            return true;
        });

        renderProjects(filtered);
    }

    // Event listeners para filtros
    document.getElementById('filter-project-name')?.addEventListener('input', filterProjects);
    document.getElementById('filter-project-responsible')?.addEventListener('input', filterProjects);
    document.getElementById('filter-project-city')?.addEventListener('input', filterProjects);
    document.getElementById('filter-project-status')?.addEventListener('change', filterProjects);
    document.getElementById('filter-project-start-date')?.addEventListener('change', filterProjects);
    document.getElementById('filter-project-end-date')?.addEventListener('change', filterProjects);
    document.getElementById('filter-project-search-btn')?.addEventListener('click', filterProjects);
    document.getElementById('filter-project-clear-btn')?.addEventListener('click', () => {
        document.getElementById('filter-project-name').value = '';
        document.getElementById('filter-project-responsible').value = '';
        document.getElementById('filter-project-city').value = '';
        document.getElementById('filter-project-status').value = '';
        document.getElementById('filter-project-start-date').value = '';
        document.getElementById('filter-project-end-date').value = '';
        renderProjects(allProjects);
    });

    // Modal de proyectos
    const projectModal = document.getElementById('project-modal');
    const projectForm = document.getElementById('project-form');
    const projectModalClose = document.getElementById('project-modal-close');
    const projectCancel = document.getElementById('project-cancel');
    const otSectionToggle = document.getElementById('ot-section-toggle');

    async function openProjectModal(isEdit = false, project = null, viewOnly = false) {
        console.log('🔔 Abriendo modal de proyecto:', { isEdit, project, viewOnly });
        document.getElementById('project-modal-title').textContent = viewOnly ? '👁️ Ver Proyecto' : (isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto');
        
        // Guardar estado viewOnly en el modal
        projectModal.dataset.viewOnly = viewOnly ? 'true' : 'false';
        
        // Cambiar texto del botón cancelar
        const cancelBtn = document.getElementById('project-cancel');
        if (cancelBtn) {
            cancelBtn.textContent = viewOnly ? 'Cerrar' : 'Cancelar';
        }
        
        // Controlar visibilidad de pestaña de asignaciones (solo al editar)
        const assignmentsTab = document.querySelector('button[data-tab="project-assignments"]');
        const assignmentsContent = document.getElementById('tab-project-assignments');
        
        if (!isEdit) {
            // Ocultar pestaña de asignaciones para proyectos nuevos
            if (assignmentsTab) assignmentsTab.style.display = 'none';
            if (assignmentsContent) assignmentsContent.classList.remove('active');
            
            // Asegurar que la pestaña de Datos Generales esté activa
            const generalTab = document.querySelector('button[data-tab="project-general"]');
            const generalContent = document.getElementById('tab-project-general');
            if (generalTab) generalTab.classList.add('active');
            if (generalContent) generalContent.classList.add('active');
        } else {
            // Mostrar pestaña de asignaciones para proyectos existentes
            if (assignmentsTab) assignmentsTab.style.display = '';
        }
        
        // Resetear sección OTs (colapsada por defecto solo para nuevo proyecto)
        const otContent = document.getElementById('ot-section-content');
        const otArrow = document.getElementById('ot-section-arrow');
        if (!isEdit) {
            if (otContent) otContent.style.display = 'none';
            if (otArrow) otArrow.style.transform = 'rotate(0deg)';
        }
        
        // OTs temporales para proyecto nuevo
        if (!isEdit) {
            projectForm.reset();
            document.getElementById('project-id').value = '';
            window.currentProjectOTs = [];
            console.log('📋 Inicializando OTs vacías para proyecto nuevo');
            renderOTList([]);
        } else if (project) {
            console.log('📝 Loading project data for edit:', project);
            document.getElementById('project-id').value = project.id || '';
            document.getElementById('project-name').value = project.name || '';
            document.getElementById('project-description').value = project.description || '';
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                if (dateStr instanceof Date) {
                    return dateStr.toISOString().split('T')[0];
                }
                if (typeof dateStr === 'string') {
                    return dateStr.split('T')[0];
                }
                return '';
            };
            document.getElementById('project-start-date').value = formatDate(project.start_date);
            document.getElementById('project-end-date').value = formatDate(project.end_date);
            document.getElementById('project-status').value = project.status || 'Planificación';
            document.getElementById('project-manager').value = project.project_manager || '';
            document.getElementById('project-leader').value = project.project_leader || '';
            document.getElementById('cbt-responsible').value = project.cbt_responsible || '';
            document.getElementById('user-assigned').value = project.user_assigned || '';
            document.getElementById('project-celula').value = project.celula_id || '';
            document.getElementById('project-costo-asignado').value = project.costo_asignado || '';
            // Cargar OTs del backend
            await loadAndRenderOTs(project.id);
            console.log('✅ Project data loaded');
        }
        
        // Configurar modo de solo lectura
        const formFields = projectForm.querySelectorAll('input, textarea, select');
        const submitBtn = document.getElementById('project-submit');
        const otFormElements = document.querySelectorAll('#ot-form input, #ot-form select, #ot-add-btn');
        
        if (viewOnly) {
            // Deshabilitar todos los campos del formulario
            formFields.forEach(field => field.disabled = true);
            // Ocultar botón de guardar
            if (submitBtn) submitBtn.style.display = 'none';
            // Deshabilitar formulario de agregar OTs
            otFormElements.forEach(el => {
                if (el.tagName === 'A') {
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.5';
                } else {
                    el.disabled = true;
                }
            });
            // Ocultar elementos de edición de OTs (debe hacerse después de renderizar)
            setTimeout(() => {
                const otModeSelector = document.getElementById('ot-mode-selector');
                const otSelectorExisting = document.getElementById('ot-selector-existing');
                const otAddExistingBtn = document.getElementById('ot-add-existing-btn');
                const otDeleteButtons = document.querySelectorAll('#ot-list-body .btn-action-delete');
                const projectAddAssignmentBtn = document.getElementById('project-add-assignment');
                const finishAssignmentButtons = document.querySelectorAll('#project-assignments-tbody button[onclick^="finishAssignmentFromProject"]');
                
                if (otModeSelector) otModeSelector.style.display = 'none';
                if (otSelectorExisting) otSelectorExisting.style.display = 'none';
                if (otAddExistingBtn) otAddExistingBtn.style.display = 'none';
                if (projectAddAssignmentBtn) projectAddAssignmentBtn.style.display = 'none';
                otDeleteButtons.forEach(btn => btn.style.display = 'none');
                finishAssignmentButtons.forEach(btn => btn.style.display = 'none');
            }, 100);
            console.log('🔒 Modo solo lectura activado');
        } else {
            // Habilitar todos los campos
            formFields.forEach(field => field.disabled = false);
            // Mostrar botón de guardar
            if (submitBtn) submitBtn.style.display = '';
            // Habilitar formulario de agregar OTs
            otFormElements.forEach(el => {
                if (el.tagName === 'A') {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                } else {
                    el.disabled = false;
                }
            });
            // Mostrar elementos de edición de OTs
            setTimeout(() => {
                const otModeSelector = document.getElementById('ot-mode-selector');
                const otSelectorExisting = document.getElementById('ot-selector-existing');
                const otAddExistingBtn = document.getElementById('ot-add-existing-btn');
                const otDeleteButtons = document.querySelectorAll('#ot-list-body .btn-action-delete');
                const projectAddAssignmentBtn = document.getElementById('project-add-assignment');
                
                if (otModeSelector) otModeSelector.style.display = 'flex';
                if (otSelectorExisting) otSelectorExisting.style.display = 'block';
                if (otAddExistingBtn) otAddExistingBtn.style.display = '';
                if (projectAddAssignmentBtn) projectAddAssignmentBtn.style.display = '';
                otDeleteButtons.forEach(btn => btn.style.display = '');
            }, 100);
            console.log('✏️ Modo edición activado');
        }
        
        projectModal.style.display = 'flex';
    }
    
    // Exponer función para ser usada desde otros módulos (ej: assignments.js)
    window.openProjectModal = openProjectModal;

    async function loadAndRenderOTs(projectId) {
        if (!projectId) {
            renderOTList([]);
            return;
        }
        try {
            const url = window.getApiUrl ? window.getApiUrl(`/api/projects/${projectId}/orders-of-work`) : `/api/projects/${projectId}/orders-of-work`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error al cargar OTs');
            const data = await res.json();
            window.currentProjectOTs = data;
            renderOTList(data);
            
            // Expandir automáticamente la sección de OTs si hay OTs para mostrar
            if (data && data.length > 0) {
                const otContent = document.getElementById('ot-section-content');
                const otArrow = document.getElementById('ot-section-arrow');
                if (otContent) otContent.style.display = 'block';
                if (otArrow) otArrow.style.transform = 'rotate(180deg)';
                console.log('✨ Sección de OTs expandida automáticamente -', data.length, 'OTs encontradas');
            }
        } catch (e) {
            renderOTList([]);
        }
    }

    function renderOTList(ots) {
        console.log('🎨 Renderizando lista de OTs:', ots);
        const tbody = document.getElementById('ot-list-body');
        const empty = document.getElementById('ot-list-empty');
        
        if (!tbody) {
            console.error('❌ No se encontró el elemento ot-list-body');
            return;
        }
        if (!empty) {
            console.error('❌ No se encontró el elemento ot-list-empty');
            return;
        }
        
        tbody.innerHTML = '';
        if (!ots || ots.length === 0) {
            console.log('📭 No hay OTs, mostrando mensaje vacío');
            empty.style.display = 'block';
            return;
        }
        console.log('📝 Renderizando', ots.length, 'OTs');
        empty.style.display = 'none';
        ots.forEach((ot, idx) => {
            const tr = document.createElement('tr');
            const costo = ot.costo_ot ? parseFloat(ot.costo_ot).toFixed(2) : '0.00';
            tr.innerHTML = `
                <td style="padding:6px 8px;">${ot.ot_code || ''}</td>
                <td style="padding:6px 8px;">${ot.description || ''}</td>
                <td style="padding:6px 8px;">${ot.status || ''}</td>
                <td style="padding:6px 8px;">${ot.start_date || ''}</td>
                <td style="padding:6px 8px;">${ot.end_date || ''}</td>
                <td style="padding:6px 8px;">$${costo}</td>
                <td style="padding:6px 8px;"><button class="btn-action-delete" data-ot-id="${ot.id || ''}" data-ot-idx="${idx}" title="Eliminar OT">🗑️</button></td>
            `;
            tbody.appendChild(tr);
        });
        console.log('✅ OTs renderizadas correctamente');
        
        // Calcular y actualizar monto total
        updateTotalMontoOTs(ots);
    }

    // Calcular y actualizar monto total de OTs
    function updateTotalMontoOTs(ots) {
        const total = ots.reduce((sum, ot) => sum + (parseFloat(ot.costo_ot) || 0), 0);
        const montoTotalInput = document.getElementById('project-monto-total-ots');
        if (montoTotalInput) {
            montoTotalInput.value = `$${total.toFixed(2)}`;
        }
    }

    // ================== FUNCIONALIDAD DE OTs EXISTENTES ==================
    
    // Variable global para almacenar todas las OTs disponibles
    let allAvailableOTs = [];

    // Cargar OTs existentes en el select
    async function loadOTsIntoSelect() {
        try {
            const response = await fetch(window.getApiUrl ? window.getApiUrl('/api/orders-of-work') : '/api/orders-of-work');
            allAvailableOTs = await response.json();
            
            const select = otRefs.existingSelect;
            if (!select) return;
            
            // Limpiar opciones existentes (excepto la primera)
            select.innerHTML = '<option value="">-- Seleccione una OT --</option>';
            
            // Agregar OTs existentes como opciones
            allAvailableOTs.forEach(ot => {
                const option = document.createElement('option');
                option.value = ot.id;
                option.textContent = `${ot.ot_code || ot.ot || 'Sin código'} - ${ot.description || ot.tipo_servicio || ot.perfil || 'Sin descripción'}`;
                option.dataset.otData = JSON.stringify(ot);
                select.appendChild(option);
            });
            
            console.log(`✅ ${allAvailableOTs.length} OTs cargadas en el selector`);
        } catch (err) {
            console.error('Error al cargar OTs:', err);
        }
    }

    // Referencias a elementos del toggle de OT (se inicializan en el modal)
    let otRefs = {
        modeExisting: null,
        modeNew: null,
        selectorExisting: null,
        form: null,
        existingSelect: null,
        existingDetails: null,
        addExistingBtn: null,
        addNewBtn: null
    };

    // Función para inicializar referencias de OT cuando se abre el modal
    function initOTReferences() {
        otRefs.modeExisting = document.getElementById('ot-mode-existing');
        otRefs.modeNew = document.getElementById('ot-mode-new');
        otRefs.selectorExisting = document.getElementById('ot-selector-existing');
        otRefs.form = document.getElementById('ot-form');
        otRefs.existingSelect = document.getElementById('ot-existing-select');
        otRefs.existingDetails = document.getElementById('ot-existing-details');
        otRefs.addExistingBtn = document.getElementById('ot-add-existing-btn');
        otRefs.addNewBtn = document.getElementById('ot-add-btn');

        console.log('🔧 Referencias OT inicializadas:', {
            modeExisting: !!otRefs.modeExisting,
            modeNew: !!otRefs.modeNew,
            selectorExisting: !!otRefs.selectorExisting,
            form: !!otRefs.form,
            existingSelect: !!otRefs.existingSelect,
            existingDetails: !!otRefs.existingDetails,
            addExistingBtn: !!otRefs.addExistingBtn,
            addNewBtn: !!otRefs.addNewBtn
        });

        // Vincular event listeners a los radio buttons de modo
        if (otRefs.modeExisting && !otRefs.modeExisting.hasAttribute('data-listener')) {
            otRefs.modeExisting.addEventListener('change', () => {
                if (otRefs.modeExisting.checked) {
                    console.log('📢 Radio EXISTENTE seleccionado');
                    setOTMode('existing');
                }
            });
            otRefs.modeExisting.setAttribute('data-listener', 'true');
        }

        if (otRefs.modeNew && !otRefs.modeNew.hasAttribute('data-listener')) {
            otRefs.modeNew.addEventListener('change', () => {
                if (otRefs.modeNew.checked) {
                    console.log('📢 Radio NUEVA seleccionado');
                    setOTMode('new');
                }
            });
            otRefs.modeNew.setAttribute('data-listener', 'true');
        }

        // Vincular change listener al select de OTs existentes
        if (otRefs.existingSelect && !otRefs.existingSelect.hasAttribute('data-listener')) {
            otRefs.existingSelect.addEventListener('change', function() {
                const selectedOption = this.options[this.selectedIndex];
                
                if (this.value && selectedOption.dataset.otData) {
                    const otData = JSON.parse(selectedOption.dataset.otData);
                    
                    // Mostrar detalles
                    document.getElementById('detail-code').textContent = otData.ot_code || otData.ot || 'N/A';
                    document.getElementById('detail-status').textContent = otData.status || 'N/A';
                    document.getElementById('detail-description').textContent = otData.description || otData.tipo_servicio || otData.perfil || 'Sin descripción';
                    
                    if (otRefs.existingDetails) otRefs.existingDetails.style.display = 'block';
                } else {
                    if (otRefs.existingDetails) otRefs.existingDetails.style.display = 'none';
                }
            });
            otRefs.existingSelect.setAttribute('data-listener', 'true');
        }
    }

    function setOTMode(mode) {
        // Asegurar que las referencias estén inicializadas
        if (!otRefs.modeExisting || !otRefs.modeNew) {
            console.warn('⚠️ Referencias no inicializadas, inicializando...');
            initOTReferences();
        }

        console.log(`🔄 Cambiando a modo: ${mode}`);

        if (mode === 'existing') {
            // Activar modo "Seleccionar Existente"
            if (otRefs.modeExisting) {
                otRefs.modeExisting.checked = true;
                const label = otRefs.modeExisting.closest('label');
                if (label) {
                    label.style.background = '#e6f2ff';
                    label.style.borderColor = '#0066ff';
                }
            }
            if (otRefs.modeNew) {
                otRefs.modeNew.checked = false;
                const label = otRefs.modeNew.closest('label');
                if (label) {
                    label.style.background = '#f8f9fa';
                    label.style.borderColor = '#e6eef8';
                }
            }
            if (otRefs.selectorExisting) {
                otRefs.selectorExisting.style.display = 'block';
                otRefs.selectorExisting.style.visibility = 'visible';
                otRefs.selectorExisting.style.height = 'auto';
                otRefs.selectorExisting.style.opacity = '1';
                console.log('✅ Selector VISIBLE', otRefs.selectorExisting);
            }
            if (otRefs.form) {
                // Ocultar formulario con múltiples propiedades
                otRefs.form.style.display = 'none';
                otRefs.form.style.visibility = 'hidden';
                otRefs.form.style.height = '0';
                otRefs.form.style.overflow = 'hidden';
                otRefs.form.style.opacity = '0';
                console.log('❌ Formulario OCULTO', otRefs.form);
            }
        } else {
            // Activar modo "Crear Nueva"
            if (otRefs.modeNew) {
                otRefs.modeNew.checked = true;
                const label = otRefs.modeNew.closest('label');
                if (label) {
                    label.style.background = '#e6f2ff';
                    label.style.borderColor = '#0066ff';
                }
            }
            if (otRefs.modeExisting) {
                otRefs.modeExisting.checked = false;
                const label = otRefs.modeExisting.closest('label');
                if (label) {
                    label.style.background = '#f8f9fa';
                    label.style.borderColor = '#e6eef8';
                }
            }
            if (otRefs.selectorExisting) {
                otRefs.selectorExisting.style.display = 'none';
                otRefs.selectorExisting.style.visibility = 'hidden';
                otRefs.selectorExisting.style.height = '0';
                otRefs.selectorExisting.style.opacity = '0';
                console.log('❌ Selector OCULTO', otRefs.selectorExisting);
            }
            if (otRefs.form) {
                // Mostrar formulario con todas sus propiedades
                otRefs.form.style.display = 'flex';
                otRefs.form.style.visibility = 'visible';
                otRefs.form.style.height = 'auto';
                otRefs.form.style.overflow = 'visible';
                otRefs.form.style.opacity = '1';
                otRefs.form.style.gap = '10px';
                otRefs.form.style.alignItems = 'flex-end';
                otRefs.form.style.marginBottom = '12px';
                otRefs.form.style.flexWrap = 'wrap';
                console.log('✅ Formulario VISIBLE', otRefs.form);
            }
        }
    }

    // Cconsole.log('🚀 Modal de proyecto abierto, inicializando OT...');
        
      //C  argar OTs existentes cuando se abre el modal de proyecto
    const originalOpenProjectModal = openProjectModal;
    openProjectModal = async function(isEdit = false, project = null, viewOnly = false) {
        await originalOpenProjectModal(isEdit, project, viewOnly);
        
        // Inicializar referencias de OT
        initOTReferences();
        
        // Cargar OTs existentes en el selector
        await loadOTsIntoSelect();
        
        // Pequeño delay para asegurar que el DOM esté completamente renderizado
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Establecer modo por defecto (seleccionar existente) 
        console.log('🎯 Estableciendo modo inicial: existing');
        setOTMode('existing');
    };

    // ================== FIN FUNCIONALIDAD DE OTs EXISTENTES ==================

    // Helper: Resetear campos del formulario OT (no es <form> sino <div>, no tiene .reset())
    function resetOTForm() {
        const otCode = document.getElementById('ot-code');
        const otDesc = document.getElementById('ot-description');
        const otStatus = document.getElementById('ot-status');
        const otStart = document.getElementById('ot-start-date');
        const otEnd = document.getElementById('ot-end-date');
        const otCosto = document.getElementById('ot-costo');
        
        if (otCode) otCode.value = '';
        if (otDesc) otDesc.value = '';
        if (otStatus) otStatus.value = 'en ejecucion';
        if (otStart) otStart.value = '';
        if (otEnd) otEnd.value = '';
        if (otCosto) otCosto.value = '';
    }

    // Prevenir submit del formulario OT usando event delegation
    document.addEventListener('submit', function(e) {
        if (e.target && e.target.id === 'ot-form') {
            console.log('⚠️ Formulario OT intentó hacer submit - prevenido');
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    // Agregar OT - Usando anchor tag con event delegation
    document.addEventListener('click', async function(e) {
        // Verificar si el click fue en el enlace Agregar OT
        const target = e.target;
        if (target.id === 'ot-add-btn' || target.closest('#ot-add-btn')) {
            console.log('🔔 Botón Agregar OT clickeado');
            e.preventDefault();
            e.stopPropagation();
            
            // Buscar los elementos dinámicamente
            const otCodeEl = document.getElementById('ot-code');
            const otDescEl = document.getElementById('ot-description');
            const otStatusEl = document.getElementById('ot-status');
            const otStartEl = document.getElementById('ot-start-date');
            const otEndEl = document.getElementById('ot-end-date');
            
            console.log('🔍 Elementos encontrados:', {
                otCode: !!otCodeEl,
                otDesc: !!otDescEl,
                otStatus: !!otStatusEl,
                otStart: !!otStartEl,
                otEnd: !!otEndEl
            });
            
            if (!otCodeEl) {
                console.error('❌ No se encontró el campo ot-code');
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró el formulario de OT. Por favor, intenta cerrar y abrir el modal nuevamente.' });
                return;
            }
            
            const otCode = otCodeEl.value.trim();
            const otDescription = otDescEl?.value.trim() || '';
            const otStatus = otStatusEl?.value || 'en ejecucion';
            const otStart = otStartEl?.value || '';
            const otEnd = otEndEl?.value || '';
            const otCostoEl = document.getElementById('ot-costo');
            const otCosto = otCostoEl?.value ? parseFloat(otCostoEl.value) : 0;
            
            console.log('📝 Datos de OT:', { otCode, otDescription, otStatus, otStart, otEnd, otCosto });
            
            if (!otCode) {
                Swal.fire({ icon: 'warning', title: 'Código OT requerido', text: 'Por favor ingresa un código para la OT' });
                return;
            }
            const projectId = document.getElementById('project-id')?.value || '';
            console.log('🆔 Project ID:', projectId);
            
            if (projectId) {
                // POST a API
                console.log('💾 Guardando OT en backend...');
                const res = await fetch((window.getApiUrl ? window.getApiUrl(`/api/projects/${projectId}/orders-of-work`) : `/api/projects/${projectId}/orders-of-work`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ot_code: otCode,
                        description: otDescription,
                        status: otStatus,
                        start_date: otStart,
                        end_date: otEnd,
                        costo_ot: otCosto
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    console.log('✅ OT guardada en backend:', data);
                    if (!window.currentProjectOTs) window.currentProjectOTs = [];
                    window.currentProjectOTs.push(data);
                    console.log('📋 Total OTs:', window.currentProjectOTs.length);
                    renderOTList(window.currentProjectOTs);
                    resetOTForm();
                    Swal.fire({ title: 'Agregando OT...', timer: 1000, showConfirmButton: false });
                } else {
                    console.error('❌ Error al guardar OT:', res.status);
                    Swal.fire({ icon: 'error', title: 'Error al guardar OT' });
                }
            } else {
                // Proyecto nuevo: guardar en memoria SIN id (OT nueva)
                console.log('💾 Guardando OT NUEVA en memoria (proyecto nuevo)...');
                if (!window.currentProjectOTs) window.currentProjectOTs = [];
                const newOT = {
                    // NO incluir id - esto marca que es una OT nueva
                    ot_code: otCode,
                    description: otDescription,
                    status: otStatus,
                    start_date: otStart,
                    costo_ot: otCosto,
                    end_date: otEnd
                };
                console.log('✅ OT nueva a agregar (SIN id):', newOT);
                window.currentProjectOTs.push(newOT);
                console.log('✅ OT agregada a memoria:', window.currentProjectOTs);
                console.log('📋 Total OTs:', window.currentProjectOTs.length);
                renderOTList(window.currentProjectOTs);
                resetOTForm();
                Swal.fire({ title: 'Agregando OT...', timer: 1000, showConfirmButton: false });
            }
        }
    });

    // Agregar OT Existente - Usando event delegation a nivel documento
    document.addEventListener('click', async function(e) {
        // Verificar si el click fue en el botón de agregar OT existente
        const target = e.target;
        if (target.id === 'ot-add-existing-btn' || target.closest('#ot-add-existing-btn')) {
            console.log('🔘 Click en Agregar OT Seleccionada (delegación documento)');
            e.preventDefault();
            e.stopPropagation();
            
            const select = document.getElementById('ot-existing-select');
            if (!select || !select.value) {
                Swal.fire({ 
                    icon: 'warning', 
                    title: 'Seleccione una OT', 
                    text: 'Por favor seleccione una OT de la lista antes de agregarla' 
                });
                return;
            }

            const selectedOption = select.options[select.selectedIndex];
            const otData = JSON.parse(selectedOption.dataset.otData);
            const projectId = document.getElementById('project-id')?.value || '';

            console.log('📋 OT seleccionada:', otData);

            // Verificar si la OT ya está en la lista
            if (window.currentProjectOTs && window.currentProjectOTs.some(ot => ot.id === otData.id || ot.ot_code === otData.ot_code)) {
                Swal.fire({ 
                    icon: 'warning', 
                    title: 'OT Duplicada', 
                    text: 'Esta OT ya está agregada a este proyecto' 
                });
                return;
            }

            // Preparar datos de OT existente para agregar (con id obligatorio)
            const otToAdd = {
                id: otData.id, // ID obligatorio para OTs existentes
                ot_code: otData.ot_code || otData.ot,
                description: otData.description || otData.tipo_servicio || otData.perfil || '',
                status: otData.status || 'en ejecucion',
                start_date: otData.start_date || otData.fecha_inicio || '',
                end_date: otData.end_date || otData.fecha_fin || ''
            };
            
            console.log('✅ OT existente a agregar (CON id):', otToAdd);

            if (projectId) {
                // Si el proyecto ya existe, crear relación en el backend usando endpoint correcto (M:N)
                try {
                    const res = await fetch(
                        window.getApiUrl ? window.getApiUrl(`/api/projects/${projectId}/link-ot/${otData.id}`) : `/api/projects/${projectId}/link-ot/${otData.id}`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
                    );
                    
                    if (res.ok) {
                        if (!window.currentProjectOTs) window.currentProjectOTs = [];
                        window.currentProjectOTs.push(otToAdd);
                        renderOTList(window.currentProjectOTs);
                        
                        // Resetear selector
                        select.value = '';
                        const details = document.getElementById('ot-existing-details');
                        if (details) details.style.display = 'none';
                        
                        Swal.fire({ 
                            icon: 'success', 
                            title: 'OT Agregada', 
                            text: 'La OT existente ha sido vinculada al proyecto',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } else {
                        throw new Error('Error al vincular OT');
                    }
                } catch (err) {
                    console.error('Error al vincular OT:', err);
                    Swal.fire({ 
                        icon: 'error', 
                        title: 'Error', 
                        text: 'No se pudo vincular la OT al proyecto' 
                    });
                }
            } else {
                // Proyecto nuevo: agregar a memoria para guardar después
                if (!window.currentProjectOTs) window.currentProjectOTs = [];
                window.currentProjectOTs.push(otToAdd);
                renderOTList(window.currentProjectOTs);
                
                // Resetear selector
                select.value = '';
                const details = document.getElementById('ot-existing-details');
                if (details) details.style.display = 'none';
                
                Swal.fire({ 
                    icon: 'success', 
                    title: 'OT Agregada', 
                    text: 'La OT será vinculada cuando guardes el proyecto',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        }
    });

    // Eliminar OT - Usando event delegation
    document.getElementById('ot-list-body')?.addEventListener('click', async function(e) {
            if (e.target.matches('button[data-ot-id]')) {
                const otId = e.target.getAttribute('data-ot-id');
                const otIdx = e.target.getAttribute('data-ot-idx');
                const projectId = document.getElementById('project-id').value;
                if (projectId && otId) {
                    // Eliminar en backend
                    await fetch((window.getApiUrl ? window.getApiUrl(`/api/orders-of-work/${otId}`) : `/api/orders-of-work/${otId}`), {
                        method: 'DELETE'
                    });
                    window.currentProjectOTs = window.currentProjectOTs.filter(ot => String(ot.id) !== String(otId));
                    renderOTList(window.currentProjectOTs);
                } else {
                    // Eliminar en memoria
                    window.currentProjectOTs.splice(otIdx, 1);
                    renderOTList(window.currentProjectOTs);
                }
            }
        });

    async function closeProjectModal(skipConfirmation = false) {
        console.log('🔒 Cerrando modal de proyecto, skipConfirmation:', skipConfirmation);
        const isViewOnly = projectModal.dataset.viewOnly === 'true';
        
        // Si está en modo viewOnly, no mostrar confirmación
        if (!skipConfirmation && !isViewOnly) {
            const result = await Swal.fire({
                title: '¿Cancelar edición de proyecto?',
                text: 'Se perderán los cambios no guardados',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, cerrar',
                cancelButtonText: 'Continuar editando',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            });
            if (!result.isConfirmed) {
                console.log('❌ Usuario canceló el cierre del modal');
                return;
            }
        }
        console.log('✅ Cerrando modal...');
        projectModal.style.display = 'none';
        projectForm.reset();
        
        // Resetear texto del botón cancelar
        const cancelBtn = document.getElementById('project-cancel');
        if (cancelBtn) cancelBtn.textContent = 'Cancelar';
        
        // Resetear estado viewOnly
        projectModal.dataset.viewOnly = 'false';
        
        // Resetear sección OTs
        const otContent = document.getElementById('ot-section-content');
        const otArrow = document.getElementById('ot-section-arrow');
        if (otContent) otContent.style.display = 'none';
        if (otArrow) otArrow.style.transform = 'rotate(0deg)';
    }

    // Toggle de sección OTs
    otSectionToggle?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔘 Toggle OT section clicked');
        const content = document.getElementById('ot-section-content');
        const arrow = document.getElementById('ot-section-arrow');
        if (content.style.display === 'none' || content.style.display === '') {
            console.log('📂 Abriendo sección OT');
            content.style.display = 'block';
            arrow.style.transform = 'rotate(180deg)';
        } else {
            console.log('📁 Cerrando sección OT');
            content.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    });

    addProjectBtn?.addEventListener('click', () => openProjectModal(false));
    projectModalClose?.addEventListener('click', async () => {
        console.log('❌ Close button clicked');
        await closeProjectModal();
    });
    projectCancel?.addEventListener('click', async (e) => {
        console.log('🚫 Cancel button clicked', e);
        e.preventDefault();
        e.stopPropagation();
        await closeProjectModal();
    });
    projectModal?.addEventListener('click', async (e) => {
        if (e.target === projectModal) await closeProjectModal();
    });

    projectForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('🔔 Submit event fired for project form');
        const projectId = document.getElementById('project-id').value;
        const name = document.getElementById('project-name').value;
        const description = document.getElementById('project-description').value;
        const startDate = document.getElementById('project-start-date').value;
        const endDate = document.getElementById('project-end-date').value;
        const status = document.getElementById('project-status').value;
        const projectManager = document.getElementById('project-manager').value;
        const projectLeader = document.getElementById('project-leader').value;
        const cbtResponsible = document.getElementById('cbt-responsible').value;
        const userAssigned = document.getElementById('user-assigned').value;
        const celulaId = document.getElementById('project-celula').value;
        const costoAsignado = document.getElementById('project-costo-asignado').value;

        if (!name || !startDate) {
            Swal.fire({
                icon: 'warning',
                title: 'Campos requeridos',
                text: 'Los campos nombre y fecha de inicio son obligatorios'
            });
            return;
        }

        try {
            const payload = {
                name,
                description,
                start_date: startDate,
                end_date: endDate,
                status,
                project_manager: projectManager || null,
                project_leader: projectLeader || null,
                cbt_responsible: cbtResponsible || null,
                user_assigned: userAssigned || null,
                celula_id: celulaId ? parseInt(celulaId) : null,
                costo_asignado: costoAsignado ? parseFloat(costoAsignado) : null
            };

            const url = projectId 
                ? (window.getApiUrl ? window.getApiUrl(`/api/projects/${projectId}`) : `/api/projects/${projectId}`)
                : (window.getApiUrl ? window.getApiUrl('/api/projects') : '/api/projects');
            const method = projectId ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            
            // Si es proyecto nuevo, guardar OTs en backend
            if (!projectId && window.currentProjectOTs && window.currentProjectOTs.length > 0) {
                console.log('💾 Guardando OTs para proyecto nuevo...');
                for (const ot of window.currentProjectOTs) {
                    try {
                        if (ot.id && typeof ot.id === 'number') {
                            // OT existente: crear solo la relación M:N usando endpoint correcto
                            console.log(`🔗 Vinculando OT existente ${ot.id} al proyecto ${result.id}`);
                            const linkRes = await fetch(
                                window.getApiUrl ? window.getApiUrl(`/api/projects/${result.id}/link-ot/${ot.id}`) : `/api/projects/${result.id}/link-ot/${ot.id}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                            if (!linkRes.ok) {
                                const errorText = await linkRes.text();
                                console.error(`❌ Error al vincular OT ${ot.id}:`, errorText);
                            } else {
                                console.log(`✅ OT ${ot.id} vinculada correctamente`);
                            }
                        } else {
                            // OT nueva: crear la OT y la relación
                            console.log('➕ Creando nueva OT:', ot);
                            const otPayload = {
                                ot_code: ot.ot_code || ot.ot,
                                description: ot.description,
                                status: ot.status,
                                start_date: ot.start_date,
                                end_date: ot.end_date,
                                costo_ot: ot.costo_ot || 0
                            };
                            console.log('📦 Payload OT a enviar:', otPayload);
                            const createRes = await fetch(
                                window.getApiUrl ? window.getApiUrl(`/api/projects/${result.id}/orders-of-work`) : `/api/projects/${result.id}/orders-of-work`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(otPayload)
                                }
                            );
                            if (!createRes.ok) {
                                const errorText = await createRes.text();
                                console.error('❌ Error al crear OT:', errorText);
                                try {
                                    const errorJson = JSON.parse(errorText);
                                    console.error('❌ Detalles del error:', errorJson);
                                } catch (e) {
                                    // No es JSON, ya lo mostramos como texto
                                }
                            } else {
                                console.log('✅ OT creada correctamente');
                            }
                        }
                    } catch (otError) {
                        console.error('❌ Error procesando OT:', otError);
                    }
                }
                console.log('✅ Todas las OTs procesadas');
            }
            if (projectId) {
                Swal.fire({
                    icon: 'success',
                    title: 'Proyecto actualizado',
                    text: 'Los datos del proyecto se actualizaron correctamente',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    icon: 'success',
                    title: 'Proyecto creado',
                    text: 'El proyecto se creó correctamente',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
            closeProjectModal(true); // true = skip confirmation
            fetchProjects();
        } catch (err) {
            console.error('❌ Error:', err);
            Swal.fire({
                icon: 'error',
                title: 'Error al guardar proyecto',
                text: err.message
            });
        }
    });

    // Additional protection: Prevent modal closing when clicking on form elements
    document.addEventListener('click', (e) => {
        // Check if the click is on a form element inside any modal
        const isInsideModal = e.target.closest('.modal-content');
        const isFormElement = e.target.matches('input, textarea, select, label, button[type="submit"], button[type="button"]:not(.modal-close)');
        
        const isAnyCancel = !!e.target.closest('#employee-cancel, #project-cancel, #vacation-cancel, #assignment-cancel');
        const isAnyClose  = !!e.target.closest('.modal-close, #modal-close, #project-modal-close, #vacation-modal-close, #assignment-modal-close');
        
        // Excluir botones de OT que tienen sus propios listeners con event delegation
        const isOTButton = !!e.target.closest('#ot-add-btn, #ot-add-existing-btn');

        if (isInsideModal && isFormElement && !isAnyCancel && !isAnyClose && !isOTButton) {
            e.stopPropagation();
        }
    }, true); // Use capture phase

    // ============================================
    // ÓRDENES DE TRABAJO (OTs) - Vista y Gestión
    // ============================================
    
    let allOrdersOfWork = [];
    let filteredOrdersOfWork = [];

    // Cargar todas las OTs
    window.loadOrdersOfWork = async function() {
        const loading = document.getElementById('ot-grid-loading');
        const table = document.getElementById('ot-table');
        const empty = document.getElementById('ot-grid-empty');
        const error = document.getElementById('ot-grid-error');
        const tbody = document.getElementById('ot-table-body');
        
        // Mostrar loading
        if (loading) loading.style.display = 'block';
        if (table) table.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (error) error.style.display = 'none';
        
        try {
            const response = await fetch(
                window.getApiUrl ? window.getApiUrl('/api/orders-of-work') : '/api/orders-of-work'
            );
            
            if (!response.ok) throw new Error('Error al cargar órdenes de trabajo');
            
            allOrdersOfWork = await response.json();
            filteredOrdersOfWork = [...allOrdersOfWork];
            
            // Cargar proyectos para el filtro
            await loadProjectsForFilter();
            
            // Renderizar
            renderOrdersOfWork();
            
            // Actualizar indicador de resultados (mostrar total inicial)
            if (window.updateFilterResultsIndicator) {
                window.updateFilterResultsIndicator(false); // Sin filtros activos inicialmente
            }
            
        } catch (err) {
            console.error('Error loading orders of work:', err);
            if (loading) loading.style.display = 'none';
            if (error) {
                error.style.display = 'block';
                const errorMsg = document.getElementById('ot-error-message');
                if (errorMsg) errorMsg.textContent = err.message;
            }
        }
    };

    // Cargar proyectos para el filtro
    async function loadProjectsForFilter() {
        try {
            const response = await fetch(
                window.getApiUrl ? window.getApiUrl('/api/projects') : '/api/projects'
            );
            const projects = await response.json();
            
            const select = document.getElementById('filter-ot-project');
            if (select) {
                select.innerHTML = '<option value="">📁 Todos los proyectos</option>';
                projects.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = p.name;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            console.error('Error loading projects for filter:', err);
        }
    }

    // Renderizar tabla de OTs usando DataTables
    function renderOrdersOfWork() {
        const loading = document.getElementById('ot-grid-loading');
        const table = document.getElementById('ot-table');
        const empty = document.getElementById('ot-grid-empty');
        const tbody = document.getElementById('ot-table-body');
        
        if (loading) loading.style.display = 'none';
        
        if (filteredOrdersOfWork.length === 0) {
            if (empty) empty.style.display = 'block';
            if (table) table.style.display = 'none';
            return;
        }
        
        if (empty) empty.style.display = 'none';
        if (table) table.style.display = 'table';
        
        if (!tbody) return;
        
        // Si DataTable ya existe, destruirlo para recrearlo
        if ($.fn.DataTable.isDataTable('#ot-table')) {
            $('#ot-table').DataTable().destroy();
        }
        
        tbody.innerHTML = '';
        
        // Agrupar por ot_code para detectar OTs con múltiples proyectos
        const otGroups = {};
        filteredOrdersOfWork.forEach(ot => {
            const code = ot.ot_code || '';
            if (!otGroups[code]) {
                otGroups[code] = [];
            }
            otGroups[code].push(ot);
        });
        
        // Formatear valores
        const formatCurrency = (val) => val ? `$${parseFloat(val).toLocaleString('es-MX', {minimumFractionDigits: 2})}` : '-';
        const formatDate = (val) => val ? new Date(val).toLocaleDateString('es-MX') : '-';
        const formatPercent = (val) => val ? `${val}%` : '-';
        
        // Preparar datos para DataTables
        const tableData = filteredOrdersOfWork.map(ot => {
            const multiProject = otGroups[ot.ot_code] && otGroups[ot.ot_code].length > 1;
            
            return [
                (multiProject ? '<span style="color:#007bff;font-weight:bold;" title="OT vinculada a múltiples proyectos">🔗</span> ' : '') + (ot.ot_code || '-'),
                ot.folio_principal_santec || '-',
                `<span style="background:#e0f2fe;color:#0369a1;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;">${ot.celula_name || '-'}</span>`,
                ot.folio_santec || '-',
                `<strong style="color:#007bff;">${ot.project_name || '-'}</strong>${multiProject ? `<div style="font-size:11px;color:#666;">(${otGroups[ot.ot_code].length} proyectos en total)</div>` : ''}`,
                `<span class="badge badge-${getStatusClass(ot.status)}">${ot.status || 'en ejecucion'}</span>`,
                `<div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${ot.description || ''}">${ot.description || '-'}</div>`,
                ot.tipo_servicio || '-',
                ot.tecnologia || '-',
                ot.aplicativo || '-',
                formatDate(ot.fecha_inicio_proveedor),
                formatDate(ot.fecha_fin_proveedor),
                ot.lider_delivery || '-',
                ot.responsable_proyecto || '-',
                ot.cbt_responsable || '-',
                formatCurrency(ot.monto_servicio_proveedor),
                formatCurrency(ot.costo_ot),
                ot.horas || '-',
                formatPercent(ot.porcentaje_ejecucion),
                `<button onclick="editOT(${ot.id})" class="btn-icon" title="Editar OT">✏️</button>
                 <button onclick="viewOTDetails(${ot.id})" class="btn-icon" title="Ver detalles">👁️</button>
                 <button onclick="deleteOT(${ot.id})" class="btn-icon" title="Eliminar OT">🗑️</button>`
            ];
        });
        
        // Inicializar DataTable con configuración avanzada
        const dataTable = $('#ot-table').DataTable({
            data: tableData,
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Todos"]],
            language: {
                decimal: "",
                emptyTable: "No hay datos disponibles",
                info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
                infoEmpty: "Mostrando 0 a 0 de 0 registros",
                infoFiltered: "(filtrado de _MAX_ registros totales)",
                infoPostFix: "",
                thousands: ",",
                lengthMenu: "Mostrar _MENU_ registros",
                loadingRecords: "Cargando...",
                processing: "Procesando...",
                search: "Buscar:",
                zeroRecords: "No se encontraron registros coincidentes",
                paginate: {
                    first: "Primero",
                    last: "Último",
                    next: "Siguiente",
                    previous: "Anterior"
                },
                aria: {
                    sortAscending: ": activar para ordenar la columna ascendente",
                    sortDescending: ": activar para ordenar la columna descendente"
                }
            },
            dom: 'Bfrtip',
            buttons: [
                {
                    extend: 'excel',
                    text: '📊 Exportar a Excel',
                    title: 'Ordenes_de_Trabajo',
                    exportOptions: {
                        columns: ':not(:last-child)' // Excluir columna de acciones
                    }
                },
                {
                    extend: 'pdf',
                    text: '📄 Exportar a PDF',
                    title: 'Ordenes de Trabajo',
                    exportOptions: {
                        columns: ':not(:last-child)'
                    },
                    orientation: 'landscape',
                    pageSize: 'LEGAL'
                },
                {
                    text: '🔄 Recargar',
                    action: function () {
                        window.loadOrdersOfWork();
                    }
                }
            ],
            order: [[0, 'desc']], // Ordenar por número OT descendente
            columnDefs: [
                { orderable: false, targets: -1 } // Deshabilitar orden en columna de acciones
            ],
            initComplete: function () {
                // Agregar filtros por columna en el footer
                this.api().columns([0, 3, 4, 5, 7, 8, 9]).every(function () {
                    let column = this;
                    let title = $(column.header()).text();
                    
                    // Crear select para filtrar
                    let select = $('<select class="column-filter"><option value="">Filtrar ' + title + '</option></select>')
                        .appendTo($(column.footer()).empty())
                        .on('change', function () {
                            let val = $.fn.dataTable.util.escapeRegex($(this).val());
                            column.search(val ? '^' + val + '$' : '', true, false).draw();
                        });
                    
                    // Agregar opciones únicas de la columna
                    column.data().unique().sort().each(function (d, j) {
                        // Extraer texto plano de HTML
                        let text = $('<div>').html(d).text();
                        if (text && text !== '-') {
                            select.append('<option value="' + text + '">' + text + '</option>');
                        }
                    });
                });
            }
        });
        
        console.log('✅ DataTable inicializado con', filteredOrdersOfWork.length, 'registros');
    }

    // Obtener clase de badge según el estado
    function getStatusClass(status) {
        const statusMap = {
            'Cancelado sin importe': 'secondary',
            'Cerrado': 'success',
            'En autorizacion de cierre': 'warning',
            'en ejecucion': 'info',
            'Formalizacion': 'primary'
        };
        return statusMap[status] || 'secondary';
    }

    // Ver detalles de una OT
    window.viewOTDetails = async function(otId) {
        try {
            const ot = allOrdersOfWork.find(o => o.id === otId);
            if (!ot) {
                Swal.fire({ icon: 'error', title: 'OT no encontrada' });
                return;
            }
            
            const formatCurrency = (val) => val ? `$${parseFloat(val).toLocaleString('es-MX', {minimumFractionDigits: 2})}` : 'N/A';
            const formatDate = (val) => val ? new Date(val).toLocaleDateString('es-MX') : 'N/A';
            
            const html = `
                <div style="text-align:left;max-height:500px;overflow-y:auto;">
                    <h3 style="margin-bottom:16px;color:#007bff;">📋 Información General</h3>
                    <p><strong>Número OT:</strong> ${ot.ot_code}</p>
                    <p><strong>Proyecto:</strong> ${ot.project_name || ot.nombre_proyecto || 'N/A'}</p>
                    <p><strong>Estado:</strong> ${ot.status || 'en ejecucion'}</p>
                    <p><strong>Descripción:</strong> ${ot.description || 'N/A'}</p>
                    
                    <h3 style="margin:16px 0;color:#007bff;">🏢 Folios y Clasificación</h3>
                    <p><strong>Folio Principal Santec:</strong> ${ot.folio_principal_santec || 'N/A'}</p>
                    <p><strong>Folio Santec:</strong> ${ot.folio_santec || 'N/A'}</p>
                    <p><strong>Tipo Servicio:</strong> ${ot.tipo_servicio || 'N/A'}</p>
                    <p><strong>Tecnología:</strong> ${ot.tecnologia || 'N/A'}</p>
                    <p><strong>Aplicativo:</strong> ${ot.aplicativo || 'N/A'}</p>
                    
                    <h3 style="margin:16px 0;color:#007bff;">📅 Fechas</h3>
                    <p><strong>Inicio Santander:</strong> ${formatDate(ot.fecha_inicio_santander)}</p>
                    <p><strong>Fin Santander:</strong> ${formatDate(ot.fecha_fin_santander)}</p>
                    <p><strong>Inicio Proveedor:</strong> ${formatDate(ot.fecha_inicio_proveedor)}</p>
                    <p><strong>Fin Proveedor:</strong> ${formatDate(ot.fecha_fin_proveedor)}</p>
                    <p><strong>Inicio Real:</strong> ${formatDate(ot.fecha_inicio_real)}</p>
                    <p><strong>Fin Real:</strong> ${formatDate(ot.fecha_fin_real)}</p>
                    
                    <h3 style="margin:16px 0;color:#007bff;">👥 Responsables</h3>
                    <p><strong>Líder Delivery:</strong> ${ot.lider_delivery || 'N/A'}</p>
                    <p><strong>Responsable Proyecto:</strong> ${ot.responsable_proyecto || 'N/A'}</p>
                    <p><strong>CBT Responsable:</strong> ${ot.cbt_responsable || 'N/A'}</p>
                    <p><strong>Proveedor:</strong> ${ot.proveedor || 'N/A'}</p>
                    
                    <h3 style="margin:16px 0;color:#007bff;">💰 Montos e Indicadores</h3>
                    <p><strong>Horas Acordadas:</strong> ${ot.horas_acordadas || 'N/A'}</p>
                    <p><strong>Horas:</strong> ${ot.horas || 'N/A'}</p>
                    <p><strong>Costo por Hora:</strong> ${formatCurrency(ot.costo_hora_servicio_proveedor)}</p>
                    <p><strong>Monto Servicio:</strong> ${formatCurrency(ot.monto_servicio_proveedor)}</p>
                    <p><strong>Monto con IVA:</strong> ${formatCurrency(ot.monto_servicio_proveedor_iva)}</p>
                    <p><strong>% Ejecución:</strong> ${ot.porcentaje_ejecucion || '0'}%</p>
                    <p><strong>Semáforo Esfuerzo:</strong> ${ot.semaforo_esfuerzo || 'N/A'}</p>
                    <p><strong>Semáforo Plazo:</strong> ${ot.semaforo_plazo || 'N/A'}</p>
                    
                    <h3 style="margin:16px 0;color:#007bff;">📋 Información Adicional</h3>
                    <p><strong>Ambiente:</strong> ${ot.ambiente || 'N/A'}</p>
                    <p><strong>Clase de Coste:</strong> ${ot.clase_coste || 'N/A'}</p>
                    <p><strong>Programa:</strong> ${ot.programa || 'N/A'}</p>
                    <p><strong>Front de Negocio:</strong> ${ot.front_negocio || 'N/A'}</p>
                    <p><strong>FT's:</strong> ${ot.fts || 'N/A'}</p>
                </div>
            `;
            
            Swal.fire({
                title: `OT: ${ot.ot_code}`,
                html: html,
                width: '700px',
                confirmButtonText: 'Cerrar'
            });
        } catch (err) {
            console.error('Error viewing OT details:', err);
            Swal.fire({ icon: 'error', title: 'Error al cargar detalles' });
        }
    };

    // Eliminar OT
    window.deleteOT = async function(otId) {
        const result = await Swal.fire({
            title: '¿Eliminar OT?',
            text: 'Esta acción no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc3545'
        });
        
        if (!result.isConfirmed) return;
        
        try {
            const response = await fetch(
                window.getApiUrl ? window.getApiUrl(`/api/orders-of-work/${otId}`) : `/api/orders-of-work/${otId}`,
                { method: 'DELETE' }
            );
            
            if (!response.ok) throw new Error('Error al eliminar OT');
            
            Swal.fire({ 
                icon: 'success', 
                title: 'OT eliminada',
                timer: 2000,
                showConfirmButton: false
            });
            
            window.loadOrdersOfWork();
        } catch (err) {
            console.error('Error deleting OT:', err);
            Swal.fire({ icon: 'error', title: 'Error al eliminar OT', text: err.message });
        }
    };

    // Editar OT - Abrir modal y cargar datos
    window.editOT = async function(otId) {
        try {
            const ot = allOrdersOfWork.find(o => o.id === otId);
            if (!ot) {
                Swal.fire({ icon: 'error', title: 'OT no encontrada' });
                return;
            }
            
            // Abrir modal
            const modal = document.getElementById('ot-edit-modal');
            if (!modal) {
                console.error('Modal de edición de OT no encontrado');
                return;
            }
            
            // Cargar datos en el formulario
            document.getElementById('ot-edit-id').value = ot.id || '';
            document.getElementById('ot-edit-code').value = ot.ot_code || '';
            document.getElementById('ot-edit-status').value = ot.status || 'en ejecucion';
            document.getElementById('ot-edit-project').value = ot.nombre_proyecto || ot.project_name || '';
            document.getElementById('ot-edit-description').value = ot.description || '';
            
            // Folios
            document.getElementById('ot-edit-folio-principal').value = ot.folio_principal_santec || '';
            document.getElementById('ot-edit-folio-santec').value = ot.folio_santec || '';
            document.getElementById('ot-edit-tipo-servicio').value = ot.tipo_servicio || '';
            document.getElementById('ot-edit-tecnologia').value = ot.tecnologia || '';
            document.getElementById('ot-edit-aplicativo').value = ot.aplicativo || '';
            
            // Fechas
            document.getElementById('ot-edit-fecha-inicio-santander').value = formatDateForInput(ot.fecha_inicio_santander);
            document.getElementById('ot-edit-fecha-fin-santander').value = formatDateForInput(ot.fecha_fin_santander);
            document.getElementById('ot-edit-fecha-entrega-proveedor').value = formatDateForInput(ot.fecha_entrega_proveedor);
            document.getElementById('ot-edit-fecha-inicio-proveedor').value = formatDateForInput(ot.fecha_inicio_proveedor);
            document.getElementById('ot-edit-fecha-fin-proveedor').value = formatDateForInput(ot.fecha_fin_proveedor);
            document.getElementById('ot-edit-dias-desvio').value = ot.dias_desvio_entrega || '';
            document.getElementById('ot-edit-fecha-inicio-real').value = formatDateForInput(ot.fecha_inicio_real);
            document.getElementById('ot-edit-fecha-fin-real').value = formatDateForInput(ot.fecha_fin_real);
            document.getElementById('ot-edit-fecha-creacion').value = formatDateForInput(ot.fecha_creacion);
            
            // Responsables
            document.getElementById('ot-edit-lider-delivery').value = ot.lider_delivery || '';
            document.getElementById('ot-edit-responsable-proyecto').value = ot.responsable_proyecto || '';
            document.getElementById('ot-edit-cbt-responsable').value = ot.cbt_responsable || '';
            document.getElementById('ot-edit-proveedor').value = ot.proveedor || '';
            
            // Montos e indicadores
            document.getElementById('ot-edit-horas-acordadas').value = ot.horas_acordadas || '';
            document.getElementById('ot-edit-horas').value = ot.horas || '';
            document.getElementById('ot-edit-costo-hora').value = ot.costo_hora_servicio_proveedor || '';
            document.getElementById('ot-edit-costo-ot').value = ot.costo_ot || '';
            document.getElementById('ot-edit-monto-servicio').value = ot.monto_servicio_proveedor || '';
            document.getElementById('ot-edit-monto-iva').value = ot.monto_servicio_proveedor_iva || '';
            document.getElementById('ot-edit-porcentaje').value = ot.porcentaje_ejecucion || '';
            document.getElementById('ot-edit-semaforo-esfuerzo').value = ot.semaforo_esfuerzo || '';
            document.getElementById('ot-edit-semaforo-plazo').value = ot.semaforo_plazo || '';
            
            // Información adicional
            document.getElementById('ot-edit-ambiente').value = ot.ambiente || '';
            document.getElementById('ot-edit-clase-coste').value = ot.clase_coste || '';
            document.getElementById('ot-edit-folio-pds').value = ot.folio_pds || '';
            document.getElementById('ot-edit-programa').value = ot.programa || '';
            document.getElementById('ot-edit-front-negocio').value = ot.front_negocio || '';
            document.getElementById('ot-edit-fts').value = ot.fts || '';
            document.getElementById('ot-edit-autorizacion-rdp').value = ot.autorizacion_rdp || '';
            document.getElementById('ot-edit-vobo-front').value = ot.vobo_front_negocio || '';
            document.getElementById('ot-edit-fecha-vobo-front').value = formatDateForInput(ot.fecha_vobo_front_negocio);
            document.getElementById('ot-edit-estimacion-pruebas').value = ot.estimacion_elab_pruebas || '';
            
            modal.style.display = 'flex';
        } catch (err) {
            console.error('Error loading OT for edit:', err);
            Swal.fire({ icon: 'error', title: 'Error al cargar OT', text: err.message });
        }
    };

    // Formatear fecha para input date (YYYY-MM-DD)
    function formatDateForInput(dateValue) {
        if (!dateValue) return '';
        try {
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
        } catch (err) {
            return '';
        }
    }

    // Cerrar modal de edición
    async function closeOTEditModal(skipConfirmation = false) {
        const modal = document.getElementById('ot-edit-modal');
        if (!modal) return;
        
        // Mostrar confirmación solo si no se solicita omitirla
        if (!skipConfirmation) {
            const result = await Swal.fire({
                title: '¿Cancelar edición de OT?',
                text: 'Se perderán los cambios no guardados',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, cerrar',
                cancelButtonText: 'Continuar editando',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280'
            });
            
            if (!result.isConfirmed) {
                return; // Usuario decidió continuar editando
            }
        }
        
        // Cerrar modal y resetear formulario
        modal.style.display = 'none';
        const form = document.getElementById('ot-edit-form');
        if (form) form.reset();
        
        console.log('✅ Modal de edición de OT cerrado');
    }

    // Event listeners para el modal de edición de OT usando event delegation con capture phase
    // Botón cerrar modal (X)
    document.addEventListener('click', async function(e) {
        if (e.target && e.target.id === 'ot-edit-modal-close') {
            e.preventDefault();
            e.stopPropagation();
            await closeOTEditModal(); // Con confirmación
        }
    }, true);

    // Botón cancelar
    document.addEventListener('click', async function(e) {
        if (e.target && e.target.id === 'ot-edit-cancel') {
            e.preventDefault();
            e.stopPropagation();
            await closeOTEditModal(); // Con confirmación
        }
    }, true);

    // Cerrar al hacer click fuera del modal
    document.addEventListener('click', async function(e) {
        const modal = document.getElementById('ot-edit-modal');
        if (e.target === modal) {
            await closeOTEditModal(); // Con confirmación
        }
    }, true);

    // Submit del formulario de edición usando event delegation
    document.addEventListener('submit', async function(e) {
        // Solo capturar submit del formulario de edición de OT
        if (e.target && e.target.id === 'ot-edit-form') {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔒 Formulario OT edit submit capturado');
            
            const otId = document.getElementById('ot-edit-id').value;
            if (!otId) {
                Swal.fire({ icon: 'error', title: 'ID de OT no encontrado' });
                return false;
            }
            
            // Construir objeto con los datos actualizados
            // NOTA: nombre_proyecto, responsable_proyecto, cbt_responsable NO se actualizan aquí
            // Estos campos vienen de la tabla projects a través de la relación M:N
            const updates = {
                ot_code: document.getElementById('ot-edit-code').value.trim(),
                status: document.getElementById('ot-edit-status').value,
                description: document.getElementById('ot-edit-description').value.trim(),
                
                // Folios
                folio_principal_santec: document.getElementById('ot-edit-folio-principal').value.trim() || null,
                folio_santec: document.getElementById('ot-edit-folio-santec').value.trim() || null,
                tipo_servicio: document.getElementById('ot-edit-tipo-servicio').value.trim() || null,
                tecnologia: document.getElementById('ot-edit-tecnologia').value.trim() || null,
                aplicativo: document.getElementById('ot-edit-aplicativo').value.trim() || null,
                
                // Fechas
                fecha_inicio_santander: document.getElementById('ot-edit-fecha-inicio-santander').value || null,
                fecha_fin_santander: document.getElementById('ot-edit-fecha-fin-santander').value || null,
                fecha_entrega_proveedor: document.getElementById('ot-edit-fecha-entrega-proveedor').value || null,
                fecha_inicio_proveedor: document.getElementById('ot-edit-fecha-inicio-proveedor').value || null,
                fecha_fin_proveedor: document.getElementById('ot-edit-fecha-fin-proveedor').value || null,
                dias_desvio_entrega: document.getElementById('ot-edit-dias-desvio').value || null,
                fecha_inicio_real: document.getElementById('ot-edit-fecha-inicio-real').value || null,
                fecha_fin_real: document.getElementById('ot-edit-fecha-fin-real').value || null,
                fecha_creacion: document.getElementById('ot-edit-fecha-creacion').value || null,
                
                // Responsables
                lider_delivery: document.getElementById('ot-edit-lider-delivery').value.trim() || null,
                proveedor: document.getElementById('ot-edit-proveedor').value.trim() || null,
                
                // Montos e indicadores
                horas_acordadas: document.getElementById('ot-edit-horas-acordadas').value || null,
                horas: document.getElementById('ot-edit-horas').value || null,
                costo_hora_servicio_proveedor: document.getElementById('ot-edit-costo-hora').value || null,
                costo_ot: document.getElementById('ot-edit-costo-ot').value || null,
                monto_servicio_proveedor: document.getElementById('ot-edit-monto-servicio').value || null,
                monto_servicio_proveedor_iva: document.getElementById('ot-edit-monto-iva').value || null,
                porcentaje_ejecucion: document.getElementById('ot-edit-porcentaje').value || null,
                semaforo_esfuerzo: document.getElementById('ot-edit-semaforo-esfuerzo').value || null,
                semaforo_plazo: document.getElementById('ot-edit-semaforo-plazo').value || null,
                
                // Información adicional
                ambiente: document.getElementById('ot-edit-ambiente').value.trim() || null,
                clase_coste: document.getElementById('ot-edit-clase-coste').value.trim() || null,
                folio_pds: document.getElementById('ot-edit-folio-pds').value.trim() || null,
                programa: document.getElementById('ot-edit-programa').value.trim() || null,
                front_negocio: document.getElementById('ot-edit-front-negocio').value.trim() || null,
                fts: document.getElementById('ot-edit-fts').value.trim() || null,
                autorizacion_rdp: document.getElementById('ot-edit-autorizacion-rdp').value.trim() || null,
                vobo_front_negocio: document.getElementById('ot-edit-vobo-front').value.trim() || null,
                fecha_vobo_front_negocio: document.getElementById('ot-edit-fecha-vobo-front').value || null,
                estimacion_elab_pruebas: document.getElementById('ot-edit-estimacion-pruebas').value.trim() || null
            };
            
            try {
                // Deshabilitar botón de submit
                const submitBtn = document.getElementById('ot-edit-submit');
                submitBtn.disabled = true;
                submitBtn.textContent = '⏳ Guardando...';
                
                const response = await fetch(
                    window.getApiUrl ? window.getApiUrl(`/api/orders-of-work/${otId}`) : `/api/orders-of-work/${otId}`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updates)
                    }
                );
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error al actualizar OT');
                }
                
                const updatedOT = await response.json();
                
                // Mostrar confirmación con información de la OT actualizada
                await Swal.fire({ 
                        icon: 'success', 
                        title: '✅ OT Actualizada Exitosamente',
                        html: `
                            <div style="text-align:left;padding:10px;">
                                <p style="margin:8px 0;font-size:15px;color:#1f2937;">
                                    <strong>📋 Código:</strong> ${updates.ot_code}
                                </p>
                                <p style="margin:8px 0;font-size:15px;color:#1f2937;">
                                    <strong>📊 Estado:</strong> <span style="color:#059669;font-weight:600">${updates.status}</span>
                                </p>
                                ${updates.description ? `
                                    <p style="margin:8px 0;font-size:15px;color:#1f2937;">
                                        <strong>📝 Descripción:</strong> ${updates.description.substring(0, 50)}${updates.description.length > 50 ? '...' : ''}
                                    </p>
                                ` : ''}
                                <p style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
                                    Los cambios han sido guardados correctamente en la base de datos
                                </p>
                            </div>
                        `,
                        confirmButtonText: 'Entendido',
                        confirmButtonColor: '#3b82f6',
                        timer: 4000,
                        timerProgressBar: true
                    });
                    
                    closeOTEditModal(true); // true = omitir confirmación
                    
                    // Recargar datos para asegurar que se muestren los cambios
                    await window.loadOrdersOfWork();
                    console.log('✅ OT actualizada y datos recargados:', updatedOT);
                    
                } catch (err) {
                    console.error('Error updating OT:', err);
                    await Swal.fire({ 
                        icon: 'error', 
                        title: '❌ Error al Guardar Cambios', 
                        html: `
                            <div style="text-align:left;padding:10px;">
                                <p style="margin:8px 0;font-size:15px;color:#dc2626;">
                                    ${err.message}
                                </p>
                                <p style="margin-top:16px;padding-top:12px;border-top:1px solid #fee;font-size:13px;color:#6b7280;">
                                    Por favor, verifica los datos e inténtalo nuevamente
                                </p>
                            </div>
                        `,
                        confirmButtonText: 'Entendido',
                        confirmButtonColor: '#dc2626'
                    });
                    
                    // Re-habilitar botón
                    const submitBtn = document.getElementById('ot-edit-submit');
                    submitBtn.disabled = false;
                    submitBtn.textContent = '💾 Guardar Cambios';
                }
                
                return false;
            }
        }, true); // Usar capture phase para interceptar antes que otros handlers

    // OPCIÓN 3: Filtrado combinado (Filtros manuales + DataTables)
    // Los filtros manuales reducen el conjunto de datos, DataTables permite búsqueda dentro de los resultados
    const filterOTCode = document.getElementById('filter-ot-code');
    const filterOTProject = document.getElementById('filter-ot-project');
    const filterOTStatus = document.getElementById('filter-ot-status');
    const filterOTClearBtn = document.getElementById('filter-ot-clear-btn');
    const filterOTResults = document.getElementById('filter-ot-results');
    
    // Auto-aplicar filtros cuando cambian los valores (sin necesidad de botón Buscar)
    if (filterOTCode) {
        filterOTCode.addEventListener('input', debounce(applyOTFilters, 500)); // Esperar 500ms después de última tecla
    }
    
    if (filterOTProject) {
        filterOTProject.addEventListener('change', applyOTFilters);
    }
    
    if (filterOTStatus) {
        filterOTStatus.addEventListener('change', applyOTFilters);
    }
    
    if (filterOTClearBtn) {
        filterOTClearBtn.addEventListener('click', clearOTFilters);
    }
    
    // Función debounce para evitar múltiples llamadas rápidas
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Función para normalizar texto (eliminar acentos y convertir a minúsculas)
    function normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos (acentos)
            .trim();
    }

    function applyOTFilters() {
        const otCode = filterOTCode?.value.toLowerCase().trim() || '';
        const projectId = filterOTProject?.value || '';
        const status = filterOTStatus?.value || '';
        
        // Detectar si hay filtros activos
        const hasActiveFilters = otCode || projectId || status;
        
        // Normalizar el status del filtro para comparación flexible
        const normalizedFilterStatus = normalizeText(status);
        
        // Filtrar los datos originales
        filteredOrdersOfWork = allOrdersOfWork.filter(ot => {
            const matchesCode = !otCode || (ot.ot_code && ot.ot_code.toLowerCase().includes(otCode));
            const matchesProject = !projectId || ot.project_id == projectId;
            // Comparar estados normalizados (sin acentos, case-insensitive)
            const matchesStatus = !status || normalizeText(ot.status) === normalizedFilterStatus;
            
            return matchesCode && matchesProject && matchesStatus;
        });
        
        // Actualizar indicador de resultados
        window.updateFilterResultsIndicator(hasActiveFilters);
        
        // Re-renderizar con los datos filtrados
        renderOrdersOfWork();
        
        if (hasActiveFilters) {
            console.log(`🔍 Filtros activos: ${filteredOrdersOfWork.length} de ${allOrdersOfWork.length} OTs`);
        }
    }

    function clearOTFilters() {
        if (filterOTCode) filterOTCode.value = '';
        if (filterOTProject) filterOTProject.value = '';
        if (filterOTStatus) filterOTStatus.value = '';
        
        // Restaurar todos los datos
        filteredOrdersOfWork = [...allOrdersOfWork];
        
        // Limpiar indicador
        window.updateFilterResultsIndicator(false);
        
        renderOrdersOfWork();
        
        console.log('🔄 Filtros limpiados, mostrando todas las OTs');
    }
    
    // Función global para actualizar indicador de resultados
    window.updateFilterResultsIndicator = function(hasFilters) {
        const filterOTResults = document.getElementById('filter-ot-results');
        if (!filterOTResults) return;
        
        // Solo mostrar si hay datos
        if (allOrdersOfWork.length === 0) {
            filterOTResults.style.display = 'none';
            return;
        }
        
        if (hasFilters) {
            const percentage = allOrdersOfWork.length > 0 
                ? Math.round((filteredOrdersOfWork.length / allOrdersOfWork.length) * 100)
                : 0;
            
            filterOTResults.innerHTML = `
                🔍 <span style="font-weight:bold;">${filteredOrdersOfWork.length}</span> 
                de 
                <span style="font-weight:bold;">${allOrdersOfWork.length}</span> 
                OTs 
                <span style="display:inline-block;padding:2px 6px;background:#0369a1;color:white;border-radius:3px;font-size:11px;margin-left:4px;">${percentage}%</span>
            `;
            filterOTResults.style.display = 'inline-block';
        } else {
            filterOTResults.innerHTML = `
                📊 <span style="font-weight:bold;">${allOrdersOfWork.length}</span> OTs en total
            `;
            filterOTResults.style.display = 'inline-block';
        }
    };

    // Agregar estilos para badges si no existen
    if (!document.getElementById('ot-badge-styles')) {
        const style = document.createElement('style');
        style.id = 'ot-badge-styles';
        style.textContent = `
            .badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            }
            .badge-success { background: #d4edda; color: #155724; }
            .badge-warning { background: #fff3cd; color: #856404; }
            .badge-info { background: #d1ecf1; color: #0c5460; }
            .badge-danger { background: #f8d7da; color: #721c24; }
            .badge-secondary { background: #e2e3e5; color: #383d41; }
            .btn-icon {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                padding: 4px 8px;
                transition: transform 0.2s;
            }
            .btn-icon:hover {
                transform: scale(1.2);
            }
        `;
        document.head.appendChild(style);
    }
    
    // ============ EVENT DELEGATION GLOBAL PARA BOTÓN AGREGAR CONTACTO ============
    // Event delegation global como último respaldo (dentro de DOMContentLoaded para acceso al scope)
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // Verificar si el click fue en el botón o dentro de él
        if (target && (target.id === 'add-commercial-contact' || target.closest('#add-commercial-contact'))) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 [GLOBAL DELEGATION] Botón Agregar Contacto clickeado');
            
            // Llamar a la función
            if (typeof addCommercialContactFromForm === 'function') {
                addCommercialContactFromForm();
            } else {
                console.error('❌ Función addCommercialContactFromForm no está definida');
            }
            
            return false;
        }
    }, true); // Usar capture phase para mayor prioridad
});

