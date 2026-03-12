// celulas.js - Gestión de Células

let currentCelulas = [];

// Cargar células con proyectos y OTs
async function loadCelulas(filters = {}) {
    const loadingEl = document.getElementById('celula-grid-loading');
    const tableEl = document.getElementById('celula-table');
    const emptyEl = document.getElementById('celula-grid-empty');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    
    try {
        // Cargar células con sus relaciones
        const response = await fetch(window.getApiUrl('/api/celulas-with-relations'));
        if (!response.ok) throw new Error('Error al cargar células');
        
        currentCelulas = await response.json();
        
        // Aplicar filtros
        let filteredCelulas = currentCelulas;
        
        if (filters.name) {
            const searchTerm = filters.name.toLowerCase();
            filteredCelulas = filteredCelulas.filter(c => 
                c.name && c.name.toLowerCase().includes(searchTerm)
            );
        }
        
        if (loadingEl) loadingEl.style.display = 'none';
        
        if (filteredCelulas.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            renderCelulasTable(filteredCelulas);
            if (tableEl) tableEl.style.display = 'table';
        }
        
    } catch (err) {
        console.error('Error loading celulas:', err);
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = `
                <div style="font-size:48px;margin-bottom:10px">⚠️</div>
                <div style="font-size:18px;margin-bottom:5px;color:#dc3545">Error al cargar células</div>
                <div style="font-size:14px;color:#6c757d">${err.message}</div>
            `;
        }
    }
}

// Renderizar tabla de células
function renderCelulasTable(celulas) {
    const tbody = document.getElementById('celula-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = celulas.map(celula => {
        // Formatear proyectos
        const proyectos = celula.proyectos || [];
        const proyectosHtml = proyectos.length > 0 
            ? proyectos.slice(0, 3).map(p => `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;margin:2px;font-size:11px">${p}</span>`).join('')
            : '<span style="color:#999">Sin proyectos</span>';
        
        const proyectosExtra = proyectos.length > 3 
            ? `<span style="color:#6b7280;font-size:11px">+${proyectos.length - 3} más</span>` 
            : '';
        
        // Formatear OTs
        const ots = celula.ots || [];
        const otsHtml = ots.length > 0
            ? ots.slice(0, 3).map(ot => `<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;margin:2px;font-size:11px">${ot}</span>`).join('')
            : '<span style="color:#999">Sin OTs</span>';
        
        const otsExtra = ots.length > 3
            ? `<span style="color:#6b7280;font-size:11px">+${ots.length - 3} más</span>`
            : '';
        
        return `
            <tr>
                <td>${celula.id}</td>
                <td>
                    <div style="font-weight:600;color:#1f2937">${celula.name || 'Sin nombre'}</div>
                </td>
                <td>
                    <div style="max-width:300px">
                        ${proyectosHtml}
                        ${proyectosExtra}
                    </div>
                    <div style="margin-top:4px;font-size:12px;color:#6b7280">
                        Total: ${proyectos.length} proyecto(s)
                    </div>
                </td>
                <td>
                    <div style="max-width:300px">
                        ${otsHtml}
                        ${otsExtra}
                    </div>
                    <div style="margin-top:4px;font-size:12px;color:#6b7280">
                        Total: ${ots.length} OT(s)
                    </div>
                </td>
                <td>
                    <span style="background:#dbeafe;color:#1e40af;padding:4px 12px;border-radius:12px;font-weight:600;font-size:13px">
                        ${celula.employees_count || 0}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;justify-content:center">
                        <button class="view-celula btn-action-view" data-id="${celula.id}" title="Ver detalles">
                            👁️
                        </button>
                        <button class="edit-celula btn-action-edit" data-id="${celula.id}" title="Editar">
                            ✏️
                        </button>
                        <button class="delete-celula btn-action-delete" data-id="${celula.id}" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Abrir modal para agregar célula
async function openAddCelulaModal() {
    const { value: newName } = await Swal.fire({
        title: 'Nueva Célula',
        input: 'text',
        inputLabel: 'Nombre de la célula',
        inputPlaceholder: 'Ingresa el nombre',
        showCancelButton: true,
        confirmButtonText: 'Crear',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value) {
                return 'El nombre es requerido';
            }
        }
    });
    
    if (newName) {
        try {
            const response = await fetch(window.getApiUrl('/api/mastercode/Celulas'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            
            if (!response.ok) throw new Error('Error al crear célula');
            
            Swal.fire({
                icon: 'success',
                title: 'Célula creada',
                text: 'La célula se creó correctamente',
                timer: 2000,
                showConfirmButton: false
            });
            
            loadCelulas();
        } catch (err) {
            console.error('Error creating celula:', err);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo crear la célula: ' + err.message
            });
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Botón agregar célula
    const addBtn = document.getElementById('add-celula-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openAddCelulaModal);
    }
    
    // Botón buscar
    const searchBtn = document.getElementById('filter-celula-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const name = document.getElementById('filter-celula-name')?.value || '';
            loadCelulas({ name });
        });
    }
    
    // Botón limpiar
    const clearBtn = document.getElementById('filter-celula-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('filter-celula-name');
            if (nameInput) nameInput.value = '';
            loadCelulas();
        });
    }
    
    // Delegación de eventos para botones de acción
    const tbody = document.getElementById('celula-table-body');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const viewBtn = e.target.closest('.view-celula');
            const editBtn = e.target.closest('.edit-celula');
            const deleteBtn = e.target.closest('.delete-celula');
            
            if (viewBtn) {
                const id = viewBtn.dataset.id;
                await viewCelulaDetails(id);
            } else if (editBtn) {
                const id = editBtn.dataset.id;
                await editCelula(id);
            } else if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                await deleteCelula(id);
            }
        });
    }
});

// Ver detalles de una célula
async function viewCelulaDetails(id) {
    const celula = currentCelulas.find(c => String(c.id) === String(id));
    if (!celula) {
        alert('Célula no encontrada');
        return;
    }
    
    const proyectos = celula.proyectos || [];
    const ots = celula.ots || [];
    
    const html = `
        <div style="padding:20px">
            <h3 style="margin:0 0 16px 0;color:#1f2937">📊 Detalles de Célula</h3>
            
            <div style="margin-bottom:20px">
                <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Nombre:</div>
                <div style="font-size:18px;font-weight:600;color:#1f2937">${celula.name}</div>
            </div>
            
            <div style="margin-bottom:20px">
                <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Proyectos Asociados (${proyectos.length}):</div>
                ${proyectos.length > 0 
                    ? proyectos.map(p => `<div style="padding:8px;background:#f3f4f6;border-radius:6px;margin-bottom:4px">📋 ${p}</div>`).join('')
                    : '<div style="color:#999;font-style:italic">Sin proyectos asociados</div>'
                }
            </div>
            
            <div style="margin-bottom:20px">
                <div style="font-size:12px;color:#6b7280;margin-bottom:8px">OTs Asociadas (${ots.length}):</div>
                ${ots.length > 0
                    ? ots.map(ot => `<div style="padding:8px;background:#fef3c7;border-radius:6px;margin-bottom:4px">📦 ${ot}</div>`).join('')
                    : '<div style="color:#999;font-style:italic">Sin OTs asociadas</div>'
                }
            </div>
            
            <div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Empleados Asignados:</div>
                <div style="font-size:24px;font-weight:600;color:#3b82f6">${celula.employees_count || 0}</div>
            </div>
        </div>
    `;
    
    Swal.fire({
        html: html,
        width: 600,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar'
    });
}

// Editar célula
async function editCelula(id) {
    const celula = currentCelulas.find(c => String(c.id) === String(id));
    if (!celula) {
        alert('Célula no encontrada');
        return;
    }
    
    const { value: newName } = await Swal.fire({
        title: 'Editar Célula',
        input: 'text',
        inputValue: celula.name,
        inputLabel: 'Nombre de la célula',
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value) {
                return 'El nombre es requerido';
            }
        }
    });
    
    if (newName) {
        try {
            const response = await fetch(window.getApiUrl(`/api/mastercode/Celulas/${id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            
            if (!response.ok) throw new Error('Error al actualizar célula');
            
            Swal.fire({
                icon: 'success',
                title: 'Célula actualizada',
                text: 'La célula se actualizó correctamente',
                timer: 2000,
                showConfirmButton: false
            });
            
            loadCelulas();
        } catch (err) {
            console.error('Error updating celula:', err);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo actualizar la célula: ' + err.message
            });
        }
    }
}

// Eliminar célula
async function deleteCelula(id) {
    const celula = currentCelulas.find(c => String(c.id) === String(id));
    if (!celula) {
        alert('Célula no encontrada');
        return;
    }
    
    // Verificar si tiene proyectos o OTs asignadas
    const proyectos = celula.proyectos || [];
    const ots = celula.ots || [];
    const hasAssignments = proyectos.length > 0 || ots.length > 0;
    
    let warningHtml = `<p>¿Estás seguro de eliminar la célula "<strong>${celula.name}</strong>"?</p>`;
    
    if (hasAssignments) {
        warningHtml += `
            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px;margin:12px 0;text-align:left">
                <div style="color:#856404;font-weight:600;margin-bottom:8px">⚠️ ADVERTENCIA</div>
                ${proyectos.length > 0 ? `<div style="color:#856404;font-size:13px">• ${proyectos.length} proyecto(s) asociado(s) se desvinculará(n)</div>` : ''}
                ${ots.length > 0 ? `<div style="color:#856404;font-size:13px">• ${ots.length} OT(s) se desasignará(n) y quedarán disponibles para otras células</div>` : ''}
            </div>
        `;
    }
    
    warningHtml += '<p style="color:#dc3545;font-size:14px;margin-top:12px">⚠️ Esta acción no se puede deshacer</p>';
    
    const result = await Swal.fire({
        title: '¿Eliminar célula?',
        html: warningHtml,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6'
    });
    
    if (!result.isConfirmed) return;
    
    try {
        // Si tiene OTs, primero desasignarlas
        if (ots.length > 0) {
            // Desasignar proyectos de esta célula (celula_id = NULL en projects)
            const unassignResponse = await fetch(window.getApiUrl(`/api/celulas/${id}/unassign-projects`), {
                method: 'POST'
            });
            
            if (!unassignResponse.ok) {
                console.warn('Warning: Could not unassign projects');
            }
        }
        
        // Eliminar la célula
        const response = await fetch(window.getApiUrl(`/api/mastercode/Celulas/${id}`), {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Error al eliminar célula');
        
        Swal.fire({
            icon: 'success',
            title: 'Célula eliminada',
            text: hasAssignments ? 'La célula se eliminó y sus asignaciones se desvincularon' : 'La célula se eliminó correctamente',
            timer: 2500,
            showConfirmButton: false
        });
        
        loadCelulas();
    } catch (err) {
        console.error('Error deleting celula:', err);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo eliminar la célula: ' + err.message
        });
    }
}

// Exponer funciones globalmente
window.loadCelulas = loadCelulas;
window.viewCelulaDetails = viewCelulaDetails;
window.editCelula = editCelula;
window.deleteCelula = deleteCelula;
