// ============================================================
// Upload Logic — v2.0 (JWT + Backend API + Rclone Storage)
// Replaces direct Google Drive uploads
// ============================================================

let selectedFiles = [];

/**
 * Helper to convert Date object to YYYY-MM-DD string in LOCAL timezone
 */
function toLocalYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;
    window._currentUser = user; // Store for global access

    // Allow only authorized roles
    const allowedRoles = ['super_admin', 'moderator', 'admin_zona'];
    if (!allowedRoles.includes(user.role)) {
        Toast.error('Akses ditolak.');
        setTimeout(() => window.location.href = 'dashboard.html', 1500);
        return;
    }

    await loadAllTokos();
    setupDragDrop();
    setupForm();
    loadRecentUploads();
});

// ---- Load Toko List (for dropdown selection) ----
async function loadAllTokos() {
    try {
        const { tokos: toko } = await API.get('/api/toko');
        window._allTokos = toko || [];
    } catch (err) {
        window._allTokos = [];
    }
}

// ---- Drag & Drop Setup ----
function setupDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-50/50');
        });
    });
    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        addFiles(e.dataTransfer.files);
    });
}

// ---- File Selection ----
function handleFileSelect(input) {
    if (input.files.length > 0) {
        addFiles(input.files);
    }
}

function addFiles(files) {
    const newFiles = Array.from(files).filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (ext !== 'pdf' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'png') {
            Toast.warning(`File "${f.name}" format tidak didukung.`);
            return false;
        }
        // Check duplicate in current queue
        if (selectedFiles.some(sf => sf.file.name === f.name)) {
            Toast.warning(`File "${f.name}" sudah ada dalam antrian.`);
            return false;
        }
        return true;
    }).map(f => {
        const scan = scanFilename(f.name);
        return {
            file: f,
            toko: scan.toko || null,
            date: scan.date || toLocalYYYYMMDD(new Date()),
            isDateDetected: scan.isDateDetected,
            tipe_ppn: scan.tipe || 'REGULAR',
            nominal: scan.nominal || 0,
            isAutoDetected: !!scan.toko,
            isDuplicate: false // Default to false, check in background
        };
    });

    const startIndex = selectedFiles.length;
    selectedFiles = [...selectedFiles, ...newFiles];
    updateFileUI();

    // Trigger background duplicate check for new files
    const currentUser = window._currentUser || { zona_id: 1 }; // Fallback to Zona 1 if unknown
    newFiles.forEach((item) => {
        // Use toko.zona_id if detected, else use user's own zona_id
        const targetZonaId = item.toko ? item.toko.zona_id : currentUser.zona_id;
        if (targetZonaId) {
            checkBackgroundDuplicate(item.file.name, targetZonaId);
        }
    });
}

/**
 * Silent background check for existing files (Safe version: uses filename matching)
 */
async function checkBackgroundDuplicate(filename, zonaId) {
    try {
        const res = await API.get(`/api/files/check-duplicate?name=${encodeURIComponent(filename)}&zona_id=${zonaId}`);
        if (res && res.exists) {
            // Find the file by name in the current queue and mark as duplicate
            const fileIndex = selectedFiles.findIndex(f => f.file.name === filename);
            if (fileIndex !== -1) {
                selectedFiles[fileIndex].isDuplicate = true;
                updateFileUI(); // Silent update
            }
        }
    } catch (err) {
        console.error('Duplicate check error:', err);
    }
}

/**
 * Robust filename parser for format: [Type] [Toko] [Nominal] [Date]
 * Example: "PPN Cipondoh 2.983.000 12 Mei"
 */
function scanFilename(name) {
    const result = {
        tipe: 'REGULAR',
        toko: null,
        nominal: 0,
        date: null,
        isDateDetected: false
    };

    if (!name) return result;
    const cleanName = name.replace(/\.[^/.]+$/, ""); // Remove extension

    // 1. Detect Type (PPN/NON)
    const firstWord = cleanName.split(/\s+/)[0];
    if (/^PPN/i.test(firstWord)) result.tipe = 'PPN';
    else if (/^NON/i.test(firstWord)) result.tipe = 'NON_PPN';

    // 2. Detect Toko (Match against window._allTokos)
    if (window._allTokos && window._allTokos.length > 0) {
        // ULTRA-NORMALIZATION: Remove ALL non-alphanumeric characters for matching
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

        const cleanToMatch = normalize(cleanName);

        // Sort tokos by length descending to catch specific multi-word matches first
        const sortedTokos = [...window._allTokos].sort((a, b) => b.nama.length - a.nama.length);

        for (const t of sortedTokos) {
            const cleanTokoName = normalize(t.nama);
            if (cleanTokoName && cleanToMatch.includes(cleanTokoName)) {
                result.toko = t;
                break;
            }
        }
    }

    // 3. Detect Nominal (Look for pattern X.XXX.XXX)
    const nominalMatch = cleanName.match(/(\d{1,3}(\.\d{3})+)/);
    if (nominalMatch) {
        result.nominal = parseInt(nominalMatch[0].replace(/\./g, ''));
    }

    // 4. Detect Date (e.g., "12 Mei" or "12-05")
    const months = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mei': 4, 'jun': 5,
        'jul': 6, 'agu': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'des': 11,
        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
        'may': 4, 'aug': 7, 'oct': 9, 'dec': 11
    };

    const dateMatch = cleanName.match(/\b(\d{1,2})\s+([a-zA-Z]{3,})\b/i);
    if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const monthName = dateMatch[2].toLowerCase();
        let monthIdx = -1;

        if (months[monthName] !== undefined) {
            monthIdx = months[monthName];
        } else {
            const prefix = monthName.substring(0, 3);
            if (months[prefix] !== undefined) monthIdx = months[prefix];
        }

        if (monthIdx !== -1) {
            const now = new Date();
            const d = new Date(now.getFullYear(), monthIdx, day);
            result.date = toLocalYYYYMMDD(d);
            result.isDateDetected = true;
        }
    } else {
        // Fallback for numeric format like 12-05 or 12/05
        const numericMatch = cleanName.match(/\b(\d{1,2})[-/](\d{1,2})\b/);
        if (numericMatch) {
            const day = parseInt(numericMatch[1]);
            const month = parseInt(numericMatch[2]) - 1;
            const now = new Date();
            const d = new Date(now.getFullYear(), month, day);
            result.date = toLocalYYYYMMDD(d);
            result.isDateDetected = true;
        }
    }

    return result;
}

function removeFile(index, e) {
    if (e) e.stopPropagation();
    selectedFiles.splice(index, 1);
    updateFileUI();
}

function clearFile(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    selectedFiles = [];
    updateFileUI();
}

function setFileToko(index, tokoId) {
    if (!tokoId) {
        selectedFiles[index].toko = null;
        selectedFiles[index].isAutoDetected = false;
    } else {
        const toko = window._allTokos.find(t => t.id == tokoId);
        if (toko) {
            selectedFiles[index].toko = toko;
            selectedFiles[index].isAutoDetected = false;
            // Re-check duplicate on toko change
            checkBackgroundDuplicate(index, selectedFiles[index].file.name, toko.zona_id);
        }
    }
    updateFileUI();
}

function setFileDate(index, dateValue) {
    selectedFiles[index].date = dateValue;
    selectedFiles[index].isDateDetected = false; // Switch to manual mode if edited
    updateFileUI();
}

function unlockDate(index) {
    selectedFiles[index].isDateDetected = false;
    updateFileUI();
}

function updateFileUI() {
    const listDisplay = document.getElementById('file-list-display');
    const fileInfo = document.getElementById('file-info');
    const dropZoneContent = document.getElementById('drop-zone-content');
    const submitBtn = document.getElementById('upload-btn');

    if (!listDisplay || !fileInfo || !dropZoneContent) return;

    if (selectedFiles.length === 0) {
        fileInfo.classList.add('hidden');
        dropZoneContent.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    fileInfo.classList.remove('hidden');
    dropZoneContent.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;

    listDisplay.innerHTML = selectedFiles.map((item, i) => {
        const tokoOptions = window._allTokos.map(t => `<option value="${t.id}" ${item.toko && item.toko.id === t.id ? 'selected' : ''}>${t.nama}</option>`).join('');
        const ext = item.file.name.split('.').pop().toLowerCase();
        const isPdf = ext === 'pdf';

        // Month name for display badge
        let displayDate = item.date;
        try {
            const dateParts = item.date.split('-'); // YYYY-MM-DD
            const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
            displayDate = `${parseInt(dateParts[2])} ${monthNames[d.getMonth()]}`;
        } catch (e) { }

        return `
        <li class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-all group/item shadow-sm">
            <div class="flex items-center gap-4 min-w-0 flex-1 w-full">
                <div class="w-12 h-12 rounded-xl ${isPdf ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'} flex items-center justify-center shrink-0 border group-hover/item:shadow-lg transition-all">
                    <svg class="w-6 h-6 ${isPdf ? 'text-red-500' : 'text-blue-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                </div>
                <div class="flex flex-col truncate flex-1 min-w-0">
                    <p class="text-[13px] font-bold text-gray-900 truncate mb-2 group-hover/item:text-blue-600 transition-colors uppercase">${item.file.name}</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <!-- Toko Badge -->
                        ${item.isAutoDetected ? `
                            <div class="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-lg border border-emerald-100 shadow-sm animate-fade-in">
                                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                                <span class="text-[10px] font-black uppercase tracking-widest">${item.toko ? item.toko.nama : 'Unknown'}</span>
                            </div>
                        ` : `
                            <select onchange="setFileToko(${i}, this.value)" onclick="event.stopPropagation()" class="bg-white border border-gray-200 text-gray-700 text-[10px] font-bold rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-100 hover:bg-gray-50 transition-all cursor-pointer shadow-sm">
                                <option value="">-- Pilih Toko --</option>
                                ${tokoOptions}
                            </select>
                        `}

                        <!-- Duplicate Warning Badge -->
                        ${item.isDuplicate ? `
                            <div class="flex items-center gap-1.5 bg-red-50 text-red-600 px-2.5 py-1 rounded-lg border border-red-100 shadow-sm animate-fade-in">
                                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>
                                <span class="text-[10px] font-black uppercase tracking-widest">File Sudah Ada</span>
                            </div>
                        ` : ''}
                        
                        <!-- Nominal Badge -->
                        <div class="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 shadow-sm font-bold text-blue-600">
                             <span class="text-[10px] tracking-widest">${item.nominal > 0 ? formatCurrency(item.nominal) : 'RP 0'}</span>
                        </div>

                        <!-- Date Badge (Amber Locked Style) -->
                        ${item.isDateDetected ? `
                            <div onclick="unlockDate(${i})" class="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-2.5 py-1 rounded-lg border border-amber-100 shadow-sm animate-fade-in cursor-pointer hover:bg-amber-100 transition-colors">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                <span class="text-[10px] font-black uppercase tracking-widest">${displayDate}</span>
                            </div>
                        ` : `
                            <div class="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-gray-200 shadow-sm">
                                <input type="date" value="${item.date}" onchange="setFileDate(${i}, this.value)" class="bg-transparent border-0 text-[10px] font-bold text-gray-700 p-0 outline-none w-28 cursor-pointer">
                            </div>
                        `}

                        <div class="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">
                            <span class="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none">${formatFileSize(item.file.size)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-end w-full sm:w-auto mt-4 sm:mt-0 sm:ml-4">
                <button type="button" onclick="removeFile(${i}, event)" class="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </li>
        `;
    }).join('');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ---- Form Submit (Bulk Upload via Backend API) ----
function setupForm() {
    const form = document.getElementById('upload-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = 'INVOICE'; // Always Invoice for this page

        if (selectedFiles.length === 0) {
            Toast.warning('Pilih file terlebih dahulu.');
            return;
        }

        const undetectedToko = selectedFiles.filter(f => !f.toko).length;
        if (undetectedToko > 0) {
            Toast.error(`Pilih toko untuk semua ${undetectedToko} file.`);
            return;
        }

        const duplicateCount = selectedFiles.filter(f => f.isDuplicate).length;
        if (duplicateCount > 0) {
            Toast.error(`${duplicateCount} file sudah ada di sistem. Hapus duplikat dari antrian sebelum upload.`);
            return;
        }

        const btn = document.getElementById('upload-btn');
        btn.disabled = true;
        btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div><span class="ml-2 font-bold uppercase tracking-widest">Mengupload...</span>';

        const progressContainer = document.getElementById('upload-progress-container');
        const progressPct = document.getElementById('upload-progress-pct');
        const progressBar = document.getElementById('upload-progress-bar');
        if (progressContainer) progressContainer.classList.remove('hidden');

        const CONCURRENCY_LIMIT = 5;
        let uploaded = 0;
        const total = selectedFiles.length;

        const uploadTask = async (item) => {
            try {
                const formData = new FormData();
                formData.append('file', item.file);
                formData.append('zona_id', item.toko.zona_id);
                formData.append('toko_id', item.toko.id);
                formData.append('category', category);
                formData.append('tanggal_dokumen', item.date || toLocalYYYYMMDD(new Date()));
                formData.append('tanggal_upload', toLocalYYYYMMDD(new Date()));

                // Meta scanned
                formData.append('total_jual', item.nominal || 0);
                formData.append('tipe_ppn', (item.tipe_ppn || 'REGULAR').toUpperCase());

                await API.upload('/api/files/upload', formData);
                uploaded++;

                const pct = Math.round((uploaded / total) * 100);
                if (progressPct) progressPct.textContent = `${pct}%`;
                if (progressBar) progressBar.style.width = pct + '%';
            } catch (err) {
                console.error('Upload error:', err);
                Toast.error(`Gagal upload "${item.file.name}": ${err.message}`);
            }
        };

        for (let i = 0; i < selectedFiles.length; i += CONCURRENCY_LIMIT) {
            const chunk = selectedFiles.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(item => uploadTask(item)));
        }

        Toast.success(`${uploaded}/${total} file berhasil diupload!`);
        clearFile();
        if (progressContainer) progressContainer.classList.add('hidden');
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Mulai Upload Antrean
        `;
        loadRecentUploads();
    });
}

// ---- Load Recent Uploads ----
async function loadRecentUploads() {
    const container = document.getElementById('recent-uploads');
    if (!container) return;

    try {
        const { files } = await API.get('/api/files');
        const recent = (files || []).slice(0, 5);

        if (recent.length === 0) {
            container.innerHTML = '<p class="text-sm font-medium text-gray-400 text-center py-6">Belum ada upload terbaru hari ini.</p>';
            return;
        }

        container.innerHTML = recent.map((a, i) => `
            <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100 group/recent hover:bg-white transition-all shadow-sm animate-fade-in" style="animation-delay: ${i * 50}ms">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover/recent:bg-emerald-500 group-hover/recent:text-white transition-all">
                        <svg class="w-5 h-5 text-emerald-500 group-hover/recent:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <div class="min-w-0">
                        <p class="text-[13px] font-bold text-gray-900 truncate group-hover/recent:text-emerald-700 transition-colors uppercase">${a.nama_file}</p>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${a.zonas?.nama || 'UMUM'}</span>
                            <span class="text-[10px] text-gray-300">•</span>
                            <span class="text-[10px] font-black italic text-gray-400 uppercase tracking-widest">${new Date(a.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-2 py-1 rounded-[6px] text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-600 border border-emerald-200">SUKSES</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p class="text-xs font-bold text-red-400 text-center py-6 uppercase tracking-widest">Gagal memuat riwayat upload.</p>';
    }
}
