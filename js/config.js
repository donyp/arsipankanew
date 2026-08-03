// ============================================================
// Pusat Arsip Anka — Configuration
// ============================================================

const CONFIG = {
    // Backend API URL
    // Backend API URL (Empty string means relative to current origin)
    API_URL: window.location.hostname === 'localhost' ? 'http://localhost:4000' : '',

    // App Constants
    CATEGORIES: [
        { value: 'PPN', label: 'PPN' },
        { value: 'NON_PPN', label: 'Non PPN' },
        { value: 'INVOICE', label: 'Invoice Merah' },
        { value: 'PIUTANG', label: 'Bukti Pembayaran Piutang' }
    ],

    CATEGORY_FOLDERS: {
        'PPN': 'PPN',
        'NON_PPN': 'NON_PPN',
        'INVOICE': 'INVOICE',
        'PIUTANG': 'PIUTANG'
    },

    // Pagination
    PAGE_SIZE: 15
};
