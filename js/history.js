// ============================================================
// Batch History & WA Notice Logic — v1.0
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;

    await loadBatches();
});

async function loadBatches() {
    showLoading('main-content');
    try {
        const { batches } = await API.get('/api/batches');
        renderBatches(batches || []);
    } catch (err) {
        Toast.error('Gagal memuat riwayat batch: ' + err.message);
    } finally {
        hideLoading();
    }
}

function renderBatches(batches) {
    const tbody = document.getElementById('batches-body');
    const emptyState = document.getElementById('batches-empty');

    if (!tbody) return;

    if (batches.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    tbody.innerHTML = batches.map((b, i) => {
        const date = new Date(b.created_at);
        const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const successRate = b.total_files > 0 ? Math.round((b.success_files / b.total_files) * 100) : 0;

        return `
            <tr class="animate-fade-in hover:bg-white/[0.02] transition-colors" style="animation-delay: ${Math.min(i * 30, 500)}ms">
                <td class="px-5 py-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium text-gray-900">${dateStr}</span>
                        <span class="text-xs text-gray-500">${timeStr}</span>
                    </div>
                </td>
                <td class="px-5 py-4">
                    <span class="text-sm text-gray-700 font-medium">${b.uploader_name || '-'}</span>
                </td>
                <td class="px-5 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <span class="text-sm font-bold text-gray-900">${b.success_files}</span>
                        <span class="text-xs text-gray-500">/ ${b.total_files}</span>
                        ${successRate === 100 ?
                `<span class="ml-1 flex items-center justify-center p-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm" title="Berhasil">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                    </svg>
                </span>` :
                `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">${successRate}%</span>`
            }
                    </div>
                </td>
                <td class="px-5 py-4 text-right pr-6">
                    <button onclick="openNoticePanel('${b.id}')"
                        class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 ml-auto">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Kirim Notice
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ---- Notice Panel (Modal) ----
async function openNoticePanel(batchId) {
    const modal = document.getElementById('notice-modal');
    const container = document.getElementById('notice-panels');

    modal.classList.remove('hidden');
    container.innerHTML = `
        <div class="premium-loader py-12">
            <div class="loader-rings">
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
                <div class="loader-ring"></div>
            </div>
            <span class="loader-text">Memuat data batch...</span>
        </div>
    `;

    try {
        const { grouped, total } = await API.get(`/api/batches/${batchId}/details`);

        if (total === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <p>Tidak ada file dalam batch ini.</p>
                </div>`;
            return;
        }

        // Generate one panel per zona
        let panelsHtml = '';
        const zonaNames = Object.keys(grouped).sort();

        zonaNames.forEach((zonaName, idx) => {
            const files = grouped[zonaName];
            const template = generateWATemplate(zonaName, files);
            const escapedTemplate = template.replace(/'/g, "\\'").replace(/\n/g, "\\n");

            panelsHtml += `
                <div class="glass-card-light rounded-2xl p-5 border border-white/10 animate-fade-in" style="animation-delay: ${idx * 80}ms">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                </svg>
                            </div>
                            <span class="text-sm font-bold text-gray-900">${zonaName}</span>
                            <span class="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-500">${files.length} file</span>
                        </div>
                        <button onclick="copyTemplate(this, '${escapedTemplate}')"
                            class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-xl shadow-indigo-600/20 transition-all flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Salin Pesan
                        </button>
                    </div>
                    <pre class="text-xs text-gray-700 bg-gray-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto border border-gray-200">${escapeHtml(template)}</pre>
                </div>
            `;
        });

        container.innerHTML = panelsHtml;

    } catch (err) {
        container.innerHTML = `
            <div class="text-center py-12 text-red-400">
                <p>Gagal memuat: ${err.message}</p>
            </div>`;
    }
}

function generateWATemplate(zonaName, files) {
    // Determine Zona Number/Suffix from Name (e.g., "Zona 07" -> "07")
    const zonaNum = zonaName.replace(/[^0-9A-Za-z]/g, ' ').replace('Zona', '').trim();

    let msg = `📂 *UPDATE INVOICE ZONA ${zonaNum}*\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `*Total : ${files.length}*\n\n`;
    msg += `*Daftar Dokumen Terbaru:*\n`;

    files.forEach(f => {
        // Extract plain merchant name
        const merchant = f.toko_nama || 'Umum';

        // PPN Type (Use tipe_ppn if exists, else guess from category/filename)
        const type = f.tipe_ppn || (f.category === 'NON_PPN' ? 'NON' : 'PPN');

        // Formatted Nominal
        const nominal = new Intl.NumberFormat('id-ID').format(f.total_jual || 0);

        // Date String (Use actual doc date if available)
        let dateStr = '';
        if (f.tanggal_dokumen) {
            const d = new Date(f.tanggal_dokumen);
            if (!isNaN(d.getTime())) {
                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGT', 'SEP', 'OKT', 'NOV', 'DES'];
                dateStr = `${d.getDate()} ${months[d.getMonth()]}`;
            }
        }

        // If still no date, try to extract from filename (e.g., "30 APR")
        if (!dateStr) {
            const match = f.nama_file.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MEI|JUN|JUL|AGT|SEP|OKT|NOV|DES)/i);
            if (match) dateStr = match[0].toUpperCase();
        }

        msg += `- [${merchant}] ${type} ${nominal} ${dateStr || ''}\n`;
    });

    msg += `\nSilahkan Cek Di:\n`;
    msg += `https://ankaindonesia-arsip.hf.space/\n\n`;
    msg += `_©adminanka_`;

    return msg;
}

function copyTemplate(btn, text) {
    const decoded = text.replace(/\\n/g, '\n').replace(/\\'/g, "'");
    navigator.clipboard.writeText(decoded).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Tersalin!`;
        btn.classList.remove('from-indigo-600', 'to-indigo-700');
        btn.classList.add('from-emerald-600', 'to-emerald-700');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('from-emerald-600', 'to-emerald-700');
            btn.classList.add('from-indigo-600', 'to-indigo-700');
        }, 2000);
    }).catch(() => {
        Toast.error('Gagal menyalin. Coba salin manual.');
    });
}

function closeNoticeModal() {
    document.getElementById('notice-modal').classList.add('hidden');
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
