// ============================================================
// Toko (Shop) Management Logic — v2.0 (JWT + Backend API)
// ============================================================

let tokos = [];

// ---- Initialize Tokos Page ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth('super_admin');
    if (!user) return;

    await populateModalZonas();
    setupTokoForm();
    await loadTokos();
});

// ---- Populate Modal Zona Dropdown from API ----
async function populateModalZonas() {
    try {
        const { zonas } = await API.get('/api/zonas');
        window._zonaCache = zonas || [];

        const select = document.getElementById('modal-zona');
        const filterSelect = document.getElementById('filter-zona');

        zonas.forEach(z => {
            // Modal dropdown
            if (select) {
                const opt = document.createElement('option');
                opt.value = z.id;
                opt.textContent = z.nama;
                select.appendChild(opt);
            }

            // Filter dropdown
            if (filterSelect) {
                const opt = document.createElement('option');
                opt.value = z.id;
                opt.textContent = z.nama;
                filterSelect.appendChild(opt);
            }
        });
    } catch (err) {
        console.warn('Failed to load zonas:', err);
    }
}

// ---- Load Tokos from API ----
async function loadTokos() {
    showLoading('main-content');

    try {
        const { tokos: data } = await API.get('/api/toko');
        tokos = data || [];
        applyTokoFilter(); // Use initial render
        updateTokoStats();
    } catch (err) {
        Toast.error('Gagal memuat data toko: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ---- Apply Filter ----
function applyTokoFilter() {
    const filterZonaId = document.getElementById('filter-zona')?.value;
    let filtered = tokos;

    if (filterZonaId) {
        filtered = tokos.filter(t => t.zona_id === parseInt(filterZonaId));
    }

    renderTokos(filtered);
}

// ---- Update Stats ----
function updateTokoStats() {
    const el = (id) => document.getElementById(id);
    if (el('stat-total-tokos')) el('stat-total-tokos').textContent = tokos.length;

    // Unique zones
    const uniqueZonas = [...new Set(tokos.map(t => t.zona_id))].length;
    if (el('stat-total-zonas')) el('stat-total-zonas').textContent = uniqueZonas;
}

// ---- Render Tokos Table ----
function renderTokos(dataToRender = tokos) {
    const tbody = document.getElementById('tokos-body');
    const emptyState = document.getElementById('tokos-empty');

    if (!tbody) return;

    if (dataToRender.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    tbody.innerHTML = dataToRender.map((t, i) => {
        const zona = window._zonaCache?.find(z => z.id === t.zona_id);
        return `
            <tr class="animate-fade-in" style="animation-delay: ${Math.min(i * 30, 500)}ms">
                <td>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <span class="text-xs font-bold text-indigo-400">${t.nama.substring(0, 2).toUpperCase()}</span>
                        </div>
                        <span class="font-bold text-gray-900 text-sm">${t.nama}</span>
                    </div>
                </td>
                <td class="text-gray-700 text-sm font-mono">${t.kode}</td>
                <td>
                    <span class="badge bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                        ${zona ? zona.nama : `Zona ${t.zona_id}`}
                    </span>
                </td>
                <td>
                    <div class="flex items-center justify-end gap-1">
                        <button onclick='editToko(${JSON.stringify(t).replace(/'/g, "&#39;")})'
                            title="Edit" class="p-2 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onclick="deleteToko('${t.id}', '${t.nama.replace(/'/g, "\\'")}')"
                            title="Hapus" class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ---- Open Modal for Add ----
function openTokoModal() {
    document.getElementById('modal-title').textContent = 'Tambah Toko Baru';
    document.getElementById('edit-toko-id').value = '';
    document.getElementById('toko-form').reset();
    document.getElementById('toko-modal').classList.remove('hidden');
}

// ---- Open Modal for Edit ----
function editToko(toko) {
    document.getElementById('modal-title').textContent = 'Edit Toko';
    document.getElementById('edit-toko-id').value = toko.id;
    document.getElementById('modal-nama').value = toko.nama;
    document.getElementById('modal-kode').value = toko.kode;
    document.getElementById('modal-zona').value = toko.zona_id;
    document.getElementById('toko-modal').classList.remove('hidden');
}

// ---- Close Modal ----
function closeTokoModal() {
    document.getElementById('toko-modal').classList.add('hidden');
}

// ---- Form Submit (Create or Update via API) ----
function setupTokoForm() {
    const form = document.getElementById('toko-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editId = document.getElementById('edit-toko-id').value;
        const nama = document.getElementById('modal-nama').value.trim();
        const kode = document.getElementById('modal-kode').value.trim().toUpperCase();
        const zona_id = document.getElementById('modal-zona').value;

        if (!nama || !kode || !zona_id) {
            Toast.warning('Mohon lengkapi semua field.');
            return;
        }

        const tokoData = {
            nama,
            kode,
            zona_id: parseInt(zona_id)
        };

        try {
            if (editId) {
                await API.put(`/api/toko/${editId}`, tokoData);
                Toast.success('Data toko berhasil diperbarui');
            } else {
                await API.post('/api/toko', tokoData);
                Toast.success('Toko berhasil ditambahkan');
            }

            closeTokoModal();
            await loadTokos();
        } catch (err) {
            Toast.error('Gagal menyimpan toko: ' + err.message);
        }
    });
}

// ---- Delete Toko ----
function deleteToko(id, name) {
    showConfirm(
        'Hapus Toko',
        `Apakah Anda yakin ingin menghapus toko "${name}"? Tindakan ini hanya bisa dilakukan jika toko tidak memiliki dokumen terkait.`,
        async () => {
            try {
                await API.del(`/api/toko/${id}`);
                Toast.success('Toko berhasil dihapus');
                await loadTokos();
            } catch (err) {
                Toast.error('Gagal menghapus toko: ' + err.message);
            }
        },
        'Hapus'
    );
}
