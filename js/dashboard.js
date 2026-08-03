// ============================================================
// Dashboard Logic — v2.0 (JWT + Backend API)
// Replaces direct Supabase/Drive calls
// ============================================================

let archives = [];
let filteredArchives = []; // Kept for legacy compatibility
let selectedIds = [];
let currentPage = 1;
let totalPages = 1;
let viewMode = 'active'; // 'active' or 'deleted'
let isAnomalyFilterActive = false;
let hasMoreData = true;
let isFetching = false;

// Zona cache for labels
window._zonaCache = [];
window._notifDetailsMap = {}; // Global map for notification details

// ---- Show Notification Detail Modal ----
function showNotifDetail(event, header, details, id = null) {
    if (event) event.stopPropagation(); // Prevent marking notification as read

    // Use map lookup if id is provided (prevents escaping issues)
    if (id && window._notifDetailsMap[id]) {
        header = window._notifDetailsMap[id].header;
        details = window._notifDetailsMap[id].details;
    }

    if (!header) return; // Guard

    Swal.fire({
        title: '<div class="flex items-center gap-2 px-1"><span class="text-xs font-black text-gray-900 uppercase">Detail Perbaikan</span></div>',
        html: `
            <div class="text-left py-2">
                <div class="flex items-center gap-3 mb-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                        <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p class="text-[10px] font-black text-emerald-800 uppercase tracking-widest leading-none">Status</p>
                        <p class="text-xs font-bold text-emerald-700 mt-1">Sistem Kembali Online</p>
                    </div>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">Update Utama</label>
                        <div class="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-bold text-gray-800">
                            ${header}
                        </div>
                    </div>
                    
                    ${details ? `
                    <div>
                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">Rincian Perbaikan</label>
                        <div class="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-600 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-medium">
                            ${details}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `,
        confirmButtonText: 'Tutup',
        confirmButtonColor: '#10b981',
        customClass: {
            container: 'z-[9999]',
            popup: 'rounded-[1.5rem] border-0 shadow-2xl',
            confirmButton: 'rounded-xl text-[10px] font-black uppercase px-8 py-3'
        }
    });
}

// ---- Toggle Inline Notification Detail Box ----
function toggleInlineDetail(event, id) {
    if (event) event.stopPropagation();
    const box = document.getElementById(`detail-box-${id}`);
    if (box) {
        box.classList.toggle('hidden');
    }
}

// ---- Initial Dashboard Loading State ----
// Keep one loader over the dashboard while the archive list, cards, and chart
// are all being prepared. The archive list has its own loader for refreshes,
// so this one uses a separate ID and is only removed after initial rendering.
function showDashboardInitialLoading() {
    const target = document.getElementById('main-content');
    if (!target || document.getElementById('dashboard-initial-loading')) return;

    target.style.position = 'relative';
    const loader = document.createElement('div');
    loader.id = 'dashboard-initial-loading';
    loader.className = 'absolute inset-0 z-[60] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm';
    loader.innerHTML = `
        <div class="premium-loader">
            <div class="loader-rings">
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
            </div>
            <span class="loader-text">Menyiapkan dashboard...</span>
        </div>
    `;
    target.appendChild(loader);
}

function hideDashboardInitialLoading() {
    document.getElementById('dashboard-initial-loading')?.remove();
}

// ---- Initialize Dashboard ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;

    showDashboardInitialLoading();

    try {
    setCurrentDate();
    await loadZonas();
    populateFilters();
    await loadArchives();
    loadNotifications();
    // await loadBroadcast(); // Removed: now handled globally by sidebar.js

    await loadStorageStats();
    // Chart is available to ALL roles — backend handles zone filtering
    await loadAnalyticsChart();

    // Admin controls only for super admin
    if (hasPermission('view_dashboard_stats')) {
        document.getElementById('admin-controls')?.classList.remove('hidden');
    }
    // Admin controls only for super admin / moderator
    if (hasPermission('manage_system') || user.role === 'moderator' || user.role === 'super_admin') {
        document.getElementById('maintenance-btn')?.classList.replace('hidden', 'md:flex');
        document.getElementById('btn-manage-broadcast')?.classList.remove('hidden');
        document.getElementById('stats-grid')?.classList.remove('hidden');

        loadMaintenanceStatus();
    } else {
        // Explicitly remove restricted elements for Admin Zona
        document.getElementById('maintenance-btn')?.remove();
        document.getElementById('btn-manage-broadcast')?.remove();
        document.getElementById('stats-grid')?.remove();
    }

    // Check for Post-Maintenance Update Notice (Run for ALL users)
    await checkUpdateNotice();

    // Search Visibility Logic
    if (user.role === 'super_admin') {
        // Super admins keep header search, hide dashboard search
        document.getElementById('header-search-container')?.classList.remove('hidden');
        document.getElementById('dashboard-search-container')?.classList.add('hidden');
    } else {
        // Moderator and Admin Zona get large dashboard search, hide header search
        document.getElementById('header-search-container')?.classList.add('hidden');
        document.getElementById('dashboard-search-container')?.classList.remove('hidden');
    }

    setupEventListeners();
    setupIntersectionObserver();

    // Global close for dropdowns
    document.addEventListener('click', (e) => {
        const notifDropdown = document.getElementById('notif-dropdown-parent');
        const notifMenu = document.getElementById('notif-menu');
        if (notifDropdown && !notifDropdown.contains(e.target)) {
            notifMenu?.classList.add('invisible', 'opacity-0', 'translate-y-2');
        }
    });
    } finally {
        // The chart and all statistic cards have now been rendered (or have
        // completed with an error handled by their own loaders).
        hideDashboardInitialLoading();
    }
});


// ---- Check for Post-Maintenance Update Notice ("What's New") ----
async function checkUpdateNotice() {
    try {
        console.log('[Update Notice] Checking for new updates...');
        const status = await API.get('/api/system/maintenance');

        if (!status || !status.lastResult) {
            console.log('[Update Notice] No updates found in system status.');
            return;
        }

        const lastReadId = localStorage.getItem('last_read_update_id');
        console.log(`[Update Notice] System ID: ${status.lastResult.id}, Local ID: ${lastReadId}`);

        if (lastReadId === status.lastResult.id) {
            console.log('[Update Notice] Update already read.');
            return;
        }

        // Show Modal
        console.log('[Update Notice] Displaying What\'s New modal!');
        showUpdateModal(status.lastResult);
    } catch (err) {
        console.warn('[Update Notice] Error:', err.message);
    }
}

function showUpdateModal(data) {
    const modalId = 'update-notice-modal';
    if (document.getElementById(modalId)) return;

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in';

    // Convert details list to HTML (details may be a string or an array)
    const detailsLines = data.details
        ? (Array.isArray(data.details) ? data.details : String(data.details).split('\n'))
        : [];
    const detailsHtml = detailsLines.filter(l => l.trim()).map(line =>
        `<div class="flex items-start gap-4 p-3 bg-gray-50 rounded-2xl border border-gray-100/50">
            <div class="w-2 h-2 mt-2 bg-blue-500 rounded-full shadow-sm shadow-blue-200"></div>
            <p class="text-sm font-medium text-gray-700 leading-relaxed">${line.replace(/^[-\*\+]\s*/, '')}</p>
        </div>`
    ).join('');

    modal.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 animate-scale-up border border-white/20">
            <div class="text-center mb-10">
                <div class="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner ring-4 ring-blue-50/50">
                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <h2 class="text-2xl font-black text-gray-900 leading-tight mb-2 uppercase tracking-tight">Pembaruan Selesai!</h2>
                <p class="text-sm font-bold text-blue-500/80 uppercase tracking-widest">${data.title || 'Sistem Kembali Normal'}</p>
            </div>

            <div class="space-y-3 max-h-[350px] overflow-y-auto px-1 custom-scrollbar mb-10">
                ${detailsHtml}
            </div>

            <div class="pt-2">
                <button onclick="readUpdateNotice('${data.id}')" class="w-full py-4 bg-gray-900 text-white font-black rounded-2xl hover:bg-gray-800 transition-all shadow-xl shadow-gray-200 active:scale-95 uppercase tracking-[0.2em] text-[10px]">
                    Selesai & Lanjutkan
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

window.readUpdateNotice = function (id) {
    localStorage.setItem('last_read_update_id', id);
    const modal = document.getElementById('update-notice-modal');
    if (modal) {
        modal.classList.add('opacity-0', 'scale-95');
        setTimeout(() => modal.remove(), 300);
    }
};


// ---- Set Current Date & Time-based Greeting ----
function setCurrentDate() {
    const now = new Date();

    // 1. Current Page Header Date (if still exists)
    const el = document.getElementById('current-date');
    if (el) {
        el.textContent = now.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    // 2. Banner Dynamic Greeting
    const greetingEl = document.getElementById('time-greeting');
    if (greetingEl) {
        const hour = now.getHours();
        let greeting = 'Selamat Datang';
        if (hour >= 4 && hour < 11) greeting = 'Pagi';
        else if (hour >= 11 && hour < 18) greeting = 'Siang';
        else greeting = 'Malam';
        greetingEl.textContent = greeting;
    }

    // 3. Banner Date (Indonesian Format)
    const bannerDateEl = document.getElementById('banner-date');
    if (bannerDateEl) {
        bannerDateEl.textContent = now.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    // 4. Auto-fill filter-date-end to today
    const endDate = document.getElementById('filter-date-end');
    if (endDate) {
        endDate.value = now.toISOString().split('T')[0];
    }
}

// ---- Load Zonas from API ----
async function loadZonas() {
    try {
        const { zonas } = await API.get('/api/zonas');
        window._zonaCache = zonas || [];
        if (typeof currentUser !== 'undefined' && currentUser.role === 'admin_zona') {
            await populateTokoFilter();
        }
    } catch (err) {
        console.warn('Failed to load zonas:', err);
    }
}

// ---- Populate Filter Dropdowns ----
function populateFilters() {
    // Zona dropdown (only for super admin)
    const zonaSelect = document.getElementById('filter-zona');
    const broadcastZona = document.getElementById('broadcast-zona'); // New
    if (zonaSelect || broadcastZona) {
        window._zonaCache.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z.id;
            opt.textContent = z.nama;

            if (zonaSelect) zonaSelect.appendChild(opt.cloneNode(true));
            if (broadcastZona) broadcastZona.appendChild(opt.cloneNode(true));
        });
    }

    // FIX 1: Lock zona filter for admin_zona — only show their own zona
    if (zonaSelect && currentUser && currentUser.role === 'admin_zona' && currentUser.zona_id) {
        zonaSelect.value = currentUser.zona_id;
        zonaSelect.disabled = true;
        zonaSelect.classList.add('opacity-50', 'cursor-not-allowed');
    }

    // Inverted Permit: Inject restricted options ONLY for Super Admins
    const catSelect = document.getElementById('filter-category');


    if (catSelect) {
        if (isSuperAdmin()) {
            // Unlock and Inject
            catSelect.disabled = false;
            catSelect.classList.remove('opacity-50', 'cursor-not-allowed');

            // Avoid duplicates
            if (!catSelect.querySelector('option[value=""]')) {
                const allOpt = document.createElement('option');
                allOpt.value = '';
                allOpt.textContent = 'Semua Kategori';
                catSelect.prepend(allOpt);
            }
            if (!catSelect.querySelector('option[value="PIUTANG"]')) {
                const piutangOpt = document.createElement('option');
                piutangOpt.value = 'PIUTANG';
                piutangOpt.textContent = 'Bukti Pembayaran Piutang';
                catSelect.appendChild(piutangOpt);
            }
        } else {
            // Force selection to INVOICE and ensure LOCKED for Admin Zona
            catSelect.value = 'INVOICE';
            catSelect.disabled = true;
            catSelect.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    populateTokoFilter();
}

// ---- Load Archives from Backend API ----
async function loadArchives(append = false) {
    if (isFetching || (append && !hasMoreData)) return;

    isFetching = true;
    if (!append) {
        currentPage = 1;
        archives = [];
        hasMoreData = true;
        showLoading('main-content');
    } else {
        document.getElementById('scroll-loader')?.classList.remove('hidden');
    }

    try {
        let endpoint = viewMode === 'deleted' && isSuperAdmin() ? '/api/files/trash' : '/api/files';

        const getVal = (id) => document.getElementById(id)?.value || '';
        const params = new URLSearchParams({
            page: currentPage,
            limit: CONFIG.PAGE_SIZE || 20,
            category: getVal('filter-category'),
            zona_id: getVal('filter-zona'),
            toko_id: getVal('filter-toko'),
            tipe_ppn: getVal('filter-tipe'),
            search: (document.getElementById('dashboard-search-input')?.value || '').toLowerCase(),
            // Date bounds
            start_date: getVal('filter-date-start'),
            end_date: getVal('filter-date-end')
        });

        if (isAnomalyFilterActive) {
            params.append('is_anomaly', 'true');
        }

        for (const [key, value] of Array.from(params.entries())) {
            if (!value) params.delete(key);
        }

        const res = await API.get(`${endpoint}?${params.toString()}`);

        if (res.files && res.files.length > 0) {
            archives = append ? [...archives, ...res.files] : res.files;
        } else if (!append) {
            archives = [];
        }

        totalPages = res.totalPages || 1;
        hasMoreData = currentPage < totalPages;

        filteredArchives = archives;
        renderTable();
        updateStats(res);
        if (!append) await populateTokoFilter();
    } catch (err) {
        Toast.error('Gagal memuat arsip: ' + err.message);
    } finally {
        isFetching = false;
        hideLoading();
        document.getElementById('scroll-loader')?.classList.add('hidden');
    }
}

// ---- Populate Toko Filter based on selected Zona ----
async function populateTokoFilter() {
    const tokoSelect = document.getElementById('filter-toko');
    const zonaSelect = document.getElementById('filter-zona');
    if (!tokoSelect) return;

    let zonaId = zonaSelect?.value;

    if (!zonaId && typeof currentUser !== 'undefined' && currentUser.role === 'admin_zona') {
        zonaId = currentUser.zona_id;
    }

    tokoSelect.disabled = !zonaId;

    const currentValue = tokoSelect.value;
    while (tokoSelect.options.length > 1) tokoSelect.remove(1);

    if (!zonaId) {
        tokoSelect.value = '';
        return;
    }

    try {
        const { tokos } = await API.get(`/api/toko?zona_id=${zonaId}`);
        const seenNames = new Set();
        (tokos || []).forEach(t => {
            if (seenNames.has(t.nama)) return;
            seenNames.add(t.nama);

            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nama;
            tokoSelect.appendChild(opt);
        });

        // Try to re-select
        const opts = Array.from(tokoSelect.options).map(o => o.value);
        if (opts.includes(currentValue)) {
            tokoSelect.value = currentValue;
        } else {
            tokoSelect.value = '';
        }
    } catch (err) {
        console.error('Failed to fill Toko dropdown', err);
    }
}

// ---- Update Stats ----
// Flag: apakah stat-invoice sudah diset dari Alist (sumber otoritatif)
let _alistInvoiceLoaded = false;

async function updateStats(res = {}) {
    const el = (id) => document.getElementById(id);

    try {
        // stat-invoice: jika sudah diisi dari Alist (loadStorageStats), jangan timpa
        // Hanya update jika Alist belum berhasil load
        if (!_alistInvoiceLoaded) {
            const invoiceCount = res.totalInvoice ?? res.total ?? filteredArchives.filter(a => a.category === 'INVOICE').length;
            if (el('stat-invoice')) el('stat-invoice').textContent = invoiceCount;
        }

        // stat-piutang selalu dari data arsip yang terfilter
        const piutangCount = res.totalPiutang ?? filteredArchives.filter(a => a.category === 'PIUTANG').length;
        if (el('stat-piutang')) el('stat-piutang').textContent = piutangCount;
    } catch (err) {
        console.warn('Stats update error:', err);
    }
}

// ---- Apply Filters ----
function applyFilters() {
    loadArchives(false);
}

// ---- Export CSV ----
function exportCSV() {
    if (filteredArchives.length === 0) {
        Toast.warning('Tidak ada data untuk diexport.');
        return;
    }

    const headers = ['Nama File', 'Kategori', 'Zona', 'Toko', 'Tanggal Upload', 'Status'];
    const rows = filteredArchives.map(a => [
        `"${a.nama_file}"`,
        `"${a.category}"`,
        `"${a.zonas?.nama || ''}"`,
        `"${a.toko?.nama || ''}"`,
        `"${new Date(a.created_at).toLocaleString('id-ID')}"`,
        `"${a.status}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(',') + "\n"
        + rows.map(e => e.join(',')).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Arsip_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ---- Toggle Recycle Bin ----
function toggleRecycleBin() {
    const btn = document.getElementById('btn-recycle-bin');
    if (viewMode === 'active') {
        viewMode = 'deleted';
        btn.classList.remove('text-red-400');
        btn.classList.add('text-indigo-400', 'bg-indigo-500/10');
        Toast.info('Menampilkan Recycle Bin');
    } else {
        viewMode = 'active';
        btn.classList.add('text-red-400');
        btn.classList.remove('text-indigo-400', 'bg-indigo-500/10');
        Toast.info('Menampilkan Dokumen Aktif');
    }
    loadArchives();
}

// ---- Setup Infinite Scroll ----
function setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMoreData && !isFetching) {
            currentPage++;
            loadArchives(true);
        }
    }, {
        rootMargin: '200px', // Trigger earlier for smoother experience
        threshold: 0.1
    });

    const sentinel = document.getElementById('infinite-scroll-trigger');
    if (sentinel) observer.observe(sentinel);
}

// ---- Notification System ----
let notifData = [];

window.toggleNotifMenu = function () {
    const menu = document.getElementById('notif-menu');
    if (!menu) return;

    if (menu.classList.contains('invisible')) {
        menu.classList.remove('invisible', 'opacity-0', 'translate-y-2');
        menu.classList.add('opacity-100', 'translate-y-0');
        loadNotifications(); // Refresh on open
    } else {
        menu.classList.add('invisible', 'opacity-0', 'translate-y-2');
        menu.classList.remove('opacity-100', 'translate-y-0');
    }
};

async function loadNotifications() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    try {
        const res = await API.get('/api/notifications');
        notifData = res.notifications || [];
        renderNotifications();
        updateNotifBadge();
    } catch (err) {
        list.innerHTML = `<p class="text-center py-8 text-[10px] font-bold text-red-400 uppercase">Gagal memuat</p>`;
    }
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    const btnRead = document.getElementById('btn-mark-read');
    if (!list) return;

    const unreadCount = notifData.filter(n => !n.is_read).length;
    if (btnRead) btnRead.classList.toggle('hidden', unreadCount === 0);

    if (notifData.length === 0) {
        list.innerHTML = `<p class="text-center py-8 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Belum ada notifikasi</p>`;
        return;
    }

    list.innerHTML = notifData.map(n => {
        const time = new Date(n.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const unreadClass = n.is_read ? 'bg-white' : 'bg-blue-50/60';
        const dotClass = n.is_read ? 'hidden' : '';
        let iconColor = 'text-blue-500';
        if (n.type === 'success') iconColor = 'text-emerald-500';
        if (n.type === 'warning') iconColor = 'text-amber-500';

        // --- SPECIAL UI: Maintenance Completion ---
        if (n.title.includes('Perbaikan Selesai')) {
            const parts = n.message.split(' — ');
            const header = parts[0].replace('Sistem kembali online: ', '');
            const details = parts[1] || '';
            const mapId = `notif_${n.id}`;
            window._notifDetailsMap[mapId] = { header, details };

            return `
                <div class="relative group px-4 py-3 rounded-xl ${unreadClass} hover:bg-gray-100/50 transition-all cursor-default border border-transparent hover:border-emerald-100">
                    <div class="flex items-start gap-3">
                        <div class="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0 ${dotClass}"></div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-1.5">
                                <span class="text-[11px] font-black text-gray-900 leading-none">✅ Perbaikan Selesai</span>
                                ${details ? `
                                    <button onclick="toggleInlineDetail(event, '${mapId}')" 
                                            class="text-[8px] font-black text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full animate-pulse hover:bg-emerald-500 hover:text-white transition-all shadow-sm ring-1 ring-emerald-100">
                                        DETAIL
                                    </button>` : ''}
                            </div>
                            <p class="text-[10px] font-bold text-emerald-600 mt-1 line-clamp-1">${header}</p>
                            <p class="text-[9px] text-gray-400 mt-1 font-bold uppercase">${time}</p>
                            
                            <!-- Inline Detail Card (Box) -->
                            <div id="detail-box-${mapId}" class="hidden mt-3 p-3 bg-emerald-50/50 rounded-[1.2rem] border border-emerald-100/50 transition-all duration-300 overflow-hidden">
                                <p class="text-[10px] font-black text-emerald-800 uppercase tracking-tighter mb-1.5 pb-1 border-b border-emerald-100">Rincian Perbaikan</p>
                                <p class="text-[10px] text-gray-600 leading-relaxed font-medium">${details.replace(/\n/g, '<br>')}</p>
                                <button onclick="showNotifDetail(null, null, null, '${mapId}')" class="mt-2.5 w-full py-1.5 bg-white border border-emerald-100 text-[#10b981] text-[8px] font-black uppercase rounded-lg hover:bg-emerald-50 transition-all">Lihat Mode Fokus</button>
                            </div>
                        </div>
                    </div>
                    
                    ${details ? `
                    <!-- Hover Detail Card (Positioned to the LEFT to avoid clipping) -->
                    <div class="absolute right-full mr-4 top-0 w-64 bg-white border border-emerald-100 shadow-2xl rounded-2xl p-4 opacity-0 scale-95 translate-x-[10px] group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 pointer-events-none transition-all duration-300 z-[100]">
                        <div class="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-50">
                            <div class="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span class="text-[11px] font-black text-gray-800 uppercase tracking-tight">Detail Perbaikan</span>
                        </div>
                        <p class="text-[10px] font-bold text-gray-700 leading-relaxed mb-2">${header}</p>
                        <div class="bg-emerald-50/50 rounded-xl p-2.5">
                            <p class="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap">${details}</p>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        // --- Standard UI ---
        return `
            <div class="flex items-start gap-3 px-4 py-3 rounded-xl ${unreadClass} hover:bg-gray-50 transition-all group cursor-default">
                <div class="mt-0.5 w-2 h-2 rounded-full ${iconColor} bg-current shrink-0 ${dotClass}"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-black text-gray-900 leading-snug">${n.title}</p>
                    <p class="text-[10px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">${n.message}</p>
                    <p class="text-[9px] text-gray-400 mt-1 font-bold uppercase">${time}</p>
                </div>
            </div>
        `;
    }).join('');
}

function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const hasUnread = notifData.some(n => !n.is_read);
    badge.classList.toggle('hidden', !hasUnread);
}

window.markAllNotifRead = async function () {
    try {
        await API.put('/api/notifications/read-all');
        notifData.forEach(n => n.is_read = true);
        renderNotifications();
        updateNotifBadge();
    } catch (err) {
        Toast.error('Gagal menandai notifikasi.');
    }
};

// Auto-refresh notifications every 60 seconds
setInterval(() => {
    loadNotifications();
}, 60000);

// ---- Render Table ----
function renderTable() {
    const tbody = document.getElementById('archive-body');
    const emptyState = document.getElementById('empty-state');
    const pagination = document.getElementById('pagination');

    if (!tbody) return;

    // In Infinite Scroll mode, we render ALL loaded items
    const pageItems = filteredArchives;

    if (filteredArchives.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        pagination?.classList.add('hidden');
        return;
    }

    emptyState?.classList.add('hidden');
    pagination?.classList.add('hidden'); // We now use infinite scroll instead of frontend pagination

    tbody.innerHTML = pageItems.map((a, i) => {
        let cleanName = a.nama_file.toUpperCase().replace(/^(NON\s+|PPN\s+)/i, '');
        // Strip out trailing or embedded dates like " 18 FEB"
        cleanName = cleanName.replace(/\s+\d{1,2}\s+(JAN|FEB|MAR|APR|MEI|MAY|JUN|JUL|AGU|AUG|SEP|OKT|OCT|NOV|DES|DEC)[A-Z]*\b/i, '').trim();

        const isAnomali = a.status && a.status.includes('Anomali');
        // Standardize row colors: White by default, subtle tint for unread
        const trClass = isAnomali
            ? 'bg-red-500/5 hover:bg-red-500/10 border-b border-red-500/20'
            : (a.status === 'Unread' && !isSuperAdmin()
                ? 'bg-blue-50/40 hover:bg-blue-50/60 border-b border-gray-100 shadow-sm'
                : 'bg-white hover:bg-gray-50 border-b border-gray-100');

        return `
        <tr class="animate-fade-in ${trClass} group/row text-[13px]" style="animation-delay: ${i * 30}ms">
            <td class="pl-4 pr-2">
                <input type="checkbox" class="custom-checkbox row-checkbox" data-id="${a.id}" 
                    ${selectedIds.includes(a.id) ? 'checked' : ''} 
                    onclick="toggleItemSelection('${a.id}', this)">
            </td>
            <td class="py-3 pr-4">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center border border-gray-100 ${isAnomali ? 'bg-red-50 text-red-600' : (isSuperAdmin() && a.status && a.status.includes('Read') ? 'bg-emerald-50 text-emerald-600' : (isSuperAdmin() && a.status === 'Unread' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'))}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${isSuperAdmin() && a.status && a.status.includes('Read') && !isAnomali ?
                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' :
                (isAnomali ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>' :
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>')}
                        </svg>
                    </div>
                    <div class="flex flex-col min-w-0">
                        <p class="font-bold text-xs truncate ${isAnomali ? 'text-red-600' : (a.status === 'Unread' ? 'text-blue-600' : 'text-gray-900')} transition-colors" title="${a.nama_file}">
                            ${truncate(cleanName, 35)}
                        </p>
                        <div class="flex flex-wrap gap-1 items-center mt-0.5">
                            ${isSuperAdmin() && a.status === 'Unread' && !isAnomali ? '<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-blue-50 text-blue-600 border border-blue-100 uppercase">BELUM DIBACA</span>' : ''}
                            ${isSuperAdmin() && a.status && a.status.includes('Read') && !isAnomali ? '<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase">SUDAH DIBACA</span>' : ''}
                            ${isAnomali ? '<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-red-50 text-red-600 border border-red-100 animate-pulse uppercase">ANOMALI</span>' : ''}
                            ${a.status === 'Revision' ? `<span class="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-amber-50 text-amber-600 border border-amber-100 uppercase" title="Alasan: ${a.dispute_reason || '-'}\nCatatan: ${a.dispute_note || '-'}">REVISI</span>` : ''}
                        </div>
                    </div>
                </div>
            </td>
            <td class="px-2"><span class="px-1.5 py-0.5 rounded-lg border border-gray-100 bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wider">${getCategoryLabel(a.category)}</span></td>
            <td class="px-2">
                ${a.tipe_ppn ? `<span class="px-1.5 py-0.5 rounded-md text-[9px] tracking-widest ${a.tipe_ppn === 'PPN' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'} uppercase shadow-sm">${a.tipe_ppn}</span>` : '<span class="text-gray-300 text-[10px] font-medium">-</span>'}
            </td>
            <td class="px-2 text-gray-900 text-xs whitespace-nowrap font-medium">${a.zonas?.nama || '-'}</td>
            <td class="px-2 text-gray-600 text-xs whitespace-nowrap font-normal">${a.toko?.nama?.replace(/Karawang\s+/i, 'Kwg ') || '-'}</td>
            <td class="px-2 text-gray-600 text-[11px] whitespace-nowrap font-medium">
                ${a.tanggal_dokumen ? new Date(a.tanggal_dokumen).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : (extractDateFromFilename(a.nama_file) || new Date(a.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }))}
            </td>
            <td class="px-3 text-gray-400 text-[10px] whitespace-nowrap font-medium uppercase tracking-tighter">${new Date(a.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td class="pr-4 pl-2 text-right">
                <div class="relative group flex justify-end" style="z-index: ${40 - i}">
                    <button class="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-all duration-200" title="Aksi">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                    </button>
                    <!-- Dropdown -->
                    <div class="absolute right-0 top-9 mt-1 w-40 bg-white border border-gray-100 rounded-2xl shadow-xl transition-all opacity-0 invisible group-hover:opacity-100 group-hover:visible flex flex-col py-2 z-50">
                        ${viewMode === 'active' ? `
                            <button onclick="openPreview('${a.id}', '${a.nama_file}')" class="flex items-center gap-3 px-4 py-2 text-[13px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 w-full text-left transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                Preview
                            </button>
                            <a href="${CONFIG.API_URL}/api/files/${a.id}/download?token=${API.getToken()}" class="flex items-center gap-3 px-4 py-2 text-[13px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 w-full text-left transition-colors font-medium">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                Download
                            </a>
                            ${currentUser?.role === 'admin_zona' && a.category === 'INVOICE' && a.status !== 'Revision' ? `
                                <button onclick="openDisputeModal('${a.id}', '${a.nama_file.replace(/'/g, "\\'")}')"
                                    class="flex items-center gap-3 px-4 py-2 text-[13px] text-amber-600 hover:bg-amber-50 w-full text-left transition-colors font-semibold">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
                                    Ajukan Revisi
                                </button>
                            ` : ''}
                            ${isSuperAdmin() ? `
                                <div class="h-px bg-gray-50 my-1 mx-2"></div>
                                <button onclick="copyFileLink('${a.id}', this)" class="flex items-center gap-3 px-4 py-2 text-[13px] text-gray-600 hover:text-blue-600 hover:bg-blue-50 w-full text-left transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                                    Salin Link
                                </button>
                                <button onclick="deleteArchive('${a.id}', '${a.nama_file}')" class="flex items-center gap-3 px-4 py-2 text-[13px] text-red-500 hover:bg-red-50 w-full text-left transition-colors font-medium">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    Hapus
                                </button>
                            ` : ''}
                        ` : `
                            <button onclick="restoreArchive('${a.id}', '${a.nama_file}')" class="flex items-center gap-3 px-4 py-2 text-[13px] text-emerald-600 hover:bg-emerald-50 w-full text-left transition-colors font-medium">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                Pulihkan
                            </button>
                            <button onclick="deleteArchive('${a.id}', '${a.nama_file}', true)" class="flex items-center gap-3 px-4 py-2 text-[13px] text-red-500 hover:bg-red-50 w-full text-left transition-colors font-medium">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                Hapus Permanen
                            </button>
                        `}
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    updateBulkUI();
}

// ---- Pagination ----
function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
}

// ---- Reset Filters ----
function resetFilters() {
    const searchMobile = document.getElementById('search-input-mobile');
    if (searchMobile) searchMobile.value = '';

    // reset anomaly
    isAnomalyFilterActive = false;
    const btnAnomaly = document.getElementById('btn-filter-anomaly');
    if (btnAnomaly) {
        btnAnomaly.classList.add('border-transparent');
        btnAnomaly.classList.remove('border-red-500/50', 'bg-red-500/10');
    }

    ['filter-category', 'filter-tipe', 'filter-zona', 'filter-toko', 'filter-date-start', 'filter-date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'filter-category' && !isSuperAdmin()) {
                // leave it as is
            } else {
                el.value = '';
            }
        }
    });
    loadArchives();
}

function acknowledgeFile(fileId) {
    if (currentUser?.role === 'admin_zona') {
        API.post(`/api/files/${fileId}/acknowledge`).then((res) => {
            const index = filteredArchives.findIndex(a => a.id === fileId);
            if (index !== -1 && res.status) {
                filteredArchives[index].status = res.status;
                renderTable();
            }
        }).catch(err => console.error('Acknowledge Error:', err));
    }
}

// ---- Dispute (Sanggah) System ----
let _disputeFileId = null;
let _disputeFileName = null;

function openDisputeModal(fileId, fileName) {
    _disputeFileId = fileId;
    _disputeFileName = fileName;
    const modal = document.getElementById('dispute-modal');
    if (!modal) return;
    document.getElementById('dispute-file-name').textContent = fileName;
    document.getElementById('dispute-reason').value = '';
    document.getElementById('dispute-note').value = '';
    modal.classList.remove('hidden');
}

function closeDisputeModal() {
    const modal = document.getElementById('dispute-modal');
    if (modal) modal.classList.add('hidden');
    _disputeFileId = null;
    _disputeFileName = null;
}

async function submitDispute() {
    if (!_disputeFileId) return;
    const reason = document.getElementById('dispute-reason').value;
    const note = document.getElementById('dispute-note').value.trim();

    if (!reason) {
        Toast.warning('Pilih alasan revisi terlebih dahulu.');
        return;
    }

    try {
        await API.post(`/api/files/${_disputeFileId}/dispute`, { reason, note });
        Toast.success('Permintaan revisi berhasil diajukan!');
        closeDisputeModal();

        // 1. Update the 'archives' (True Source)
        const archivesIdx = archives.findIndex(a => a.id == _disputeFileId);
        if (archivesIdx !== -1) {
            archives[archivesIdx].status = 'Revision';
            archives[archivesIdx].dispute_reason = reason;
            archives[archivesIdx].dispute_note = note;
        }

        // 2. Update the 'filteredArchives' (Current View)
        const filteredIdx = filteredArchives.findIndex(a => a.id == _disputeFileId);
        if (filteredIdx !== -1) {
            filteredArchives[filteredIdx].status = 'Revision';
            filteredArchives[filteredIdx].dispute_reason = reason;
            filteredArchives[filteredIdx].dispute_note = note;
        }

        // 3. Re-render UI
        renderTable();
        updateStats();
    } catch (err) {
        Toast.error('Gagal mengajukan revisi: ' + err.message);
    }
}

// ---- Bug Report System ----
let _bugFile = null;

function openBugModal() {
    const modal = document.getElementById('bug-modal');
    if (!modal) return;
    document.getElementById('bug-tipe').value = '';
    document.getElementById('bug-deskripsi').value = '';
    removeBugFile(); // Reset file

    const mediumRadio = document.querySelector('input[name="bug-level"][value="Medium"]');
    if (mediumRadio) mediumRadio.checked = true;
    modal.classList.remove('hidden');
}

function closeBugModal() {
    const modal = document.getElementById('bug-modal');
    if (modal) modal.classList.add('hidden');
}

// ---- Bug History for Admin Zona ----
function openBugHistoryModal() {
    const modal = document.getElementById('bug-history-modal');
    if (modal) {
        modal.classList.remove('hidden');
        loadBugHistory();
    }
}

function closeBugHistoryModal() {
    const modal = document.getElementById('bug-history-modal');
    if (modal) modal.classList.add('hidden');
}

async function loadBugHistory() {
    const list = document.getElementById('bug-history-list');
    if (!list) return;

    list.innerHTML = `
        <div class="p-12 text-center">
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">Memuat riwayat...</p>
        </div>
    `;

    try {
        const res = await API.get('/api/bugs');
        const reports = res.reports || [];

        if (reports.length === 0) {
            list.innerHTML = `
                <div class="p-12 text-center">
                    <p class="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Belum ada riwayat laporan</p>
                </div>
            `;
            return;
        }

        list.innerHTML = reports.map(b => {
            const date = new Date(b.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            let statusColor = 'bg-gray-100 text-gray-500';
            if (b.status === 'Diproses') statusColor = 'bg-amber-100 text-amber-600';
            if (b.status === 'Selesai') statusColor = 'bg-emerald-100 text-emerald-600';

            return `
                <div class="p-4 bg-gray-50/50 rounded-2xl border border-gray-100 hover:border-amber-200 transition-all group">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">${b.tipe}</span>
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${statusColor}">${b.status}</span>
                    </div>
                    <p class="text-xs font-bold text-gray-800 line-clamp-2 mb-2 leading-relaxed">${b.deskripsi}</p>
                    <div class="flex items-center justify-between text-[9px] font-bold text-gray-400 uppercase">
                        <span>🗓️ ${date}</span>
                        <span class="flex items-center gap-1">
                            ${b.tautan_file ? '📎 Ada Lampiran' : '🚫 Tanpa Lampiran'}
                        </span>
                    </div>
                    ${b.admin_notes ? `
                        <div class="mt-3 pt-3 border-t border-dashed border-gray-200">
                            <p class="text-[9px] font-black text-amber-600 uppercase mb-1">Catatan Admin:</p>
                            <p class="text-[10px] font-medium text-gray-600 italic">"${b.admin_notes}"</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        list.innerHTML = `<p class="text-center py-8 text-red-500 text-[10px] font-black uppercase">${err.message}</p>`;
    }
}

function handleBugFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        Toast.warning('Ukuran file maksimal 5MB.');
        e.target.value = '';
        return;
    }

    _bugFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('bug-preview-img').src = e.target.result;
        document.getElementById('bug-preview-container').classList.remove('hidden');
        document.getElementById('bug-upload-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

function removeBugFile(e) {
    if (e) e.preventDefault();
    _bugFile = null;
    document.getElementById('bug-file').value = '';
    document.getElementById('bug-preview-container').classList.add('hidden');
    document.getElementById('bug-upload-placeholder').classList.remove('hidden');
    document.getElementById('bug-preview-img').src = '';
}

async function submitBugReport() {
    const tipe = document.getElementById('bug-tipe').value;
    const deskripsi = document.getElementById('bug-deskripsi').value.trim();
    const level = document.querySelector('input[name="bug-level"]:checked')?.value || 'Medium';
    const btn = document.getElementById('btn-submit-bug');

    if (!tipe) {
        Toast.warning('Pilih tipe bug terlebih dahulu.');
        return;
    }
    if (!deskripsi) {
        Toast.warning('Deskripsi bug wajib diisi.');
        return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="loader-mini"><div class="loader-ring"></div><div class="loader-ring"></div><div class="loader-ring"></div></div><span>Mengirim...</span>`;

    try {
        let tautan_file = null;

        // 1. Upload File if exists
        if (_bugFile) {
            const formData = new FormData();
            formData.append('file', _bugFile);
            const uploadRes = await fetch(`${CONFIG.API_URL}/api/bugs/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${API.getToken()}` },
                body: formData
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.error || 'Gagal upload screenshot');
            tautan_file = uploadData.url;
        }

        // 2. Submit Report
        await API.post('/api/bugs', { tipe, level, deskripsi, tautan_file });

        Toast.success('Laporan bug berhasil dikirim! Terimakasih atas masukannya.');
        closeBugModal();

        // Refresh history if history modal is open or about to be
        if (!document.getElementById('bug-history-modal').classList.contains('hidden')) {
            loadBugHistory();
        }
    } catch (err) {
        Toast.error('Gagal mengirim laporan bug: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

// ---- Preview via PDF.js ----
function openPreview(fileId, fileName) {
    try {
        const modal = document.getElementById('preview-modal');
        const iframe = document.getElementById('preview-iframe');
        const title = document.getElementById('preview-title');
        const download = document.getElementById('preview-download');

        if (!modal || !iframe) {
            Toast.error('Preview modal tidak ditemukan.');
            return;
        }

        if (title) title.textContent = fileName;

        // Reset iframe to avoid showing previous document
        iframe.src = 'about:blank';

        const loading = document.getElementById('preview-loading');
        if (loading) loading.classList.remove('hidden');

        const token = API.getToken();
        const viewUrl = `${CONFIG.API_URL}/api/files/${fileId}/view?token=${token}`;
        const downloadUrl = `${CONFIG.API_URL}/api/files/${fileId}/download?token=${token}`;

        if (download) download.href = downloadUrl;

        // Show modal first, then wait for layout to fully settle before loading
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Wait for the browser to paint the modal at full size, then load the PDF
        requestAnimationFrame(() => {
            setTimeout(() => {
                iframe.src = viewUrl;
            }, 400);
        });
    } catch (err) {
        console.error('[Preview Error]', err);
        Toast.error('Gagal membuka preview: ' + err.message);
    }
}


function closePreview() {
    const modal = document.getElementById('preview-modal');
    const iframe = document.getElementById('preview-iframe');
    modal.classList.add('hidden');
    iframe.src = 'about:blank'; // Clear src to stop loading
    document.body.style.overflow = '';
}

async function copyFileLink(fileId, btnEl) {
    try {
        acknowledgeFile(fileId);
        const { token } = await API.post(`/api/files/${fileId}/share`);
        const baseUrl = CONFIG.API_URL || window.location.origin;
        const shortUrl = `${baseUrl}/api/share/${token}`;

        // Try modern Clipboard API
        try {
            await navigator.clipboard.writeText(shortUrl);
            Toast.success('Link Tautan berhasil disalin (Aktif 2 Hari)!');
        } catch (clipErr) {
            console.warn('Clipboard API failed, trying execCommand fallback:', clipErr);
            // Fallback for non-HTTPS or sensitive browsers
            const textArea = document.createElement("textarea");
            textArea.value = shortUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            Toast.success('Link Tautan berhasil disalin!');
        }

        const originalHtml = btnEl.innerHTML;
        btnEl.innerHTML = `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span class="text-emerald-400">Tersalin!</span>`;
        setTimeout(() => {
            btnEl.innerHTML = originalHtml;
        }, 2000);
    } catch (err) {
        console.error('Copy Failed:', err);
        Toast.error('Gagal menyalin link: ' + (err.message || 'Server error'));
    }
}


async function sendBroadcast() {
    const input = document.getElementById('broadcast-input');
    const zonaSelect = document.getElementById('broadcast-zona');
    const content = input?.value.trim();
    const target_zona_id = zonaSelect?.value || null;

    if (!content) return;

    try {
        await API.post('/api/broadcasts', { content, target_zona_id });
        Toast.success('Pengumuman berhasil disiarkan!');
        input.value = '';

        // Live updates — reload management list and global bar
        if (typeof window.loadGlobalBroadcast === 'function') {
            await window.loadGlobalBroadcast();
        }
        await openManageBroadcasts();
    } catch (err) {
        Toast.error('Gagal mengirim pengumuman: ' + err.message);
    }
}

// ---- Broadcast Management (Super Admin) ----
async function openManageBroadcasts() {
    const modal = document.getElementById('broadcast-manage-modal');
    const list = document.getElementById('broadcast-list');
    if (!modal || !list) return;

    list.innerHTML = '<div class="py-10 flex justify-center"><div class="premium-loader"><div class="loader-rings"><div class="loader-ring"></div><div class="loader-ring"></div><div class="loader-ring"></div></div></div></div>';
    modal.classList.remove('hidden');

    try {
        const { broadcasts } = await API.get('/api/broadcasts');
        if (!broadcasts || broadcasts.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-500 py-10 text-sm">Belum ada riwayat pengumuman.</p>';
            return;
        }

        list.innerHTML = broadcasts.map(b => `
            <div class="glass-card p-4 rounded-2xl border border-white/5 flex items-center justify-between group">
                <div class="flex-1 min-w-0 pr-4">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-tighter">
                            ${b.zonas?.nama || 'Semua Zona'}
                        </span>
                        <span class="text-[10px] text-gray-500">${new Date(b.created_at).toLocaleString('id-ID')}</span>
                    </div>
                    <p class="text-sm text-gray-700 truncate" title="${b.content}">${b.content}</p>
                </div>
                <button onclick="deleteBroadcast('${b.id}')" class="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = `<p class="text-center text-red-400 py-10 text-sm">${err.message}</p>`;
    }
}

function closeBroadcastManage() {
    document.getElementById('broadcast-manage-modal')?.classList.add('hidden');
}

async function deleteBroadcast(id) {
    showConfirm(
        'Hapus Pengumuman',
        'Apakah Anda yakin ingin menghapus pengumuman ini? Tindakan ini tidak dapat dibatalkan.',
        async () => {
            try {
                await API.del(`/api/broadcasts/${id}`);
                Toast.success('Pengumuman dihapus');
                openManageBroadcasts(); // Refresh list
                if (typeof window.loadGlobalBroadcast === 'function') {
                    await window.loadGlobalBroadcast();
                }
            } catch (err) {
                Toast.error('Gagal menghapus: ' + err.message);
            }
        }
    );
}

// ---- Storage Stats ----
async function loadStorageStats() {
    try {
        // Jalankan paralel: stats DB + stats Alist live
        const [stats, alistStats] = await Promise.allSettled([
            API.get('/api/stats/storage'),
            API.get('/api/stats/alist')
        ]);

        // 1. Storage usage (dari DB)
        if (stats.status === 'fulfilled') {
            const { total_bytes, today_bytes, limit_bytes } = stats.value;
            const storageEl = document.getElementById('stat-storage');
            const progressEl = document.getElementById('stat-storage-progress');
            if (storageEl) {
                // Gunakan bytes dari Alist jika respons valid (termasuk nilai 0), fallback ke DB
                const alistBytes = alistStats.status === 'fulfilled' ? alistStats.value.total_bytes : null;
                const usedBytes = (alistBytes != null) ? alistBytes : total_bytes;
                const usedGB = (usedBytes / (1024 ** 3)).toFixed(2);
                const totalGB = ((limit_bytes || (1024 ** 4)) / (1024 ** 3)).toFixed(0);
                storageEl.textContent = `${usedGB} / ${totalGB} GB`;
                if (progressEl) {
                    const percent = Math.min((usedBytes / (limit_bytes || (1024 ** 4))) * 100, 100);
                    progressEl.style.width = percent + '%';
                }
            }

            // 2. Today's Usage (tetap dari DB)
            const todayEl = document.getElementById('stat-storage-today');
            if (todayEl) {
                if (today_bytes >= 1024 ** 2) {
                    todayEl.textContent = (today_bytes / (1024 ** 2)).toFixed(2) + ' MB';
                } else {
                    todayEl.textContent = (today_bytes / 1024).toFixed(1) + ' KB';
                }
            }
        }

        // 3. Total Arsip — dari Alist (file nyata di Terabox)
        const invoiceEl = document.getElementById('stat-invoice');
        if (invoiceEl && alistStats.status === 'fulfilled') {
            const count = alistStats.value.total_files ?? 0;
            invoiceEl.textContent = count.toLocaleString('id-ID');
            _alistInvoiceLoaded = true; // jangan timpa dengan data DB
        }
    } catch (err) {
        console.warn('Failed to load storage stats:', err);
    }
}

// ---- Analytics Chart ----
let analyticsChartInstance = null;
async function loadAnalyticsChart() {
    try {
        const stats = await API.get('/api/stats/chart');
        console.log('[DEBUG_CHART] Frontend received stats:', stats);
        const ctx = document.getElementById('analyticsChart');
        if (!ctx) return;

        // ========== ADMIN ZONA: Single-Zone Premium Card ==========
        const isZoneAdmin = currentUser?.role === 'admin_zona';
        if (isZoneAdmin && stats.labels?.length <= 2) {
            const chartCard = ctx.closest('.glass-card');
            if (!chartCard) return;

            const zoneName = stats.labels[0] || 'Zona Anda';
            const totalValue = stats.values[0] || 0;
            const formatted = new Intl.NumberFormat('id-ID', {
                style: 'currency', currency: 'IDR',
                minimumFractionDigits: 0, maximumFractionDigits: 0
            }).format(totalValue);
            const invoiceCount = (typeof archives !== 'undefined' ? archives : []).filter(a => a.category === 'INVOICE').length;
            const piutangCount = (typeof archives !== 'undefined' ? archives : []).filter(a => a.category === 'PIUTANG').length;

            chartCard.style.background = 'linear-gradient(180deg, rgba(16,185,129,0.05) 0%, transparent 100%)';
            chartCard.style.borderColor = 'rgba(16,185,129,0.15)';
            chartCard.innerHTML = `
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-gray-900 font-semibold text-sm flex items-center gap-2">
                        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Ringkasan Invoice — ${zoneName}
                    </h3>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 tracking-wider uppercase">Zona Anda</span>
                </div>
                <div class="rounded-2xl p-6 border border-emerald-500/10 mb-4"
                     style="background: linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%);">
                    <p class="text-xs text-emerald-400/70 font-medium uppercase tracking-wider mb-2">Total Nilai Invoice Merah</p>
                    <p class="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">${formatted}</p>
                    <div class="flex items-center gap-2 mt-3">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                            📄 ${invoiceCount} Invoice
                        </span>
                    </div>
                </div>
            `;
            return;
        }

        if (analyticsChartInstance) {
            analyticsChartInstance.destroy();
        }

        // Create gradient fill
        const chartCtx = ctx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.7)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.4)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.1)');

        const hoverGradient = chartCtx.createLinearGradient(0, 0, 0, 300);
        hoverGradient.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
        hoverGradient.addColorStop(1, 'rgba(239, 68, 68, 0.5)');

        analyticsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: stats.labels,
                datasets: [{
                    label: 'Total Nilai Invoice (Rp)',
                    data: stats.values,
                    backgroundColor: gradient,
                    borderColor: 'rgba(239, 68, 68, 0.6)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                    hoverBackgroundColor: hoverGradient,
                    hoverBorderColor: 'rgb(239, 68, 68)',
                    hoverBorderWidth: 2,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: '#4b5563',
                            font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            padding: 16
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        titleFont: { family: "'Inter', sans-serif", weight: '600', size: 13 },
                        bodyFont: { family: "'Inter', sans-serif", size: 12 },
                        displayColors: false,
                        callbacks: {
                            title: function (items) {
                                return '📍 ' + items[0].label;
                            },
                            label: function (context) {
                                const val = context.parsed.y;
                                if (val === 0) return '  Belum ada data';
                                const formatted = new Intl.NumberFormat('id-ID', {
                                    style: 'currency', currency: 'IDR',
                                    minimumFractionDigits: 0, maximumFractionDigits: 0
                                }).format(val);
                                return '  💰 ' + formatted;
                            },
                            afterLabel: function (context) {
                                const val = context.parsed.y;
                                if (val === 0) return '';
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((val / total) * 100).toFixed(1);
                                return '  📊 ' + pct + '% dari total';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: {
                            color: 'rgba(0,0,0,0.05)',
                            drawTicks: false
                        },
                        ticks: {
                            color: '#4b5563',
                            font: { family: "'Inter', sans-serif", size: 10, weight: '500' },
                            padding: 8,
                            callback: function (value) {
                                if (value === 0) return 'Rp 0';
                                if (value >= 1000000000) return 'Rp ' + (value / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
                                if (value >= 1000000) return 'Rp ' + (value / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' Jt';
                                if (value >= 1000) return 'Rp ' + (value / 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' Rb';
                                return 'Rp ' + value.toLocaleString('id-ID');
                            }
                        }
                    },
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: '#4b5563',
                            font: { family: "'Inter', sans-serif", size: 10, weight: '500' },
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 45,
                            padding: 4
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.warn('Failed to load chart:', err);
    }
}

// ---- Soft Delete / Hard Delete (Super Admin) ----
async function deleteArchive(id, fileName, isHardDelete = false) {
    const msg = isHardDelete
        ? `Apakah Anda yakin ingin MENGHAPUS PERMANEN "${fileName}"? Tindakan ini tidak dapat dibatalkan.`
        : `Apakah Anda yakin ingin memindahkan "${fileName}" ke Tong Sampah?`;

    showConfirm(
        isHardDelete ? 'Hapus Permanen' : 'Pindahkan ke Sampah',
        msg,
        async () => {
            try {
                const endpoint = isHardDelete
                    ? `/api/files/${id}?hard=true`
                    : `/api/files/${id}`;

                await API.del(endpoint);
                Toast.success(isHardDelete ? 'Arsip dihapus permanen' : 'Arsip dipindahkan ke Sampah');
                await loadArchives();
            } catch (err) {
                Toast.error('Gagal menghapus: ' + err.message);
            }
        },
        'Hapus'
    );
}

// ---- Restore Archive ----
function toggleAnomalyFilter() {
    isAnomalyFilterActive = !isAnomalyFilterActive;
    const btn = document.getElementById('btn-filter-anomaly');
    if (isAnomalyFilterActive) {
        btn.classList.remove('border-transparent');
        btn.classList.add('border-red-500/50', 'bg-red-500/10');
    } else {
        btn.classList.add('border-transparent');
        btn.classList.remove('border-red-500/50', 'bg-red-500/10');
    }
    loadArchives();
}

async function restoreArchive(id, fileName) {
    showConfirm(
        'Pulihkan Arsip',
        `Kembalikan arsip "${fileName}" menjadi aktif kembali?`,
        async () => {
            try {
                await API.put(`/api/files/${id}/restore`);
                Toast.success('Arsip berhasil dipulihkan');
                await loadArchives();
            } catch (err) {
                Toast.error('Gagal memulihkan: ' + err.message);
            }
        },
        'Pulihkan'
    );
}

// ---- Event Listeners ----
function setupEventListeners() {
    // Filters
    ['filter-category', 'filter-tipe', 'filter-zona', 'filter-toko', 'filter-date-start', 'filter-date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                if (id === 'filter-zona') populateTokoFilter();
                applyFilters();
            });
        }
    });

    // Search (trigger on Enter key only)
    const searchInput = document.getElementById('search-input');
    const searchMobile = document.getElementById('search-input-mobile');
    const searchOnEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); applyFilters(); } };

    if (searchInput) searchInput.addEventListener('keydown', searchOnEnter);
    if (searchMobile) searchMobile.addEventListener('keydown', searchOnEnter);

    // Close preview on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePreview();
    });
}

document.addEventListener('DOMContentLoaded', setupEventListeners);

/**
 * Parses patterns like "17 FEB" or "2 MAR" from filename.
 * Used as fallback if database field is empty.
 */
function extractDateFromFilename(name) {
    if (!name) return null;
    const text = name.toUpperCase();

    // 1. DD/MM/YYYY or DD-MM-YYYY
    const dmyRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/;
    const dmyMatch = text.match(dmyRegex);
    if (dmyMatch) {
        let y = dmyMatch[3];
        if (y.length === 2) y = '20' + y;
        const m = dmyMatch[2].padStart(2, '0');
        const d = dmyMatch[1].padStart(2, '0');
        return `${d}/${m}/${y}`;
    }

    // 2. YYYY/MM/DD or YYYY-MM-DD
    const ymdRegex = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
    const ymdMatch = text.match(ymdRegex);
    if (ymdMatch) {
        const y = ymdMatch[1];
        const m = ymdMatch[2].padStart(2, '0');
        const d = ymdMatch[3].padStart(2, '0');
        return `${d}/${m}/${y}`;
    }

    const months = {
        'JAN': '01', 'FEB': '02', 'PEB': '02', 'MAR': '03', 'APR': '04',
        'MEI': '05', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AGU': '08',
        'AUG': '08', 'SEP': '09', 'OKT': '10', 'OCT': '10', 'NOV': '11',
        'NOP': '11', 'DES': '12', 'DEC': '12'
    };

    // 3. DD MMM (e.g. 17 FEB or 2 MAR, 17FEB, 2MAR)
    // Matches 1-2 digits followed optionally by space then 3 letters
    const regex = /(\d{1,2})\s*([A-Z]{3})/i;
    const match = text.match(regex);
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthAbbr = match[2];
        const month = months[monthAbbr];
        if (month) {
            const year = new Date().getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    return null;
}

/**
 * Bulk Selection Logic
 */
function toggleSelectAll(master) {
    if (master.checked) {
        selectedIds = filteredArchives.map(a => a.id);
    } else {
        selectedIds = [];
    }

    // Sync UI for the current page only
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = master.checked;
    });

    updateBulkUI();
}

function toggleItemSelection(id, cb) {
    if (cb.checked) {
        if (!selectedIds.includes(id)) selectedIds.push(id);
    } else {
        selectedIds = selectedIds.filter(sid => sid !== id);
        // Uncheck master if one unselected
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
    updateBulkUI();
}

function updateBulkUI() {
    const bar = document.getElementById('bulk-action-bar');
    const countEl = document.getElementById('selected-count');

    if (!bar || !countEl) return;

    if (selectedIds.length >= 3) {
        bar.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
        bar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
        countEl.textContent = selectedIds.length;
    } else {
        bar.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
        bar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
}

function clearSelection() {
    selectedIds = [];
    const checkboxes = document.querySelectorAll('.custom-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateBulkUI();
}

async function bulkDownloadSelected() {
    if (selectedIds.length === 0) return;

    const btn = document.getElementById('btn-bulk-download');
    const originalContent = btn.innerHTML;
    btn.disabled = true;

    try {
        // ZIP Bulk Download via Backend
        btn.innerHTML = `
            <div class="loader-mini">
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
            </div>
            <span>Zipping...</span>
        `;

        const token = API.getToken();
        const downloadUrl = `${CONFIG.API_URL}/api/files/bulk-download?token=${token}`;

        // We use a hidden form to send a large number of IDs via POST 
        // while still allowing the browser to handle the resulting stream as a download.
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = downloadUrl;
        form.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'ids';
        input.value = selectedIds.join(',');
        form.appendChild(input);

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);

        // Give it some time before resetting UI
        setTimeout(() => {
            Toast.success('Proses ZIP dimulai. Tunggu hingga download selesai.');
            btn.disabled = false;
            btn.innerHTML = originalContent;
            clearSelection();
        }, 3000);
    } catch (err) {
        console.error('Bulk Download Error:', err);
        Toast.error('Gagal mendownload berkas masal.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        clearSelection();
    }
}

async function bulkDeleteSelected() {
    if (selectedIds.length === 0) return;

    showConfirm(
        viewMode === 'active' ? 'Pindahkan ke Sampah' : 'Hapus Permanen',
        viewMode === 'active'
            ? `Apakah Anda yakin ingin memindahkan ${selectedIds.length} berkas ke Tong Sampah?`
            : `HAPUS PERMANEN ${selectedIds.length} berkas? Tindakan ini tidak dapat dibatalkan.`,
        async () => {
            const btn = document.getElementById('btn-bulk-delete');
            const originalContent = btn.innerHTML;
            btn.disabled = true;

            try {
                const endpoint = viewMode === 'active'
                    ? '/api/files/bulk-delete'
                    : '/api/files/bulk-trash-delete';

                await API.post(endpoint, { ids: selectedIds });

                Toast.success(`${selectedIds.length} arsip berhasil dihapus.`);
                clearSelection();
                await loadArchives();
            } catch (err) {
                Toast.error('Gagal menghapus: ' + err.message);
            } finally {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        },
        'Hapus',
        'Batal',
        false // Solid Light Theme
    );
}

// ============================================================
// REQUEST TIKET (MODAL LOGIC)
// ============================================================

function openRequestModal() {
    const modal = document.getElementById('request-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('request-input').value = '';
        document.getElementById('request-input').focus();
    }
}

function closeRequestModal() {
    const modal = document.getElementById('request-modal');
    if (modal) modal.classList.add('hidden');
}

async function submitRequest() {
    const btnSubmit = document.getElementById('btn-submit-request');
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
    `;
    btnSubmit.disabled = true;

    try {
        await API.post('/api/requests', { pesan });
        Toast.success('Pesan berhasil dikirim ke ANKA');
        closeRequestModal();
    } catch (err) {
        Toast.error('Gagal mengirim request: ' + err.message);
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
}

async function loadRequestHistory() {
    const loader = document.getElementById('history-loading');
    const emptyState = document.getElementById('history-empty');
    const tbody = document.getElementById('request-history-body');

    loader.classList.remove('hidden');
    emptyState.classList.add('hidden');
    tbody.innerHTML = '';

    try {
        const res = await API.get('/api/requests?limit=50');
        const list = res.requests || [];

        if (list.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            list.forEach(item => {
                let statusClass = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
                if (item.status === 'Selesai') statusClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                else if (item.status === 'Ditolak') statusClass = 'text-red-400 bg-red-500/10 border-red-500/20';

                let notesHtml = '';
                if (item.status === 'Ditolak' && item.notes) {
                    notesHtml = `<p class="text-xs text-red-400/90 mt-1 italic leading-relaxed">Alasan Ditolak: ${item.notes}</p>`;
                }

                const tr = document.createElement('tr');
                tr.className = 'border-b border-white/5 hover:bg-white/5 transition-colors';
                tr.innerHTML = `
                    <td class="py-3 text-gray-300 align-top">${new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td class="py-3 text-white font-medium align-top">
                        ${item.pesan}
                        ${notesHtml}
                    </td>
                    <td class="py-3 text-right align-top">
                        <span class="px-2 py-1 rounded text-xs border ${statusClass} inline-block whitespace-nowrap">${item.status}</span>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        Toast.error('Gagal memuat riwayat: ' + err.message);
    } finally {
        loader.classList.add('hidden');
    }
}

function openRequestHistoryModal() {
    const modal = document.getElementById('request-history-modal');
    if (modal) {
        modal.classList.remove('hidden');
        loadRequestHistory();
    }
}

function closeRequestHistoryModal() {
    const modal = document.getElementById('request-history-modal');
    if (modal) modal.classList.add('hidden');
}

// ---- Maintenance Mode ----
async function loadMaintenanceStatus() {
    try {
        const sys = await API.get('/api/system/maintenance');
        updateMaintenanceUI(sys.isMaintenance);
    } catch (err) {
        console.warn('Failed to load maintenance status:', err);
    }
}

function updateMaintenanceUI(isActive) {
    const btn = document.getElementById('maintenance-btn');
    const text = document.getElementById('maintenance-text');
    const ping = document.getElementById('maintenance-ping');
    const dot = document.getElementById('maintenance-dot');

    if (!btn) return;

    // Set data attribute for reliable state tracking
    btn.dataset.maintenance = isActive ? 'active' : 'inactive';

    if (isActive) {
        btn.className = 'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all duration-300 shadow-lg shadow-red-500/20 cursor-pointer';
        text.textContent = 'PERBAIKAN AKTIF';
        ping.classList.remove('hidden');
        dot.className = 'relative inline-flex rounded-full h-3 w-3 bg-red-500';
    } else {
        btn.className = 'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold bg-gray-500/10 text-gray-400 border border-white/5 hover:bg-white/5 transition-all duration-300 cursor-pointer';
        text.textContent = 'Mode Perbaikan';
        ping.classList.add('hidden');
        dot.className = 'relative inline-flex rounded-full h-3 w-3 bg-gray-500';
    }
}

async function toggleMaintenance() {
    const btn = document.getElementById('maintenance-btn');
    if (!btn) return;

    const currentStatus = btn.dataset.maintenance || (document.getElementById('maintenance-text').textContent === 'PERBAIKAN AKTIF' ? 'active' : 'inactive');
    const isActive = currentStatus === 'active';

    if (isActive) {
        const formHtml = `
            <div class="space-y-4 text-left">
                <p class="text-[11px] text-gray-500 leading-relaxed">Dokumentasikan perbaikan ini agar user tahu apa saja yang telah diperbarui saat mereka login nanti.</p>
                <div>
                    <label class="block text-[10px] uppercase tracking-widest text-gray-500 mb-1 font-bold">Judul Perbaikan</label>
                    <select id="maint-res-title" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all cursor-pointer">
                        <option value="" disabled selected>Pilih Kategori...</option>
                        <option value="Update Website">Update Website</option>
                        <option value="Perbaikan Bug">Perbaikan Bug</option>
                        <option value="Optimalisasi Sistem">Optimalisasi Sistem</option>
                        <option value="Lainnya">Lainnya</option>
                    </select>
                </div>
                <div id="maint-details-container" class="space-y-3">
                    <label class="block text-[10px] uppercase tracking-widest text-gray-500 mb-1 font-bold">Detail Perbaikan</label>
                    <div class="maint-detail-item flex gap-2">
                        <input type="text" class="maint-detail-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all" placeholder="Contoh: Loading halaman lebih cepat">
                    </div>
                </div>
                <button type="button" id="btn-add-detail" class="w-full py-3 rounded-xl border border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 text-xs font-bold transition-all flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                    Tambah Detail
                </button>
            </div>
        `;

        showConfirm(
            'Selesaikan Perbaikan',
            formHtml,
            async () => {
                const title = document.getElementById('maint-res-title').value;
                const details = Array.from(document.querySelectorAll('.maint-detail-input')).map(i => i.value.trim()).filter(v => v);

                if (!title) {
                    Toast.error('Harap pilih judul perbaikan');
                    return false;
                }
                if (details.length === 0) {
                    Toast.error('Harap isi minimal satu detail');
                    return false;
                }

                await API.put('/api/system/maintenance', { is_maintenance: false, result: { title, details } });
                Toast.success('Sistem kembali Online');
                loadMaintenanceStatus();
                return true;
            },
            'Simpan & Selesaikan',
            'Batal',
            false // Light mode
        );

        // Handle dynamic detail inputs
        setTimeout(() => {
            const addBtn = document.getElementById('btn-add-detail');
            const container = document.getElementById('maint-details-container');
            if (addBtn && container) {
                addBtn.onclick = () => {
                    const div = document.createElement('div');
                    div.className = 'maint-detail-item flex gap-2 animate-fade-in';
                    div.innerHTML = `
                        <input type="text" class="maint-detail-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all" placeholder="Detail tambahan...">
                        <button onclick="this.parentElement.remove()" class="p-3 text-gray-400 hover:text-red-500 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    `;
                    container.appendChild(div);
                };
            }
        }, 100);

    } else {
        showConfirm(
            'Aktifkan Perbaikan',
            'Sistem akan masuk ke mode perbaikan. Semua Admin Zona akan otomatis diperintahkan logout.',
            async () => {
                await API.put('/api/system/maintenance', { is_maintenance: true });
                Toast.success('Mode Perbaikan Aktif');
                loadMaintenanceStatus();
                return true;
            },
            'Aktifkan Sekarang',
            'Batal',
            false // Light default for Premium look
        );
    }
}

// ---- Search Synchronization ----
function syncSearch(value) {
    const dashboardSearch = document.getElementById('dashboard-search-input');

    // Update input to stay in sync (useful for programmatic calls)
    if (dashboardSearch) dashboardSearch.value = value;

    // Trigger search logic
    currentPage = 1;
    loadArchives();
}
