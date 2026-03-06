// ========== EMPLOYEES V2 FUNCTIONS (NORMALIZED) ==========

async function fetchEmployees() {
    try {
        // Usar nuevo endpoint v2 con toda la información normalizada
        const url = window.getApiUrl ? window.getApiUrl('/api/employees-v2') : '/api/employees-v2';
        const res = await fetch(url);
        if (!res.ok) return [];
        return await res.json();
    } catch (err) {
        console.error('Error fetching employees', err);
        return [];
    }
}

async function createEmployee(payload) {
    try {
        // payload: { first_name, last_name, email, position_id, department_id, ... }
        const url = window.getApiUrl ? window.getApiUrl('/api/employees-v2') : '/api/employees-v2';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            let errorMessage = 'Error al crear empleado';
            try {
                const errorData = await res.json();
                errorMessage = errorData.error || errorMessage;
            } catch (parseErr) {
                // Si no se puede parsear como JSON, usar texto plano
                errorMessage = await res.text() || errorMessage;
            }
            
            // Mostrar error al usuario
            Swal.fire({
                icon: 'error',
                title: 'No se pudo crear el empleado',
                html: errorMessage,
                confirmButtonColor: '#3b82f6'
            });
            
            throw new Error(errorMessage);
        }
        
        const result = await res.json();
        return result;
    } catch (err) {
        console.error('Error creating employee', err);
        
        // Si el error ya se mostró, no mostrar otro mensaje
        if (!err.message || !err.message.includes('código')) {
            Swal.fire({
                icon: 'error',
                title: 'Error al crear empleado',
                text: err.message || err
            });
        }
        throw err;
    }
}

async function updateEmployee(id, payload){
    try{
        const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${id}`) : `/api/employees-v2/${id}`;
        const res = await fetch(url,{
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Error al actualizar empleado');
        }
        const result = await res.json();
        return result;
    }catch(err){
        console.error('Error updating employee', err);
        Swal.fire({
            icon: 'error',
            title: 'Error al actualizar empleado',
            text: err.message || err
        });
        throw err;
    }
}

async function deleteEmployee(id){
    try{
        const url = window.getApiUrl ? window.getApiUrl(`/api/employees-v2/${id}`) : `/api/employees-v2/${id}`;
        const res = await fetch(url,{ method: 'DELETE' });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Error al eliminar empleado');
        }
        const result = await res.json();
        Swal.fire({
            icon: 'success',
            title: 'Empleado eliminado',
            text: 'El empleado ha sido eliminado exitosamente',
            timer: 2000,
            showConfirmButton: false
        });
        return result;
    }catch(err){
        console.error('Error deleting employee', err);
        Swal.fire({
            icon: 'error',
            title: 'Error al eliminar empleado',
            text: err.message || err
        });
        throw err;
    }
}

window.fetchEmployees = fetchEmployees;
window.createEmployee = createEmployee;
window.updateEmployee = updateEmployee;
window.deleteEmployee = deleteEmployee;

// ========== CANDIDATES FUNCTIONS ==========

async function fetchCandidates() {
    try {
        const url = window.getApiUrl ? window.getApiUrl('/api/candidates') : '/api/candidates';
        const res = await fetch(url);
        if (!res.ok) return [];
        return await res.json();
    } catch (err) {
        console.error('Error fetching candidates', err);
        return [];
    }
}

async function createCandidate(payload) {
    try {
        const url = window.getApiUrl ? window.getApiUrl('/api/candidates') : '/api/candidates';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Error al crear candidato');
        }
        const result = await res.json();
        return result;
    } catch (err) {
        console.error('Error creating candidate', err);
        Swal.fire({
            icon: 'error',
            title: 'Error al crear candidato',
            text: err.message || err
        });
        throw err;
    }
}

async function updateCandidate(id, payload){
    try{
        const url = window.getApiUrl ? window.getApiUrl(`/api/candidates/${id}`) : `/api/candidates/${id}`;
        const res = await fetch(url,{
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Error al actualizar candidato');
        }
        const result = await res.json();
        return result;
    }catch(err){
        console.error('Error updating candidate', err);
        Swal.fire({
            icon: 'error',
            title: 'Error al actualizar candidato',
            text: err.message || err
        });
        throw err;
    }
}

async function deleteCandidate(id,status){
    try{
        const url = window.getApiUrl ? window.getApiUrl(`/api/candidates/${id}`) : `/api/candidates/${id}`;
        const res = await fetch(url,{ method: 'PATCH', body: JSON.stringify({ status }), headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || 'Error al eliminar candidato');
        }
        const result = await res.json();
        Swal.fire({
            icon: 'success',
            title: 'Candidato eliminado',
            text: 'El candidato ha sido eliminado exitosamente',
            timer: 2000,
            showConfirmButton: false
        });
        return result;
    }catch(err){
        console.error('Error deleting candidate', err);
        Swal.fire({
            icon: 'error',
            title: 'Error al eliminar candidato',
            text: err.message || err
        });
        throw err;
    }
}

window.fetchCandidates = fetchCandidates;
window.createCandidate = createCandidate;
window.updateCandidate = updateCandidate;
window.deleteCandidate = deleteCandidate;
