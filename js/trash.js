// ============================================================
// Trash Management Logic — Pusat Arsip Anka
// ============================================================

let deletedFiles = [];
let selectedIds = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth('super_admin');
    if (!user) return;

    await loadTrash();
});

async function loadTrash() {
    showLoading('trash-table');
    try {
        const { files } = await API.get('/api/files/trash');
        deletedFiles = files || [];
        renderTrash();
    } catch (err) {
        Toast.error('Gagal memuat sampah: ' + err.message);
    } finally {
        hideLoading();
    }
}

function renderTrash(displayFiles = deletedFiles) {
    const tbody = document.getElementById('trash-body');
    const emptyState = document.getElementById('empty-state');
    const countDisplay = document.getElementById('trash-count');

    if (countDisplay) countDisplay.textContent = displayFiles.length;

    if (displayFiles.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = displayFiles.map(f => `
        <tr class="animate-fade-in group hover:bg-gray-50 transition-colors border-b border-gray-100">
            <td>
                <input type="checkbox" data-id="${f.id}" onclick="toggleItemSelection('${f.id}', this)"
                    ${selectedIds.includes(f.id) ? 'checked' : ''}
                    class="row-checkbox w-4 h-4 rounded border-gray-300 bg-white text-red-500 focus:ring-red-500 cursor-pointer">
            </td>
            <td>
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-gray-900">${truncate(f.nama_file.toUpperCase(), 40)}</p>
                        <p class="text-[10px] text-gray-500 font-mono italic">${f.storage_path}</p>
                    </div>
                </div>
            </td>
            <td><span class="badge ${getCategoryColor(f.category)}">${getCategoryLabel(f.category)}</span></td>
            <td>
                <div class="flex items-center gap-2">
                    <div class="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-[8px] font-bold text-indigo-400 uppercase border border-indigo-500/20">
                        ${(f.users?.name || 'A')[0]}
                    </div>
                    <span class="text-sm font-medium text-gray-700">${f.users?.name || 'Admin (System)'}</span>
                </div>
            </td>
            <td class="text-xs text-gray-500">${new Date(f.deleted_at).toLocaleString('id-ID')}</td>
            <td>
                <div class="flex items-center justify-end gap-2 ${selectedIds.includes(f.id) ? 'opacity-100' : 'opacity-0'} transition-opacity">
                    <button onclick="restoreFile('${f.id}', '${f.nama_file}')" class="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-400" title="Pulihkan">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                    <button onclick="permanentDelete('${f.id}', '${f.nama_file}')" class="p-2 rounded-lg hover:bg-red-500/10 text-red-400" title="Hapus Permanen">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    updateBulkUI(); // Reset buttons if any
}

async function restoreFile(id, name) {
    showConfirm('Pulihkan File', `Kembalikan "${name}" ke arsip aktif?`, async () => {
        try {
            await API.put(`/api/files/${id}/restore`);
            Toast.success('File dipulihkan');
            loadTrash();
        } catch (err) {
            Toast.error('Gagal memulihkan: ' + err.message);
        }
    }, 'Pulihkan');
}

async function permanentDelete(id, name) {
    showConfirm('Hapus Permanen', `PERINGATAN: "${name}" akan dihapus selamanya dari Terabox. Tindakan ini tidak dapat dibatalkan.`, async () => {
        try {
            await API.del(`/api/files/${id}?hard=true`);
            Toast.success('File dihapus permanen');
            loadTrash();
        } catch (err) {
            Toast.error('Gagal menghapus: ' + err.message);
        }
    }, 'HAPUS PERMANEN');
}

async function emptyTrash() {
    if (deletedFiles.length === 0) return;

    showConfirm('Kosongkan Sampah', `Apakah Anda yakin ingin menghapus SEMUA ${deletedFiles.length} file di tong sampah secara permanen?`, async () => {
        try {
            Toast.info('Sedang membersihkan sampah...');
            const ids = deletedFiles.map(f => f.id);
            await API.post('/api/files/bulk-trash-delete', { ids });
            Toast.success('Tong sampah berhasil dikosongkan');
            loadTrash();
        } catch (err) {
            Toast.error('Gagal mengosongkan sampah: ' + err.message);
        }
    }, 'Kosongkan');
}

function toggleSelectAll(master) {
    if (master.checked) {
        selectedIds = deletedFiles.map(f => f.id);
    } else {
        selectedIds = [];
    }

    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
    updateBulkUI();
}

function toggleItemSelection(id, cb) {
    if (cb.checked) {
        if (!selectedIds.includes(id)) selectedIds.push(id);
    } else {
        selectedIds = selectedIds.filter(sid => sid !== id);
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
    updateBulkUI();
}

function updateBulkUI() {
    const bar = document.getElementById('bulk-action-bar');
    const countEl = document.getElementById('selected-count');
    if (!bar || !countEl) return;

    if (selectedIds.length > 0) {
        bar.classList.add('active');
        bar.classList.remove('hidden');
        countEl.textContent = selectedIds.length;
    } else {
        bar.classList.remove('active');
        bar.classList.add('hidden');
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
}

function clearSelection() {
    selectedIds = [];
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    const master = document.getElementById('select-all');
    if (master) master.checked = false;
    updateBulkUI();
}

function searchTrash(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderTrash(deletedFiles);
        return;
    }

    const filtered = deletedFiles.filter(f =>
        f.nama_file.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (f.users?.name || '').toLowerCase().includes(q)
    );
    renderTrash(filtered);
}

async function bulkDeleteSelected() {
    if (selectedIds.length === 0) return;

    showConfirm('Hapus Permanen', `Apakah Anda yakin ingin menghapus permanen ${selectedIds.length} file yang dipilih?`, async () => {
        try {
            const btn = document.getElementById('btn-bulk-hard-delete');
            const originalContent = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Menghapus...';

            await API.post('/api/files/bulk-trash-delete', { ids: selectedIds });

            Toast.success(`${selectedIds.length} file dihapus permanen`);
            selectedIds = [];
            loadTrash();
        } catch (err) {
            Toast.error('Gagal menghapus masal: ' + err.message);
        } finally {
            const btn = document.getElementById('btn-bulk-hard-delete');
            btn.disabled = false;
        }
    }, 'HAPUS PERMANEN');
}

async function bulkRestoreSelected() {
    if (selectedIds.length === 0) return;

    showConfirm('Pulihkan Terpilih', `Kembalikan ${selectedIds.length} file yang dipilih ke arsip aktif?`, async () => {
        try {
            const btn = document.getElementById('btn-bulk-restore');
            btn.disabled = true;
            btn.innerHTML = 'Memulihkan...';

            await API.post('/api/files/bulk-restore', { ids: selectedIds });

            Toast.success(`${selectedIds.length} file dipulihkan`);
            selectedIds = [];
            loadTrash();
        } catch (err) {
            Toast.error('Gagal memulihkan masal: ' + err.message);
        } finally {
            const btn = document.getElementById('btn-bulk-restore');
            btn.disabled = false;
            btn.innerHTML = 'Pulihkan';
        }
    }, 'Pulihkan');
}
