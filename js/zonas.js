// ============================================================
// Zona Management Logic — v1.0 (JWT + Backend API)
// ============================================================

let zonas = [];

// ---- Initialize Page ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth('super_admin');
    if (!user) return;

    setupZonaForm();
    await loadZonas();
});

// ---- Load Zonas from API ----
async function loadZonas() {
    showLoading('main-content');

    try {
        const { zonas: data } = await API.get('/api/zonas');
        zonas = data || [];
        renderZonas();
        updateStats();
    } catch (err) {
        Toast.error('Gagal memuat data zona: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ---- Update Global Stats ----
function updateStats() {
    const el = document.getElementById('stat-total-zonas');
    if (el) el.textContent = zonas.length;
}

// ---- Render Zonas Table ----
function renderZonas() {
    const tbody = document.getElementById('zonas-body');
    const emptyState = document.getElementById('zonas-empty');

    if (!tbody) return;

    if (zonas.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    tbody.innerHTML = zonas.map((z, i) => {
        return `
            <tr class="animate-fade-in" style="animation-delay: ${Math.min(i * 30, 500)}ms">
                <td>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                        </div>
                        <span class="font-bold text-gray-900 text-sm">${z.nama}</span>
                    </div>
                </td>
                <td class="text-center">
                    <span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-mono">ID: ${z.id}</span>
                </td>
                <td>
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                             <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.396.015 12.03c0 2.123.553 4.197 1.604 6.04L0 24l6.151-1.613a11.893 11.893 0 005.894 1.554h.005c6.635 0 12.033-5.396 12.036-12.03.001-3.214-1.252-6.234-3.528-8.51"/>
                        </svg>
                        <span class="text-sm font-mono ${z.wa_recipient ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}">
                            ${z.wa_recipient || 'Belum diatur'}
                        </span>
                    </div>
                </td>
                <td>
                    <div class="flex items-center justify-end gap-1 px-4">
                        <button onclick='editZona(${JSON.stringify(z).replace(/'/g, "&#39;")})'
                            title="Edit Konfigurasi" class="p-2 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ---- Modal Operations ----
function openAddZonaModal() {
    document.getElementById('edit-zona-id').value = '';
    document.getElementById('modal-title').textContent = 'Tambah Zona Baru';
    document.getElementById('modal-nama').value = '';
    document.getElementById('modal-wa').value = '';
    document.getElementById('zona-modal').classList.remove('hidden');
}

function editZona(zona) {
    document.getElementById('edit-zona-id').value = zona.id;
    document.getElementById('modal-title').textContent = 'Edit Konfigurasi Zona';
    document.getElementById('modal-nama').value = zona.nama;
    document.getElementById('modal-wa').value = zona.wa_recipient || '';
    document.getElementById('zona-modal').classList.remove('hidden');
}

// ---- Close Modal ----
function closeZonaModal() {
    document.getElementById('zona-modal').classList.add('hidden');
}

// ---- Form Submit (CRUD via API) ----
function setupZonaForm() {
    const form = document.getElementById('zona-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('edit-zona-id').value;
        const nama = document.getElementById('modal-nama').value.trim();
        const wa_recipient = document.getElementById('modal-wa').value.trim();

        if (!nama) {
            Toast.warning('Nama Zona wajib diisi.');
            return;
        }

        try {
            if (id) {
                // UPDATE
                await API.put(`/api/zonas/${id}`, { nama, wa_recipient });
                Toast.success('Konfigurasi zona berhasil diperbarui');
            } else {
                // CREATE
                await API.post('/api/zonas', { nama, wa_recipient });
                Toast.success('Zona baru berhasil ditambahkan');
            }

            closeZonaModal();
            await loadZonas();
        } catch (err) {
            Toast.error('Gagal memproses data zona: ' + err.message);
        }
    });
}
