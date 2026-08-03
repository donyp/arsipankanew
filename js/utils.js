// ============================================================
// Utility Functions - Toast, Modals, Helpers
// ============================================================

// ---- Toast Notification System ----
const Toast = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'fixed top-6 right-6 z-[9999] flex flex-col gap-3';
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3500) {
        this.init();

        const icons = {
            success: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
            error: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            warning: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>`,
            info: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        };

        const colors = {
            success: 'bg-[#ecfdf5]/95 border-[#10b981]/30 text-[#065f46]',
            error: 'bg-[#fef2f2]/95 border-[#ef4444]/30 text-[#991b1b]',
            warning: 'bg-[#fffbeb]/95 border-[#f59e0b]/30 text-[#92400e]',
            info: 'bg-[#f0f9ff]/95 border-[#0ea5e9]/30 text-[#075985]'
        };

        const toast = document.createElement('div');
        toast.className = `toast-item flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-xl bg-gradient-to-r ${colors[type]} to-transparent shadow-2xl min-w-[320px] max-w-[420px] animate-slide-in`;
        toast.innerHTML = `
            <span class="flex-shrink-0">${icons[type]}</span>
            <span class="text-sm font-medium flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('animate-slide-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// ---- Standardized Modals (Replacement for alert/confirm) ----
function showAlert(title, message, onOk) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-md animate-fade-in';
    overlay.innerHTML = `
        <div class="relative bg-gray-900/95 border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-scale-in text-center">
            <div class="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
            <p class="text-gray-400 text-sm mb-8 leading-relaxed">${message}</p>
            <button id="alert-ok" class="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/25 transition-all duration-200">
                Lanjutkan
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#alert-ok').addEventListener('click', () => {
        overlay.remove();
        if (onOk) onOk();
    });
}

function showConfirm(title, message, onConfirm, okText = 'Konfirmasi', cancelText = 'Batal', isDark = false) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-md animate-fade-in';

    // Switch to Light Premium theme by default, matching Image 1-3
    const bgColor = isDark ? 'bg-[#1e293b]/95' : 'bg-white/95';
    const textColor = isDark ? 'text-white' : 'text-gray-900';
    const subTextColor = isDark ? 'text-gray-300' : 'text-gray-500';

    overlay.innerHTML = `
        <div class="relative ${bgColor} border ${isDark ? 'border-white/10' : 'border-gray-100'} rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scale-in">
            <div class="flex items-start gap-4 mb-6">
                <div class="flex-shrink-0 w-12 h-12 rounded-xl ${isDark ? 'bg-red-500/20' : 'bg-red-50'} text-red-500 flex items-center justify-center border ${isDark ? 'border-red-500/20' : 'border-red-100'}">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <div>
                    <h3 class="text-xl font-bold ${textColor} mb-1">${title}</h3>
                    <p class="${subTextColor} text-sm leading-relaxed font-medium">${message}</p>
                </div>
            </div>
            <div class="flex gap-3">
                <button id="confirm-cancel" class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all duration-200">${cancelText}</button>
                <button id="confirm-ok" class="flex-1 px-8 py-3.5 rounded-2xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/25 transition-all duration-200">${okText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.remove());

    const okBtn = overlay.querySelector('#confirm-ok');
    okBtn.addEventListener('click', async () => {
        try {
            // Add loading state
            const originalContent = okBtn.innerHTML;
            okBtn.disabled = true;
            okBtn.innerHTML = `
                <div class="flex items-center justify-center gap-2">
                    <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Memproses...</span>
                </div>
            `;

            const result = await onConfirm();

            // If callback specifically returns false, don't close (useful for validation errors)
            if (result !== false) {
                overlay.remove();
            } else {
                // Restore button if we stay open
                okBtn.disabled = false;
                okBtn.innerHTML = originalContent;
            }
        } catch (err) {
            console.error('[showConfirm] Error in callback:', err);
            // okBtn.disabled = false; // Restore button on error?
            // Actually, stay open but restore button
            okBtn.disabled = false;
            okBtn.innerHTML = originalContent;
        }
    });
}

// ---- Loading Spinner ----
function showLoading(targetId = 'main-content') {
    const target = document.getElementById(targetId);
    if (!target) return;

    const loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.className = 'absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm rounded-2xl';
    loader.innerHTML = `
        <div class="premium-loader">
            <div class="loader-rings">
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
            </div>
            <span class="loader-text">Memuat data...</span>
        </div>
    `;
    target.style.position = 'relative';
    target.appendChild(loader);
}

function hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.remove();
}

// ---- Date Formatting ----
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- Category Label ----
function getCategoryLabel(value) {
    const cat = CONFIG.CATEGORIES.find(c => c.value === value);
    return cat ? cat.label : value;
}

function getCategoryColor(value) {
    const colors = {
        'PPN': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'NON_PPN': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'INVOICE': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        'PIUTANG': 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    };
    return colors[value] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
}

// ---- Zone Label ----
function getZoneLabel(value) {
    const zone = CONFIG.ZONES.find(z => z.value === value);
    return zone ? zone.label : value;
}

// ---- Debounce ----
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- Truncate Text ----
function truncate(str, len = 40) {
    if (!str) return '';
    // Strip .pdf extension for display if requested
    const cleanStr = str.replace(/\.pdf$/i, '');
    return cleanStr.length > len ? cleanStr.substring(0, len) + '...' : cleanStr;
}

// ---- Currency Formatting ----
function formatCurrency(val) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(val);
}
