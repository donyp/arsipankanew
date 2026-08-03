let currentPage = 1;
let totalPages = 1;
let isFetching = false;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth('super_admin');
    if (!user) return;

    // Use global currentUser from auth.js if needed, or the returned user
    document.querySelector('[data-user-name]').textContent = currentUser.name;
    document.querySelector('[data-user-role-label]').textContent = getRoleLabel(currentUser);

    loadLogs();
});

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('active');
}

async function loadLogs() {
    if (isFetching) return;
    isFetching = true;

    const tbody = document.getElementById('table-body');
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const pagination = document.getElementById('pagination');

    tbody.innerHTML = '';
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    pagination.classList.add('hidden');

    try {
        const res = await API.get(`/api/audit-logs?page=${currentPage}&limit=20`);
        loadingState.classList.add('hidden');

        if (!res.logs || res.logs.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        totalPages = res.totalPages;
        renderLogs(res.logs);

        // Setup Pagination
        pagination.classList.remove('hidden');
        document.getElementById('page-info').textContent = `Menampilkan halaman ${currentPage} dari ${Math.max(1, totalPages)}`;
        document.getElementById('btn-prev').disabled = currentPage <= 1;
        document.getElementById('btn-next').disabled = currentPage >= totalPages;

    } catch (err) {
        console.error('Failed to load audit logs', err);
        Toast.error('Gagal memuat log aktivitas');
        loadingState.classList.add('hidden');
    } finally {
        isFetching = false;
    }
}

function renderLogs(logs) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = logs.map((log, i) => {
        const date = new Date(log.created_at);
        const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

        let actionColor = 'text-gray-600 bg-gray-100 border-gray-200';
        if (log.action.includes('Delete') || log.action.includes('Trash')) actionColor = 'text-red-400 bg-red-500/10 border-red-500/20';
        else if (log.action.includes('Upload') || log.action.includes('Restore')) actionColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        else if (log.action.includes('Edit') || log.action.includes('Update')) actionColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';

        return `
        <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors animate-fade-in" style="animation-delay: ${i * 30}ms">
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                        ${(log.users?.name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                        <p class="text-gray-900 font-bold truncate max-w-[150px] sm:max-w-[200px]">${log.users?.name || 'Unknown'}</p>
                        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-tight">${log.users?.role || '-'}</p>
                    </div>
                </div>
            </td>
            <td class="p-4">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide border ${actionColor} uppercase whitespace-nowrap">
                    ${log.action}
                </span>
            </td>
            <td class="p-4">
                <p class="text-gray-600 text-sm leading-relaxed break-words">${log.context}</p>
            </td>
            <td class="p-4">
                <div class="text-xs text-gray-400">
                    <span class="text-gray-900 font-bold">${dateStr}</span> <span class="mx-1 text-gray-300">•</span> ${timeStr}
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        loadLogs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}
