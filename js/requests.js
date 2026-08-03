let isFetching = false;
let requests = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Requires to be logged in. Anyone can access this page (Zone & Super Admin)
    const user = await initAuth(null);
    if (!user) return;

    // Show Create button only for Admin Zona
    if (user.role === 'admin_zona') {
        const btnCreate = document.getElementById('btn-create-request');
        if (btnCreate) btnCreate.classList.remove('hidden');
    }

    loadRequests();
});

async function loadRequests() {
    if (isFetching) return;
    isFetching = true;

    try {
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('table-body').innerHTML = '';

        const res = await API.get('/api/requests');
        requests = res.requests || [];
        renderTable();
    } catch (err) {
        console.error(err);
        Toast.error('Gagal memuat tiket permintaan: ' + err.message);
    } finally {
        isFetching = false;
        document.getElementById('loading-state').classList.add('hidden');
    }
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');

    if (!requests || requests.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        if (currentUser.role === 'super_admin' || currentUser.role === 'moderator') {
            document.getElementById('empty-sub').textContent = 'Belum ada Admin Zona yang mengirimkan request dokumen.';
        }
        return;
    }

    emptyState.classList.add('hidden');

    tbody.innerHTML = requests.map((r, i) => {
        const d = new Date(r.created_at);
        const dateStr = d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        let statusBadge = '';
        if (r.status === 'Pending') {
            statusBadge = '<span class="px-2.5 py-1 rounded-lg text-[9px] bg-amber-50 text-amber-600 border border-amber-100 font-black tracking-[0.1em] uppercase">Pending</span>';
        } else if (r.status === 'Selesai') {
            statusBadge = '<span class="px-2.5 py-1 rounded-lg text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 font-black tracking-[0.1em] uppercase">Selesai</span>';
        } else {
            statusBadge = '<span class="px-2.5 py-1 rounded-lg text-[9px] bg-red-50 text-red-600 border border-red-100 font-black tracking-[0.1em] uppercase">Ditolak</span>';
        }

        const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'moderator';

        // Extracted Nama File logic
        let fileName = '-';
        if (r.files && r.files.nama_file) {
            fileName = `<p class="text-xs font-bold text-gray-900 break-all">${r.files.nama_file}</p>`;
        } else if (r.pesan && r.pesan.startsWith('REVISI:')) {
            // Fallback: try to parse from message string if file_id link failed
            const match = r.pesan.match(/"([^"]+)"/);
            if (match) fileName = `<p class="text-xs font-bold text-gray-900 break-all">${match[1]}</p>`;
        }

        // Message cleaning (if revision, show only the details or formatted)
        let displayMessage = r.pesan;
        if (r.pesan && r.pesan.startsWith('REVISI:')) {
            const parts = r.pesan.split('\n');
            if (parts.length > 1) {
                displayMessage = parts.slice(1).join('<br>').replace('Alasan:', '<b>Alasan:</b>').replace('Catatan:', '<b>Catatan:</b>');
            }
        }

        return `
        <tr class="animate-fade-in border-b border-gray-50 hover:bg-gray-50/50 transition-colors" style="animation-delay: ${i * 30}ms">
            <td class="pl-8 py-5 align-top">
                <p class="text-xs font-black text-gray-900">${dateStr}</p>
                <p class="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider">${timeStr} WIB</p>
            </td>
            <td class="py-5 align-top">
                <p class="font-black text-gray-900 text-xs">${r.users?.name || 'Unknown'}</p>
                <p class="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">${r.zonas?.nama || '-'}</p>
            </td>
            <td class="py-5 align-top">
                ${fileName}
            </td>
            <td class="py-5 align-top">
                <div class="text-xs text-gray-500 leading-relaxed font-medium">
                    ${displayMessage.replace(/\n/g, '<br>')}
                    ${r.notes ? `<div class="mt-2 p-3 bg-red-50 rounded-xl border border-red-100 text-[10px] text-red-600 font-bold leading-relaxed"><b>Alasan Penolakan:</b> ${r.notes}</div>` : ''}
                </div>
            </td>
            <td class="py-5 align-top">
                ${statusBadge}
            </td>
            <td class="pr-8 py-5 align-top text-right">
                ${isAdmin ? `
                    <div class="flex items-center justify-end gap-2">
                        ${r.status === 'Pending' ? `
                            <button onclick="updateRequestStatus(${r.id}, 'Selesai')" class="p-2.5 rounded-xl bg-white border border-gray-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-95" title="Tandai Selesai">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                            </button>
                            <button onclick="openRejectModal(${r.id})" class="p-2.5 rounded-xl bg-white border border-gray-100 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-95" title="Tolak">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        ` : ''}
                        <button onclick="deleteRequest(${r.id})" class="p-2.5 rounded-xl bg-white border border-gray-100 text-gray-400 hover:bg-red-900 hover:text-white transition-all shadow-sm active:scale-95" title="Hapus Permanen">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                ` : '<span class="text-gray-300 font-black text-[10px]">---</span>'}
            </td>
        </tr>`;
    }).join('');
}

function openRequestModal() {
    document.getElementById('request-modal').classList.remove('hidden');
    document.getElementById('request-input').value = '';
    document.getElementById('request-input').focus();
}

function closeRequestModal() {
    document.getElementById('request-modal').classList.add('hidden');
}

async function submitRequest() {
    const btnSubmit = document.getElementById('btn-submit');
    const input = document.getElementById('request-input');
    const pesan = input.value.trim();

    if (!pesan) {
        Toast.error('Pesan tidak boleh kosong.');
        return;
    }

    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = `
        <div class="loader-mini">
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
        </div>
        Menyimpan...
    `;
    btnSubmit.disabled = true;

    try {
        await API.post('/api/requests', { pesan });
        Toast.success('Request berhasil dikirim ke Pusat.');
        closeRequestModal();
        loadRequests();
    } catch (err) {
        Toast.error('Gagal mengirim request: ' + err.message);
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
}

async function updateRequestStatus(id, newStatus) {
    if (newStatus === 'Ditolak') {
        openRejectModal(id);
        return;
    }

    showConfirm(
        'Konfirmasi Selesai',
        'Tandai tiket permintaan ini sebagai Selesai?',
        async () => {
            try {
                await API.put(`/api/requests/${id}`, { status: newStatus });
                Toast.success(`Status tiket diubah menjadi Selesai`);
                loadRequests();
            } catch (err) {
                Toast.error('Gagal mengubah status: ' + err.message);
            }
        }
    );
}

async function deleteRequest(id) {
    showConfirm(
        'Hapus Tiket',
        'Apakah Anda yakin ingin menghapus tiket request ini secara permanen? Data juga akan terhapus dari log Admin Zona.',
        async () => {
            try {
                await API.delete(`/api/requests/${id}`);
                Toast.success('Tiket request berhasil dihapus permanen.');
                loadRequests();
            } catch (err) {
                Toast.error('Gagal menghapus tiket: ' + err.message);
            }
        }
    );
}

let currentRejectId = null;

function openRejectModal(id) {
    currentRejectId = id;
    document.getElementById('reject-modal').classList.remove('hidden');
    document.getElementById('reject-notes-input').value = '';
    document.getElementById('reject-notes-input').focus();
}

function closeRejectModal() {
    document.getElementById('reject-modal').classList.add('hidden');
    currentRejectId = null;
}

async function submitReject() {
    const btn = document.getElementById('btn-submit-reject');
    const input = document.getElementById('reject-notes-input');
    const notes = input.value.trim();

    if (!notes) {
        Toast.error('Tolong isi alasan penolakan.');
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = `
        <div class="loader-mini">
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
        </div>
    `;
    btn.disabled = true;

    try {
        await API.put(`/api/requests/${currentRejectId}`, { status: 'Ditolak', notes });
        Toast.success('Tiket berhasil ditolak.');
        closeRejectModal();
        loadRequests();
    } catch (err) {
        Toast.error('Gagal menolak tiket: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
