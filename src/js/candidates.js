function renderCandidates(candidates) {
    const candidateList = document.getElementById('candidate-list');
    candidateList.innerHTML = '';

    if (candidates.length === 0) {
        candidateList.innerHTML = '<li style="text-align:center;color:#72809a;padding:20px">Sin candidatos</li>';
        return;
    }

    candidates.forEach(candidate => {
        console.log('👤 Renderizando candidato:', candidate);
        
        const fullName = ((candidate.first_name || '') + (candidate.last_name ? ' ' + candidate.last_name : '')).trim();
        const statusColor = {
            'En revisión': '#0066ff',
            'Entrevista': '#ff9900',
            'Oferta': '#28a745',
            'Rechazado': '#dc3545',
            'Contratado': '#20c997'
        }[candidate.status] || '#72809a';
        
        // Solo mostrar reclutador si el candidato fue CONTRATADO
        const recruiterBadge = candidate.status === 'Contratado' && candidate.recruited_by 
            ? `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:6px;font-size:12px;border-left:3px solid #10b981;display:inline-flex;align-items:center;gap:4px">✅ <strong>${escapeHtml(candidate.recruited_by)}</strong> lo reclutó</span>` 
            : '';
        
        // Mostrar fecha de contratación si el candidato fue CONTRATADO
        const hiredDateBadge = candidate.status === 'Contratado' && candidate.hired_date
            ? `<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:6px;font-size:12px;border-left:3px solid #f59e0b;display:inline-flex;align-items:center;gap:4px">📅 Contratado: <strong>${new Date(candidate.hired_date).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' })}</strong></span>`
            : '';
        
        // Badge para empleado agregado
        const employeeAddedBadge = candidate.status === 'Contratado'
            ? `<span style="background:#cffafe;color:#0c4a6e;padding:4px 10px;border-radius:6px;font-size:12px;border-left:3px solid #0891b2;display:inline-flex;align-items:center;gap:4px">👨‍💼 <strong>Empleado</strong></span>`
            : '';
        
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;transition:all 0.2s';
        li.onmouseover = function() { this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; this.style.transform = 'translateY(-2px)'; };
        li.onmouseout = function() { this.style.boxShadow = 'none'; this.style.transform = 'translateY(0)'; };
        
        li.innerHTML = `
            <div style="flex:1">
                <strong style="font-size:15px;color:#1f2937">${escapeHtml(fullName)}</strong>
                <div style="font-size:13px;color:#6b7280;margin-top:4px">
                    📍 ${escapeHtml(candidate.position_applied || 'N/A')} • 📧 ${escapeHtml(candidate.email || 'N/A')}
                    ${candidate.phone ? `• 📱 ${escapeHtml(candidate.phone)}` : ''}
                </div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <span style="background:${statusColor}20;color:${statusColor};padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600">${escapeHtml(candidate.status)}</span>
                    ${recruiterBadge}
                    ${hiredDateBadge}
                    ${employeeAddedBadge}
                </div>
            </div>
            <div style="display:flex;gap:6px;margin-left:12px;flex-wrap:wrap;justify-content:flex-end">
                ${candidate.cv_url ? `<button class="view-candidate-cv" data-id="${candidate.id}" title="Ver CV" style="padding:8px 12px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:background 0.2s" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">📎 Ver CV</button>` : ''}
                <button class="edit-candidate" data-id="${candidate.id}" style="padding:8px 12px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:background 0.2s" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">✏️ Editar</button>
                <button class="delete-candidate" data-id="${candidate.id}" style="padding:8px 12px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:background 0.2s" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">🗑️ Eliminar</button>
            </div>
        `;
        candidateList.appendChild(li);
    });
}

function clearCandidateForm() {
    document.getElementById('candidate-id').value = '';
    document.getElementById('candidate-first').value = '';
    document.getElementById('candidate-last').value = '';
    document.getElementById('candidate-email').value = '';
    document.getElementById('candidate-phone').value = '';
    document.getElementById('candidate-salary-expectation').value = '';
    document.getElementById('candidate-position').value = '';
    document.getElementById('candidate-status').value = 'En revisión'; 
    document.getElementById('candidate-notes').value = '';
    document.getElementById('candidate-cv').value = '';
    document.getElementById('candidate-recruited-by-value').value = '';
    document.getElementById('candidate-hired-date-value').value = '';
    document.getElementById('candidate-cv-url').value = '';
    document.getElementById('candidate-submit').textContent = 'Guardar';
    
    // Habilitar todos los campos
    enableCandidateForm();
}

function populateCandidateForm(candidate){
    document.getElementById('candidate-id').value = candidate.id || '';
    document.getElementById('candidate-first').value = candidate.first_name || '';
    document.getElementById('candidate-last').value = candidate.last_name || '';
    document.getElementById('candidate-email').value = candidate.email || '';
    document.getElementById('candidate-phone').value = candidate.phone || '';
    document.getElementById('candidate-salary-expectation').value = candidate.salary_expectation || '';
    document.getElementById('candidate-position').value = candidate.position_applied || '';
    document.getElementById('candidate-status').value = candidate.status || 'En revisión';
    document.getElementById('candidate-notes').value = candidate.notes || '';
    document.getElementById('candidate-cv-url').value = candidate.cv_url || '';
    document.getElementById('candidate-recruited-by-value').value = candidate.recruited_by || '';
    document.getElementById('candidate-hired-date-value').value = candidate.hired_date || '';
    document.getElementById('candidate-submit').textContent = 'Guardar cambios';
    
    // Si el candidato ya está contratado, congelar el formulario
    if (candidate.status === 'Contratado') {
        disableCandidateForm();
    } else {
        enableCandidateForm();
    }
}

function escapeHtml(unsafe){
    return String(unsafe||'').replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m];});
}

// Funciones para congelar/descongelar el formulario
function disableCandidateForm() {
    const formElements = [
        'candidate-first',
        'candidate-last',
        'candidate-email',
        'candidate-phone',
        'candidate-salary-expectation',
        'candidate-position',
        'candidate-status',
        'candidate-notes',
        'candidate-cv'
    ];
    
    formElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = true;
            element.style.opacity = '0.6';
            element.style.cursor = 'not-allowed';
            element.style.background = '#f3f4f6';
        }
    });
    
    // Deshabilitar botón de submit
    const submitBtn = document.getElementById('candidate-submit');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.textContent = '🔒 Candidato Contratado (Solo Lectura)';
    }
    
    // Mostrar mensaje de advertencia
    const form = document.getElementById('candidate-form');
    let warningDiv = document.getElementById('contratado-warning');
    if (!warningDiv) {
        warningDiv = document.createElement('div');
        warningDiv.id = 'contratado-warning';
        warningDiv.style.cssText = 'background:#fef3c7;color:#92400e;padding:12px;border-radius:8px;margin-bottom:15px;border-left:4px solid #f59e0b;font-size:14px';
        warningDiv.innerHTML = '⚠️ <strong>Candidato Contratado:</strong> Este candidato ya fue contratado. No se pueden realizar modificaciones.';
        form.insertBefore(warningDiv, form.firstChild);
    }
}

function enableCandidateForm() {
    const formElements = [
        'candidate-first',
        'candidate-last',
        'candidate-email',
        'candidate-phone',
        'candidate-salary-expectation',
        'candidate-position',
        'candidate-status',
        'candidate-notes',
        'candidate-cv'
    ];
    
    formElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = false;
            element.style.opacity = '1';
            element.style.cursor = '';
            element.style.background = '#fbfdff';
        }
    });
    
    // Habilitar botón de submit
    const submitBtn = document.getElementById('candidate-submit');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }
    
    // Eliminar mensaje de advertencia
    const warningDiv = document.getElementById('contratado-warning');
    if (warningDiv) {
        warningDiv.remove();
    }
}

window.renderCandidates = renderCandidates;
window.clearCandidateForm = clearCandidateForm;
window.populateCandidateForm = populateCandidateForm;
window.disableCandidateForm = disableCandidateForm;
window.enableCandidateForm = enableCandidateForm;
