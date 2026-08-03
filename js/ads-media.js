// ============================================================
// Ads Media Library Logic — v3.0 (Dynamic Categories)
// Drag & Drop, Bulk Upload, Dynamic Categories, Grid Rendering
// ============================================================

let allMedia = [];
let allCategories = [];
let activeCategory = 'all';
let searchQuery = '';
let searchTimeout = null;
let fileQueue = [];
let selectedIds = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;
    initDragDrop();
    initDropdownClickOutside();
    await loadCategories();
    await loadMedia();
});

// ============================================================
// CATEGORIES LOGIC
// ============================================================

async function loadCategories() {
    try {
        const token = localStorage.getItem('jwt_token');
        const res = await fetch(`${CONFIG.API_URL}/api/media-categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load categories');
        const data = await res.json();
        allCategories = data.categories || [];

        renderCategoryTabs();
        renderCategoryDropdown();

        // Select first category as default for upload
        if (allCategories.length > 0) {
            const first = allCategories[0];
            selectCategory(first.nama, first.emoji, capitalize(first.nama), `bg-${first.warna}-500/15`);
        }
    } catch (err) {
        console.error('Load Categories Error:', err);
    }
}

function renderCategoryTabs() {
    const container = document.getElementById('category-tabs');
    let html = `
        <button onclick="filterCategory('all')" data-cat="all"
            class="cat-tab ${activeCategory === 'all' ? 'active px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-white/10 bg-white/5 text-white' : 'px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-white/5 text-gray-500 hover:text-white hover:border-white/10'}">
            Semua
        </button>
    `;

    allCategories.forEach(cat => {
        const isActive = activeCategory === cat.nama;
        const cls = isActive
            ? 'active px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-white/10 bg-white/5 text-white'
            : 'px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-white/5 text-gray-500 hover:text-white hover:border-white/10';
        html += `
            <button onclick="filterCategory('${cat.nama}')" data-cat="${cat.nama}" class="cat-tab ${cls} flex items-center gap-2">
                <div class="w-4 h-4 flex items-center justify-center">${getCatSVG(cat.nama, cat.warna)}</div>
                ${capitalize(cat.nama)}
            </button>
        `;
    });
    container.innerHTML = html;
}

function renderCategoryDropdown() {
    const container = document.getElementById('dynamic-categories');
    if (allCategories.length === 0) {
        container.innerHTML = `<div class="px-4 py-3 text-sm text-gray-500 text-center">Belum ada kategori</div>`;
        return;
    }

    container.innerHTML = allCategories.map(cat => `
        <button type="button" onclick="selectCategory('${cat.nama}','${cat.warna}','${capitalize(cat.nama)}','bg-${cat.warna}-500/15')"
            class="cat-option w-full flex items-center justify-between px-4 py-3 text-sm text-gray-300 hover:bg-white/5 transition-all group">
            <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-lg bg-${cat.warna}-500/15 flex items-center justify-center">${getCatSVG(cat.nama, cat.warna)}</span>
                <div class="text-left">
                    <p class="font-medium text-white group-hover:text-indigo-400 transition-colors">${capitalize(cat.nama)}</p>
                    <p class="text-[11px] text-gray-500">${escapeHtml(cat.deskripsi)}</p>
                </div>
            </div>
            <div onclick="deleteCategory(event, ${cat.id}, '${cat.nama}')" class="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100" title="Hapus Kategori">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </div>
        </button>
    `).join('');
}

function openAddCategoryModal() {
    toggleDropdown();
    document.getElementById('add-category-modal').classList.remove('hidden');
}

function closeAddCategoryModal() {
    document.getElementById('add-category-modal').classList.add('hidden');
    document.getElementById('add-category-form').reset();
}

async function handleAddCategory(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-cat');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    const payload = {
        nama: document.getElementById('cat-nama').value,
        emoji: document.getElementById('cat-emoji').value,
        warna: document.getElementById('cat-warna').value,
        deskripsi: document.getElementById('cat-desc').value,
    };

    try {
        const token = localStorage.getItem('jwt_token');
        const res = await fetch(`${CONFIG.API_URL}/api/media-categories`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        Toast.success('Kategori baru + Folder Storage berhasil dibuat!');
        closeAddCategoryModal();
        await loadCategories();
    } catch (err) {
        Toast.error(err.message || 'Gagal membuat kategori');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan & Buat Folder';
    }
}

async function deleteCategory(event, id, nama) {
    event.stopPropagation();
    showConfirmModal(
        'Hapus Kategori',
        `Apakah Anda yakin ingin menghapus kategori "${nama}"? Data filenya tidak akan terhapus dari storage, namun kategorinya akan hilang dari sistem.`,
        async () => {
            try {
                const token = localStorage.getItem('jwt_token');
                const res = await fetch(`${CONFIG.API_URL}/api/media-categories/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Gagal hapus kategori');

                Toast.success(`Kategori "${nama}" berhasil dihapus.`);
                if (activeCategory === nama) activeCategory = 'all';
                await loadCategories();
                await loadMedia();
            } catch (err) {
                Toast.error(err.message || 'Gagal menghapus kategori');
            }
        },
        'Hapus Kategori',
        'Batal'
    );
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
}

// ============================================================
// DRAG & DROP
// ============================================================
function initDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('border-indigo-500', 'bg-indigo-500/10');
            dropZone.classList.remove('border-white/10');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
            dropZone.classList.add('border-white/10');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFilesSelected(files);
    });
}

// ============================================================
// FILE QUEUE (Bulk Support)
// ============================================================
function handleFilesSelected(files) {
    for (const f of files) {
        // Avoid duplicates
        if (!fileQueue.some(q => q.name === f.name && q.size === f.size)) {
            fileQueue.push(f);
        }
    }
    renderFileQueue();
}

function renderFileQueue() {
    const container = document.getElementById('file-queue');
    const btn = document.getElementById('btn-upload');
    const btnText = document.getElementById('btn-upload-text');

    if (fileQueue.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        btn.disabled = true;
        btnText.textContent = 'Upload';
        return;
    }

    container.classList.remove('hidden');
    btn.disabled = false;
    btnText.textContent = `Upload ${fileQueue.length} File`;

    container.innerHTML = fileQueue.map((f, i) => `
        <div class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.03] rounded-xl border border-white/5 group" id="queue-item-${i}">
            <div class="w-8 h-8 rounded-lg ${getFileIconBg(f.name)} flex items-center justify-center flex-shrink-0">
                ${getFileSVG(f.name)}
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-gray-300 truncate">${escapeHtml(f.name)}</p>
                <p class="text-[10px] text-gray-600">${formatFileSize(f.size)}</p>
            </div>
            <div class="flex items-center gap-1.5">
                <span class="text-[10px] text-gray-600 upload-status" id="status-${i}">Antri</span>
                <button onclick="removeFromQueue(${i})" class="p-1 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function removeFromQueue(index) {
    fileQueue.splice(index, 1);
    renderFileQueue();
}

function getFileIconBg(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'bg-indigo-500/15';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'bg-rose-500/15';
    if (['psd', 'ai', 'eps'].includes(ext)) return 'bg-amber-500/15';
    return 'bg-gray-500/15';
}

function getFileEmoji(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼️';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return '🎬';
    if (['psd', 'ai', 'eps'].includes(ext)) return '🎨';
    if (['pdf'].includes(ext)) return '📄';
    if (['zip', 'rar'].includes(ext)) return '📦';
    return '📁';
}

// ============================================================
// CUSTOM DROPDOWN
// ============================================================
function toggleDropdown() {
    const menu = document.getElementById('dropdown-menu');
    const arrow = document.getElementById('dropdown-arrow');
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    arrow.style.transform = isHidden ? 'rotate(180deg)' : '';
}

function selectCategory(value, warna, label, bgClass) {
    document.getElementById('media-category').value = value;
    document.getElementById('selected-cat-display').innerHTML = `
        <span class="w-8 h-8 rounded-lg ${bgClass} flex items-center justify-center text-base">${getCatSVG(value, warna)}</span>
        <span class="font-medium text-white">${label}</span>
    `;
    toggleDropdown();
}

function initDropdownClickOutside() {
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('cat-dropdown');
        const menu = document.getElementById('dropdown-menu');
        if (dropdown && !dropdown.contains(e.target) && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
            document.getElementById('dropdown-arrow').style.transform = '';
        }
    });
}

// ============================================================
// BULK UPLOAD
// ============================================================
async function startBulkUpload() {
    if (fileQueue.length === 0) return;

    const category = document.getElementById('media-category').value;
    const token = localStorage.getItem('jwt_token');
    const btn = document.getElementById('btn-upload');
    const btnText = document.getElementById('btn-upload-text');
    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressCount = document.getElementById('progress-count');

    btn.disabled = true;
    btnText.textContent = 'Mengupload...';
    progressDiv.classList.remove('hidden');

    let completed = 0;
    const total = fileQueue.length;
    let failed = 0;

    for (let i = 0; i < total; i++) {
        const file = fileQueue[i];
        const statusEl = document.getElementById(`status-${i}`);
        const itemEl = document.getElementById(`queue-item-${i}`);

        if (statusEl) statusEl.textContent = '⏳ Uploading...';
        if (statusEl) statusEl.className = 'text-[10px] text-indigo-400 upload-status';

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', category);

            const res = await fetch(`${CONFIG.API_URL}/api/ads-media/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) throw new Error('Upload failed');

            if (statusEl) statusEl.textContent = '✅ Selesai';
            if (statusEl) statusEl.className = 'text-[10px] text-emerald-400 upload-status';
            if (itemEl) itemEl.classList.add('border-emerald-500/20');
        } catch (err) {
            failed++;
            if (statusEl) statusEl.textContent = '❌ Gagal';
            if (statusEl) statusEl.className = 'text-[10px] text-red-400 upload-status';
            if (itemEl) itemEl.classList.add('border-red-500/20');
        }

        completed++;
        const pct = Math.round((completed / total) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `Mengupload ${file.name}...`;
        progressCount.textContent = `${completed}/${total}`;
    }

    // Done
    progressText.textContent = failed > 0
        ? `Selesai! ${completed - failed} berhasil, ${failed} gagal.`
        : `Semua ${total} file berhasil diupload!`;
    btnText.textContent = 'Selesai';

    Toast.success(`${completed - failed} file berhasil diupload!`);

    // Auto-close after delay
    setTimeout(() => {
        closeUploadModal();
        loadMedia();
    }, 1500);
}

// ============================================================
// MODAL CONTROLS
// ============================================================
function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    fileQueue = [];
    renderFileQueue();
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('btn-upload').disabled = true;
    document.getElementById('btn-upload-text').textContent = 'Upload';
    document.getElementById('media-file').value = '';
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadMedia() {
    showLoading(true);
    try {
        const token = localStorage.getItem('jwt_token');
        const params = new URLSearchParams();
        if (activeCategory !== 'all') params.append('category', activeCategory);
        if (searchQuery) params.append('search', searchQuery);

        const response = await fetch(`${CONFIG.API_URL}/api/ads-media?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load media');
        const data = await response.json();
        allMedia = data.media || [];
        renderGrid();
        updateStats();
    } catch (err) {
        console.error('Load Media Error:', err);
        Toast.error('Gagal memuat media.');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// RENDERING
// ============================================================
function renderGrid() {
    const grid = document.getElementById('media-grid');
    const empty = document.getElementById('empty-state');

    if (allMedia.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = allMedia.map(m => {
        const isSelected = selectedIds.includes(m.id.toString());
        return `
        <div class="glass-card rounded-2xl overflow-hidden group hover:border-indigo-500/30 border ${isSelected ? 'border-indigo-500' : 'border-white/5'} transition-all duration-300 animate-fade-in relative" id="media-card-${m.id}">
            <!-- Selection Checkbox -->
            <div class="absolute top-3 right-3 z-20">
                <input type="checkbox" 
                       class="custom-checkbox row-checkbox" 
                       data-id="${m.id}" 
                       ${isSelected ? 'checked' : ''} 
                       onclick="toggleItemSelection('${m.id}', this)">
            </div>

            <!-- Preview -->
            <div class="relative h-44 bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center overflow-hidden">
                ${getPreview(m)}
                <!-- Category Badge -->
                <span class="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${getCatBadgeColor(m.category)} flex items-center gap-1.5">
                    ${getCatSVG(m.category)}
                    ${m.category}
                </span>
                <!-- Hover Actions -->
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <a href="${CONFIG.API_URL}/api/ads-media/${m.id}/download?token=${localStorage.getItem('jwt_token')}"
                        class="p-2.5 rounded-xl bg-white/10 text-white hover:bg-indigo-500 transition-colors" title="Download" target="_blank">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                    </a>
                    <button onclick="deleteMedia(${m.id}, '${escapeHtml(m.nama_file)}')"
                        class="p-2.5 rounded-xl bg-white/10 text-white hover:bg-red-500 transition-colors" title="Hapus">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
            <!-- Info -->
            <div class="p-4 bg-white/[0.02]">
                <p class="text-sm font-medium text-white truncate mb-1" title="${escapeHtml(m.nama_file)}">${escapeHtml(m.nama_file)}</p>
                <div class="flex items-center justify-between">
                    <span class="text-[10px] text-gray-500">${formatFileSize(m.ukuran_bytes)}</span>
                    <span class="text-[10px] text-gray-600">${new Date(m.created_at).toLocaleDateString('id-ID')}</span>
                </div>
            </div>
        </div>
    `}).join('');
}

/**
 * Bulk Selection Logic
 */
function toggleSelectAll(master) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = master.checked;
        const id = cb.getAttribute('data-id');
        const card = document.getElementById(`media-card-${id}`);

        if (master.checked) {
            if (!selectedIds.includes(id)) selectedIds.push(id);
            if (card) card.classList.add('border-indigo-500');
            if (card) card.classList.remove('border-white/5');
        } else {
            selectedIds = selectedIds.filter(sid => sid !== id);
            if (card) card.classList.remove('border-indigo-500');
            if (card) card.classList.add('border-white/5');
        }
    });
    updateBulkUI();
}

function toggleItemSelection(id, cb) {
    const card = document.getElementById(`media-card-${id}`);
    if (cb.checked) {
        if (!selectedIds.includes(id)) selectedIds.push(id);
        if (card) card.classList.add('border-indigo-500');
        if (card) card.classList.remove('border-white/5');
    } else {
        selectedIds = selectedIds.filter(sid => sid !== id);
        if (card) card.classList.remove('border-indigo-500');
        if (card) card.classList.add('border-white/5');

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
        countEl.textContent = selectedIds.length;
    } else {
        bar.classList.remove('active');
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
}

function clearSelection() {
    selectedIds = [];
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.glass-card').forEach(c => {
        c.classList.remove('border-indigo-500');
        c.classList.add('border-white/5');
    });
    const master = document.getElementById('select-all');
    if (master) master.checked = false;
    updateBulkUI();
}

async function deleteSelected() {
    if (selectedIds.length === 0) return;

    showConfirmModal(
        'Hapus Media Terpilih',
        `Apakah Anda yakin ingin menghapus ${selectedIds.length} media yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
        async () => {
            const btn = document.getElementById('btn-bulk-delete');
            const originalContent = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `
                <div class="loader-mini">
                    <div class="loader-ring"></div>
                    <div class="loader-ring"></div>
                    <div class="loader-ring"></div>
                </div>
                <span>Menghapus...</span>
            `;

            try {
                const token = localStorage.getItem('jwt_token');
                const response = await fetch(`${CONFIG.API_URL}/api/ads-media/bulk`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ ids: selectedIds })
                });

                if (!response.ok) throw new Error('Gagal menghapus media massal.');

                Toast.success(`${selectedIds.length} media berhasil dihapus.`);
                clearSelection();
                loadMedia();
            } catch (err) {
                console.error('Bulk Delete Error:', err);
                Toast.error(err.message || 'Gagal menghapus media massal.');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }
        },
        'Hapus Massal',
        'Batal'
    );
}

function getPreview(media) {
    const ext = media.nama_file.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const token = localStorage.getItem('jwt_token');
    const viewUrl = `${CONFIG.API_URL}/api/ads-media/${media.id}/view?token=${token}&cb=${Date.now()}`;
    console.log(`[Preview] ${media.nama_file}: ${viewUrl}`);

    if (imageExts.includes(ext)) {
        return `
            <img src="${viewUrl}" 
                 alt="${escapeHtml(media.nama_file)}" 
                 class="w-full h-full object-cover"
                 onerror="this.parentElement.innerHTML = '<span class=\'text-gray-600 text-xs\'>Gagal muat</span>'">
        `;
    }

    if (ext === 'pdf') {
        return `
            <object data="${viewUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf" class="w-full h-full pointer-events-none overflow-hidden">
                <div class="flex items-center justify-center bg-gray-900 w-full h-full"> 
                    <svg class="w-12 h-12 text-rose-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                </div>
            </object>
        `;
    }

    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
    if (videoExts.includes(ext)) {
        return `<svg class="w-16 h-16 text-rose-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
    }

    if (['psd', 'ai', 'eps'].includes(ext)) {
        return `<svg class="w-16 h-16 text-amber-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>`;
    }

    return `<svg class="w-16 h-16 text-gray-600/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>`;
}

function updateStats() {
    document.getElementById('stat-total').textContent = allMedia.length;
    document.getElementById('stat-footage').textContent = allMedia.filter(m => m.category === 'footage').length;
    document.getElementById('stat-mentahan').textContent = allMedia.filter(m => m.category === 'mentahan').length;
    document.getElementById('stat-poster').textContent = allMedia.filter(m => m.category === 'poster').length;
}

// ============================================================
// FILTERING & SEARCH
// ============================================================
function filterCategory(cat) {
    activeCategory = cat;
    document.querySelectorAll('.cat-tab').forEach(tab => {
        if (tab.dataset.cat === cat) {
            tab.className = 'cat-tab active px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-white/10 bg-white/5 text-white';
        } else {
            tab.className = 'cat-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-white/5 text-gray-500 hover:text-white hover:border-white/10';
        }
    });
    loadMedia();
}

function handleSearch(value) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = value.trim();
        loadMedia();
    }, 400);
}

// ============================================================
// DELETE
// ============================================================
async function deleteMedia(id, name) {
    showConfirmModal(
        'Hapus Media',
        `Apakah Anda yakin ingin menghapus "${name}"? Tindakan ini tidak dapat dibatalkan.`,
        async () => {
            try {
                const token = localStorage.getItem('jwt_token');
                const res = await fetch(`${CONFIG.API_URL}/api/ads-media/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Gagal hapus media');
                Toast.success(`"${name}" berhasil dihapus.`);
                loadMedia();
            } catch (err) {
                Toast.error(err.message || 'Gagal menghapus media');
            }
        },
        'Hapus Media',
        'Batal'
    );
}

// ============================================================
// HELPERS
// ============================================================
function showLoading(show) {
    document.getElementById('loading-state').classList.toggle('hidden', !show);
    document.getElementById('media-grid').classList.toggle('hidden', show);
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getCatBadgeColor(cat) {
    const map = {
        footage: 'bg-rose-500/20 text-rose-300 border border-rose-500/20',
        mentahan: 'bg-amber-500/20 text-amber-300 border border-amber-500/20',
        poster: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20',
        lainnya: 'bg-gray-500/20 text-gray-300 border border-gray-500/20'
    };
    return map[cat] || map.lainnya;
}

function getCatSVG(cat, warna = 'gray') {
    const map = {
        footage: `<svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        mentahan: `<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>`,
        poster: `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`,
        lainnya: `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`
    };
    return map[cat] || map.lainnya;
}

function getFileSVG(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return `<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return `<svg class="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`;
    if (['psd', 'ai', 'eps'].includes(ext)) return `<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>`;
    if (['pdf'].includes(ext)) return `<svg class="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
    if (['zip', 'rar'].includes(ext)) return `<svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`;
    return `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text || '';
    return d.innerHTML;
}
