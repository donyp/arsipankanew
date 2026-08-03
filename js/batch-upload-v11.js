// ============================================================
// Batch Upload Logic — v11.0 (Smart Hybrid Scan)
// ============================================================

let batchData = [];
let zonas = [];
let tokos = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;
    await loadMappingData();
});

async function loadMappingData() {
    try {
        const { data: zData } = await supabase.from('zonas').select('*');
        const { data: tData } = await supabase.from('toko').select('*');
        zonas = zData || [];
        tokos = tData || [];
    } catch (err) {
        console.error('Failed to load mapping data:', err);
    }
}

async function handleSmartUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Check if it's an Excel file (single entry)
    const firstFile = files[0];
    const ext = firstFile.name.split('.').pop().toLowerCase();

    if (files.length === 1 && (ext === 'xlsx' || ext === 'xls' || ext === 'csv')) {
        handleExcelUpload(firstFile);
    } else {
        // Assume multiple PDFs or direct scanning
        handleDirectPDFUpload(files);
    }
}

function handleDirectPDFUpload(files) {
    batchData = files.map((file, index) => {
        return {
            id: index,
            tanggal: new Date().toISOString().split('T')[0],
            no_invoice: '-',
            total: 0,
            konsumen: '-',
            metode: 'TUNAI',
            pdfFile: file,
            status: 'ready',
            errorMsg: '',
            tipe_ppn: 'NON',
            _originalRow: {}
        };
    });
    renderBatchTable();
    showTable();
}

function handleExcelUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let jsonData = [];
            for (const sn of workbook.SheetNames) {
                const ws = workbook.Sheets[sn];
                const temp = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
                if (temp.length > 0) { jsonData = temp; break; }
            }
            if (jsonData.length === 0) throw new Error('File Excel kosong.');
            processExcelData(jsonData);
        } catch (err) {
            Toast.error(err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function processExcelData(json) {
    batchData = json.map((row, index) => {
        const keys = Object.keys(row);
        const findKey = (patterns) => {
            const exact = keys.find(k => patterns.some(p => k.toLowerCase() === p.toLowerCase()));
            if (exact) return exact;
            return keys.find(k => patterns.some(p => k.toLowerCase().includes(p.toLowerCase())));
        };

        const totalKey = findKey(['total', 'nominal', 'amount', 'tagihan', 'bayar']);
        const storeKey = findKey(['konsumen', 'nama toko', 'toko', 'customer']);
        const dateKey = findKey(['tanggal', 'tgl', 'date']);
        const invKey = findKey(['faktur', 'invoice', 'no inv']);

        row._parseMoney = parseMoney;
        row._totalKey = totalKey;

        return {
            id: index,
            tanggal: row[dateKey] || '',
            no_invoice: row[invKey] || '',
            total: parseMoney(row[totalKey], ''),
            konsumen: row[storeKey] || '-',
            metode: 'TUNAI',
            pdfFile: null,
            status: 'pending',
            errorMsg: '',
            _originalRow: row
        };
    });
    renderBatchTable();
    showTable();
}

// ---- Metadata Extraction (REMOVED) ----

function parseMoney(val, filename) {
    if (filename) {
        const m = filename.match(/\d{1,3}(?:\.\d{3}){1,3}/);
        if (m) return parseFloat(m[0].replace(/\./g, '')) || 0;
    }
    if (!val) return 0;
    let s = val.toString().replace(/[^0-9,.]/g, '');
    if (s.includes('.') && s.includes(',')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (s.includes(',') && s.split(',')[s.split(',').length - 1].length !== 3) s = s.replace(',', '.');
    else if (s.includes('.')) {
        if (s.split('.')[s.split('.').length - 1].length === 3) s = s.replace(/\./g, '');
    }
    return parseFloat(s) || 0;
}

function attachPDF(id, event) {
    const file = event.target.files[0];
    if (!file) return;
    const row = batchData.find(r => r.id === id);
    if (row) {
        row.pdfFile = file;
        row.status = 'ready';
        renderBatchTable();
    }
}

function renderBatchTable() {
    const tbody = document.getElementById('batch-table-body');
    tbody.innerHTML = batchData.map(row => `
        <tr class="animate-fade-in group hover:bg-white/5 transition-colors">
            <td class="px-6 py-4">
                <span class="row-status-${row.status} flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    ${getStatusIcon(row.status)}
                    ${row.status === 'success' ? 'Selesai' : row.status === 'ready' ? 'Siap' : row.status === 'uploading' ? 'Proses' : row.status === 'error' ? 'Gagal' : 'Pending'}
                </span>
                ${row.errorMsg ? `<p class="text-[9px] text-red-500/80 mt-1 font-medium">${row.errorMsg}</p>` : ''}
            </td>
            <td class="px-6 py-4 text-sm font-medium text-gray-700">${row.tanggal || '-'}</td>
            <td class="px-6 py-4">
                <p class="text-sm font-bold text-gray-900">${row.konsumen || '-'}</p>
                <p class="text-[10px] text-gray-500">${row.no_invoice || '-'}</p>
            </td>
            <td class="px-6 py-4 text-sm font-bold text-blue-600 font-mono">${formatCurrency(row.total)}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <input type="file" id="pdf-${row.id}" accept="application/pdf" class="hidden" onchange="attachPDF(${row.id}, event)">
                    <label for="pdf-${row.id}" class="h-8 w-8 rounded-lg bg-white/5 hover:bg-indigo-500/20 flex items-center justify-center cursor-pointer border border-white/10 transition-all">
                        <svg class="w-4 h-4 ${row.pdfFile ? 'text-indigo-400' : 'text-gray-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </label>
                    <div class="flex flex-col">
                        <span class="text-[11px] font-medium text-gray-400 truncate max-w-[120px]">${row.pdfFile ? row.pdfFile.name : 'Pilih Berkas'}</span>
                        ${row.pdfFile ? `<span class="text-[9px] text-gray-600 font-mono">${(row.pdfFile.size / 1024).toFixed(0)} KB</span>` : ''}
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function getStatusIcon(status) {
    if (status === 'success') return '<svg class="w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (status === 'uploading') return `
        <div class="loader-mini">
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
            <div class="loader-ring"></div>
        </div>
    `;
    if (status === 'ready') return '<div class="w-2 h-2 rounded-full bg-amber-500"></div>';
    if (status === 'error') return '<svg class="w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<div class="w-2 h-2 rounded-full bg-gray-700"></div>';
}

function showTable() {
    document.getElementById('excel-step').classList.add('hidden');
    document.getElementById('mapping-step').classList.remove('hidden');
}

function resetBatch() {
    batchData = [];
    document.getElementById('excel-step').classList.remove('hidden');
    document.getElementById('mapping-step').classList.add('hidden');
}

async function uploadAllReady() {
    const ready = batchData.filter(r => r.status === 'ready');
    if (ready.length === 0) return Toast.error('Tidak ada data siap.');
    const btn = document.getElementById('btn-upload-all');
    btn.disabled = true;
    const bid = self.crypto.randomUUID ? self.crypto.randomUUID() : 'b_' + Date.now();
    let sc = 0;
    for (const r of ready) { if (await uploadRow(r, bid)) sc++; }
    btn.disabled = false;
    Toast.success(`${sc}/${ready.length} berhasil.`);
}

async function uploadRow(row, batchId) {
    row.status = 'uploading'; renderBatchTable();
    try {
        const token = localStorage.getItem('jwt_token');
        const fd = new FormData();
        const t = tokos.find(tk => tk.nama.toLowerCase().includes(row.konsumen.toLowerCase()) || row.konsumen.toLowerCase().includes(tk.nama.toLowerCase()));
        if (!t) throw new Error(`Toko "${row.konsumen}" tidak ditemukan.`);
        fd.append('zona_id', t.zona_id);
        fd.append('toko_id', t.id);
        fd.append('category', 'INVOICE');
        fd.append('tanggal_dokumen', formatDateToISO(row.tanggal));
        fd.append('no_invoice', row.no_invoice);
        fd.append('total_jual', row.total);
        if (row.tipe_ppn) fd.append('tipe_ppn', row.tipe_ppn);
        if (batchId) fd.append('batch_id', batchId);
        fd.append('file', row.pdfFile);
        const res = await fetch(`${CONFIG.API_URL}/api/files/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        if (!res.ok) throw new Error((await res.json()).error);
        row.status = 'success'; return true;
    } catch (err) {
        row.status = 'error'; row.errorMsg = err.message; return false;
    } finally { renderBatchTable(); }
}

function formatDateToISO(e) {
    if (!e) return new Date().toISOString();
    if (typeof e === 'number') { try { const d = XLSX.SSF.parse_date_code(e); return new Date(d.y, d.m - 1, d.d).toISOString(); } catch (err) { } }
    const s = String(e).trim();
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function formatCurrency(v) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}
