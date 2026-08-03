let fleetData = [];
let isEditing = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Requires Super Admin or Moderator
    const user = await initAuth(['super_admin', 'moderator']);
    if (!user) return;

    loadFleet();
});

async function loadFleet() {
    try {
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('table-body').innerHTML = '';

        const res = await API.get('/api/fleet');
        fleetData = res.fleet || [];

        updateStats();
        renderTable();
    } catch (err) {
        console.error(err);
        Toast.error('Gagal memuat data armada: ' + err.message);
    } finally {
        document.getElementById('loading-state').classList.add('hidden');
    }
}

function updateStats() {
    const total = fleetData.length;
    let warning = 0;
    let expired = 0;

    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(now.getDate() + 30);

    fleetData.forEach(v => {
        const dates = [v.pajak_stnk, v.pajak_plat, v.kir];
        dates.forEach(d => {
            if (!d) return;
            const expiryDate = new Date(d);
            if (expiryDate < now) expired++;
            else if (expiryDate < thirtyDaysLater) warning++;
        });
    });

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-warning').textContent = warning;
    document.getElementById('stat-expired').textContent = expired;
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');

    if (fleetData.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = fleetData.map((v, i) => {
        return `
        <tr class="animate-fade-in border-b border-gray-50 hover:bg-gray-50/50 transition-colors" style="animation-delay: ${i * 30}ms">
            <td class="pl-8 py-5">
                <p class="font-black text-gray-900 text-sm tracking-tight">${v.nopol}</p>
                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">${v.merk || '-'}</p>
            </td>
            <td class="py-5">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-black text-blue-600">
                        ${(v.driver || '??').substring(0, 2).toUpperCase()}
                    </div>
                    <p class="text-xs font-bold text-gray-700">${v.driver || '-'}</p>
                </div>
            </td>
            <td class="py-5 text-center">
                ${getDateBadge(v.pajak_stnk)}
            </td>
            <td class="py-5 text-center">
                ${getDateBadge(v.pajak_plat)}
            </td>
            <td class="py-5 text-center">
                ${getDateBadge(v.kir)}
            </td>
            <td class="py-5">
                ${getStatusBadge(v.status)}
            </td>
            <td class="pr-8 py-5 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="editVehicle('${v.id}')" class="p-2 rounded-lg bg-white border border-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick="deleteVehicle('${v.id}', '${v.nopol}')" class="p-2 rounded-lg bg-white border border-gray-100 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function getDateBadge(dateStr) {
    if (!dateStr) return '<span class="text-gray-300 font-extrabold text-[10px]">BELUM DIISI</span>';

    const d = new Date(dateStr);
    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(now.getDate() + 30);

    const formattedDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    let colorClass = 'text-gray-900 bg-gray-50';
    if (d < now) colorClass = 'text-red-600 bg-red-50 border-red-100';
    else if (d < thirtyDaysLater) colorClass = 'text-amber-600 bg-amber-50 border-amber-100';

    return `<div class="inline-flex flex-col items-center p-2 rounded-xl border border-transparent ${colorClass} transition-all">
        <span class="text-[10px] font-black tracking-tight">${formattedDate}</span>
    </div>`;
}

function getStatusBadge(status) {
    let classes = 'bg-blue-50 text-blue-600 border-blue-100';
    if (status === 'Servis') classes = 'bg-amber-50 text-amber-600 border-amber-100';
    if (status === 'Rusak') classes = 'bg-red-50 text-red-600 border-red-100';

    return `<span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${classes}">${status}</span>`;
}

function openVehicleModal(id = null) {
    const modal = document.getElementById('vehicle-modal');
    const form = document.getElementById('vehicle-form');
    const title = document.getElementById('modal-title');

    form.reset();
    document.getElementById('vehicle-id').value = '';
    isEditing = !!id;

    if (isEditing) {
        const v = fleetData.find(v => v.id === id);
        if (v) {
            title.textContent = 'Edit Kendaraan';
            document.getElementById('vehicle-id').value = v.id;
            document.getElementById('input-nopol').value = v.nopol;
            document.getElementById('input-merk').value = v.merk || '';
            document.getElementById('input-driver').value = v.driver || '';
            document.getElementById('input-status').value = v.status || 'Aktif';
            document.getElementById('input-stnk').value = v.pajak_stnk || '';
            document.getElementById('input-plat').value = v.pajak_plat || '';
            document.getElementById('input-kir').value = v.kir || '';
            document.getElementById('input-notes').value = v.notes || '';
        }
    } else {
        title.textContent = 'Tambah Kendaraan';
    }

    modal.classList.remove('hidden');
}

function closeVehicleModal() {
    document.getElementById('vehicle-modal').classList.add('hidden');
}

async function saveVehicle(e) {
    e.preventDefault();
    const id = document.getElementById('vehicle-id').value;
    const btn = document.getElementById('btn-save');
    const originalText = btn.innerHTML;

    const payload = {
        nopol: document.getElementById('input-nopol').value,
        merk: document.getElementById('input-merk').value,
        driver: document.getElementById('input-driver').value,
        status: document.getElementById('input-status').value,
        pajak_stnk: document.getElementById('input-stnk').value || null,
        pajak_plat: document.getElementById('input-plat').value || null,
        kir: document.getElementById('input-kir').value || null,
        notes: document.getElementById('input-notes').value
    };

    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> Menyimpan...`;
    btn.disabled = true;

    try {
        if (isEditing) {
            await API.put(`/api/fleet/${id}`, payload);
            Toast.success('Data kendaraan diperbarui');
        } else {
            await API.post('/api/fleet', payload);
            Toast.success('Kendaraan berhasil ditambahkan');
        }
        closeVehicleModal();
        loadFleet();
    } catch (err) {
        Toast.error('Gagal menyimpan data: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function deleteVehicle(id, nopol) {
    showConfirm(
        'Hapus Kendaraan',
        `Apakah Anda yakin ingin menghapus data kendaraan ${nopol}? Tindakan ini tidak dapat dibatalkan.`,
        async () => {
            try {
                await API.delete(`/api/fleet/${id}`);
                Toast.success('Data kendaraan berhasil dihapus');
                loadFleet();
            } catch (err) {
                Toast.error('Gagal menghapus data: ' + err.message);
            }
        }
    );
}

function editVehicle(id) {
    openVehicleModal(id);
}
