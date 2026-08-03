/**
 * Pusat Arsip Anka - Notification System
 * Handles real-time indicators and unread archive notifications
 */

const NotificationSystem = {
    unreadCount: 0,
    isOpen: false,

    init() {
        this.checkNotifications();
        // Periodically check for new notifications (e.g., every 2 minutes)
        setInterval(() => this.checkNotifications(), 120000);

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !e.target.closest('#notification-dropdown')) {
                this.toggle(false);
            }
        });
    },

    async checkNotifications() {
        try {
            const res = await API.get('/api/notifications');
            const notifications = res.notifications || [];

            this.unreadCount = notifications.filter(n => !n.is_read).length;
            this.updateBadge();
            this.renderList(notifications);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    },

    updateBadge() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        if (this.unreadCount > 0) {
            badge.classList.add('active');
        } else {
            badge.classList.remove('active');
        }
    },

    toggle(force) {
        const menu = document.getElementById('notification-menu');
        if (!menu) return;

        this.isOpen = force !== undefined ? force : !this.isOpen;

        if (this.isOpen) {
            menu.classList.add('active');
        } else {
            menu.classList.remove('active');
        }
    },

    renderList(notifications) {
        const list = document.getElementById('notification-list');
        if (!list) return;

        if (notifications.length === 0) {
            list.innerHTML = `
                <div class="px-4 py-8 text-center text-gray-400 italic">
                    <p class="text-[10px] font-bold uppercase tracking-widest">Tidak ada notifikasi baru</p>
                </div>
            `;
            return;
        }

        list.innerHTML = notifications.map(notif => {
            const isRead = notif.is_read;
            const typeClass = notif.type === 'request' ? 'bg-amber-50 text-amber-600' :
                notif.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-blue-50 text-blue-600';

            return `
            <div class="px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50/50 cursor-pointer group ${isRead ? 'opacity-60' : 'bg-blue-50/20'}" 
                 onclick="viewNotification('${notif.id}', '${notif.link || 'dashboard.html'}')">
                <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded-full ${typeClass} flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-black text-gray-900 leading-tight">${notif.title}</p>
                        <p class="text-[10px] text-gray-500 mt-0.5 line-clamp-2">${notif.message}</p>
                        <p class="text-[9px] text-gray-400 mt-1 italic">${new Date(notif.created_at).toLocaleString('id-ID')}</p>
                    </div>
                    ${!isRead ? `<div class="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5"></div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
};

// Global hooks
window.toggleNotifications = () => NotificationSystem.toggle();
window.markAllAsRead = async () => {
    try {
        await API.post('/api/notifications/read-all');
        NotificationSystem.checkNotifications();
        if (typeof Toast !== 'undefined') Toast.success('Semua notifikasi ditandai sudah dibaca');
    } catch (error) {
        console.error('Error marking read:', error);
    }
};

window.viewNotification = (id, link) => {
    // Redirect or open specific view
    window.location.href = link;
};

// Initialize
document.addEventListener('DOMContentLoaded', () => NotificationSystem.init());
