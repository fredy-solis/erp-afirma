// reports.js - Gestión de Reportes y Análisis

let currentReportData = {};

// Función helper para formatear fechas de forma segura
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('es-MX', {year: '2-digit', month: '2-digit', day: '2-digit'});
    } catch (e) {
        return '-';
    }
}

// Función helper para valores numéricos
function formatNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
}

// Cargar resumen general
async function loadReportsSummary() {
    try {
        const response = await fetch(window.getApiUrl('/api/reports/assignment-summary'));
        if (!response.ok) throw new Error('Error al cargar resumen');
        
        const data = await response.json();
        const summary = data.summary || {};
        
        // Actualizar cards de resumen
        document.getElementById('summary-active-employees').textContent = formatNumber(summary.total_active_employees, 0);
        document.getElementById('summary-active-projects').textContent = formatNumber(summary.total_active_projects, 0);
        document.getElementById('summary-assigned-employees').textContent = formatNumber(summary.employees_with_active_assignments, 0);
        document.getElementById('summary-bench-employees').textContent = formatNumber(summary.employees_in_bench, 0);
        document.getElementById('summary-projects-with-assignments').textContent = formatNumber(summary.projects_with_active_assignments, 0);
        document.getElementById('summary-total-hours').textContent = formatNumber(summary.total_active_hours, 0);
        
        // Guardar datos de top projects y resources
        currentReportData.topProjects = data.top_projects || [];
        currentReportData.topResources = data.top_resources || [];
        
        // Renderizar tops inicialmente
        renderTopProjects();
        renderTopResources();
        
    } catch (err) {
        console.error('Error loading reports summary:', err);
    }
}

// Cargar reporte de recursos por proyecto
async function loadResourcesByProject() {
    const loadingEl = document.getElementById('resources-by-project-loading');
    const containerEl = document.getElementById('resources-by-project-container');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (containerEl) containerEl.innerHTML = '';
    
    try {
        const response = await fetch(window.getApiUrl('/api/reports/resources-by-project'));
        if (!response.ok) throw new Error('Error al cargar reporte');
        
        const projects = await response.json();
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (projects.length === 0) {
            if (containerEl) {
                containerEl.innerHTML = `
                    <div style="text-align:center;padding:40px;color:#999">
                        <div style="font-size:48px">📊</div>
                        <div style="font-size:18px">No hay datos disponibles</div>
                    </div>
                `;
            }
            return;
        }
        
        // Renderizar proyectos con sus recursos
        if (containerEl) {
            containerEl.innerHTML = projects.map(project => {
                const resources = project.resources || [];
                const activeResources = resources.filter(r => r.is_active);
                
                return `
                    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px">
                        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px">
                            <div>
                                <h3 style="margin:0 0 8px 0;color:#1f2937">${project.project_name}</h3>
                                <span style="padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;
                                    ${project.project_status === 'En Progreso' ? 'background:#d4edda;color:#155724' : 'background:#f8d7da;color:#721c24'}">
                                    ${project.project_status || 'Sin estado'}
                                </span>
                            </div>
                            <div style="text-align:right">
                                <div style="font-size:24px;font-weight:bold;color:#007bff">${formatNumber(project.active_resources, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Recursos Activos</div>
                            </div>
                        </div>
                        
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px">
                            <div>
                                <div style="font-size:18px;font-weight:bold;color:#6c757d">${formatNumber(project.total_resources, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Total Recursos</div>
                            </div>
                            <div>
                                <div style="font-size:18px;font-weight:bold;color:#28a745">${formatNumber(project.active_resources, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Activos</div>
                            </div>
                            <div>
                                <div style="font-size:18px;font-weight:bold;color:#17a2b8">${formatNumber(project.total_active_hours, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Horas Activas</div>
                            </div>
                        </div>
                        
                        ${resources.length > 0 ? `
                            <table style="width:100%;border-collapse:collapse">
                                <thead>
                                    <tr style="background:#f8f9fa;text-align:left">
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">👤 Empleado</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">💼 Puesto</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">🎯 Rol</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">📅 Fechas</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">⏰ Horas</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">📊 Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${resources.map(r => `
                                        <tr style="border-bottom:1px solid #e5e7eb">
                                            <td style="padding:8px">${r.employee_name || '-'}</td>
                                            <td style="padding:8px">${r.position || '-'}</td>
                                            <td style="padding:8px">${r.role || '-'}</td>
                                            <td style="padding:8px;font-size:12px">
                                                ${formatDate(r.start_date)} → ${r.end_date ? formatDate(r.end_date) : '∞'}
                                            </td>
                                            <td style="padding:8px">${formatNumber(r.hours_allocated, '-')}</td>
                                            <td style="padding:8px">
                                                <span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:500;
                                                    ${r.is_active ? 'background:#d4edda;color:#155724' : 'background:#f8d7da;color:#721c24'}">
                                                    ${r.is_active ? 'Activo' : 'Finalizado'}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div style="text-align:center;padding:20px;color:#999">
                                <div>No hay recursos asignados</div>
                            </div>
                        `}
                    </div>
                `;
            }).join('');
        }
        
    } catch (err) {
        console.error('Error loading resources by project:', err);
        if (loadingEl) loadingEl.style.display = 'none';
        if (containerEl) {
            containerEl.innerHTML = `
                <div style="text-align:center;padding:40px;color:#dc3545">
                    <div style="font-size:48px">⚠️</div>
                    <div style="font-size:18px">Error al cargar reporte</div>
                    <div style="font-size:14px">${err.message}</div>
                </div>
            `;
        }
    }
}

// Cargar reporte de proyectos por recurso
async function loadProjectsByResource() {
    const loadingEl = document.getElementById('projects-by-resource-loading');
    const containerEl = document.getElementById('projects-by-resource-container');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (containerEl) containerEl.innerHTML = '';
    
    try {
        const response = await fetch(window.getApiUrl('/api/reports/projects-by-resource'));
        if (!response.ok) throw new Error('Error al cargar reporte');
        
        const employees = await response.json();
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (employees.length === 0) {
            if (containerEl) {
                containerEl.innerHTML = `
                    <div style="text-align:center;padding:40px;color:#999">
                        <div style="font-size:48px">📊</div>
                        <div style="font-size:18px">No hay datos disponibles</div>
                    </div>
                `;
            }
            return;
        }
        
        // Renderizar empleados con sus proyectos
        if (containerEl) {
            containerEl.innerHTML = employees.map(employee => {
                const projects = employee.projects || [];
                const activeProjects = projects.filter(p => p.is_active);
                
                return `
                    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px">
                        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px">
                            <div>
                                <h3 style="margin:0 0 8px 0;color:#1f2937">${employee.employee_name}</h3>
                                <div style="font-size:14px;color:#6b7280">
                                    ${employee.position || 'Sin puesto'} • ${employee.area || 'Sin área'} • ${employee.entity || 'Sin entidad'}
                                </div>
                            </div>
                            <div style="text-align:right">
                                <div style="font-size:24px;font-weight:bold;color:#007bff">${formatNumber(employee.active_projects, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Proyectos Activos</div>
                            </div>
                        </div>
                        
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px">
                            <div>
                                <div style="font-size:18px;font-weight:bold;color:#6c757d">${formatNumber(employee.total_projects, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Total Proyectos</div>
                            </div>
                            <div>
                                <div style="font-size:18px;font-weight:bold;color:#28a745">${formatNumber(employee.active_projects, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Activos</div>
                            </div>
                            <div>
                                <div style="font-size:18px;font-weight:bold;color:#17a2b8">${formatNumber(employee.total_active_hours, 0)}</div>
                                <div style="font-size:12px;color:#6b7280">Horas Activas</div>
                            </div>
                        </div>
                        
                        ${projects.length > 0 ? `
                            <table style="width:100%;border-collapse:collapse">
                                <thead>
                                    <tr style="background:#f8f9fa;text-align:left">
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">📋 Proyecto</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">🎯 Rol</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">📅 Fechas</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">⏰ Horas</th>
                                        <th style="padding:8px;border-bottom:2px solid #e5e7eb">📊 Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${projects.map(p => `
                                        <tr style="border-bottom:1px solid #e5e7eb">
                                            <td style="padding:8px">
                                                <div style="font-weight:500">${p.project_name || '-'}</div>
                                                <div style="font-size:11px;color:#6b7280">${p.project_status || ''}</div>
                                            </td>
                                            <td style="padding:8px">${p.role || '-'}</td>
                                            <td style="padding:8px;font-size:12px">
                                                ${formatDate(p.start_date)} → ${p.end_date ? formatDate(p.end_date) : '∞'}
                                            </td>
                                            <td style="padding:8px">${formatNumber(p.hours_allocated, '-')}</td>
                                            <td style="padding:8px">
                                                <span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:500;
                                                    ${p.is_active ? 'background:#d4edda;color:#155724' : 'background:#f8d7da;color:#721c24'}">
                                                    ${p.is_active ? 'Activo' : 'Finalizado'}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div style="text-align:center;padding:20px;color:#999">
                                <div>No tiene proyectos asignados</div>
                            </div>
                        `}
                    </div>
                `;
            }).join('');
        }
        
    } catch (err) {
        console.error('Error loading projects by resource:', err);
        if (loadingEl) loadingEl.style.display = 'none';
        if (containerEl) {
            containerEl.innerHTML = `
                <div style="text-align:center;padding:40px;color:#dc3545">
                    <div style="font-size:48px">⚠️</div>
                    <div style="font-size:18px">Error al cargar reporte</div>
                    <div style="font-size:14px">${err.message}</div>
                </div>
            `;
        }
    }
}

// Renderizar top proyectos
function renderTopProjects() {
    const tbody = document.getElementById('top-projects-tbody');
    if (!tbody) return;
    
    const projects = currentReportData.topProjects || [];
    
    if (projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center;padding:20px;color:#999">No hay datos disponibles</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = projects.map((project, index) => `
        <tr>
            <td style="text-align:center">
                <span style="font-size:20px">
                    ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                </span>
            </td>
            <td>${project.name || 'Sin nombre'}</td>
            <td style="text-align:center">
                <span style="font-size:18px;font-weight:bold;color:#007bff">${formatNumber(project.resource_count, 0)}</span>
            </td>
        </tr>
    `).join('');
}

// Renderizar top recursos
function renderTopResources() {
    const tbody = document.getElementById('top-resources-tbody');
    if (!tbody) return;
    
    const resources = currentReportData.topResources || [];
    
    if (resources.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:20px;color:#999">No hay datos disponibles</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = resources.map((resource, index) => `
        <tr>
            <td style="text-align:center">
                <span style="font-size:20px">
                    ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                </span>
            </td>
            <td>${resource.employee_name || 'Sin nombre'}</td>
            <td style="text-align:center">
                <span style="font-size:16px;font-weight:500;color:#6c757d">${formatNumber(resource.project_count, 0)}</span>
            </td>
            <td style="text-align:center">
                <span style="font-size:16px;font-weight:500;color:#17a2b8">${formatNumber(resource.total_hours, 0)}</span>
            </td>
        </tr>
    `).join('');
}

// Cambiar tab de reporte
function switchReportTab(tabName, event) {
    console.log('Switching to tab:', tabName);
    
    // Ocultar todos los tabs
    document.querySelectorAll('#reportes .tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    // Desactivar todos los botones
    document.querySelectorAll('#reportes .tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Activar tab seleccionado
    const activeTab = document.getElementById(`report-tab-${tabName}`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.display = 'block';
        console.log('Tab activated:', activeTab.id);
    } else {
        console.error('Tab not found:', `report-tab-${tabName}`);
    }
    
    // Activar botón
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: encontrar el botón por el nombre del tab
        const buttons = document.querySelectorAll('#reportes .tab-button');
        buttons.forEach(button => {
            const onclick = button.getAttribute('onclick');
            if (onclick && onclick.includes(`'${tabName}'`)) {
                button.classList.add('active');
            }
        });
    }
    
    // Cargar datos cada vez que se hace clic en la pestaña
    if (tabName === 'resources-by-project') {
        loadResourcesByProject();
    } else if (tabName === 'projects-by-resource') {
        loadProjectsByResource();
    } else if (tabName === 'top-projects') {
        renderTopProjects();
    } else if (tabName === 'top-resources') {
        renderTopResources();
    }
}

// Cargar todos los reportes
async function loadAllReports() {
    await loadReportsSummary();
    await loadResourcesByProject(); // Cargar el primer tab por defecto
}

// Exportar reportes (placeholder)
function exportReports() {
    alert('Funcionalidad de exportación en desarrollo. Se exportará a Excel en próxima versión.');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-reports-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAllReports);
    }
    
    const exportBtn = document.getElementById('export-reports-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportReports);
    }
});

// Exponer funciones
window.loadAllReports = loadAllReports;
window.switchReportTab = switchReportTab;
window.loadResourcesByProject = loadResourcesByProject;
window.loadProjectsByResource = loadProjectsByResource;
