// ============================================================
// Authentication Module — JWT Email/Password
// Replaces Google OAuth + Supabase Auth
// ============================================================

let currentUser = null;

// ---- Initialize Auth (check JWT on page load) ----
async function initAuth(requiredRole = null) {
    const token = API.getToken();

    if (!token) {
        // Not logged in — redirect to login (unless already on login page)
        if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
            window.location.href = 'index.html';
        }
        return null;
    }

    try {
        // Verify token with backend and get fresh user data
        const { user } = await API.get('/api/auth/me');

        if (!user || !user.is_active) {
            API.clearAuth();
            window.location.href = 'index.html';
            return null;
        }

        // --- BYPASS CONSTRAINT CHECK: Elevate to moderator dynamically ---
        if (user.permissions && user.permissions.includes('IS_MODERATOR')) {
            user.role = 'moderator';
        }

        currentUser = user;

    } catch (err) {
        console.error('Init Auth Error:', err);
        API.clearAuth();
        window.location.href = 'index.html';
        return null;
    }

    // Role guard
    if (requiredRole) {
        let isAllowed = false;
        if (Array.isArray(requiredRole)) {
            isAllowed = requiredRole.includes(currentUser.role);
        } else if (requiredRole === 'super_admin' && (currentUser.role === 'super_admin' || currentUser.role === 'moderator')) {
            isAllowed = true;
        } else if (currentUser.role === requiredRole) {
            isAllowed = true;
        }

        if (!isAllowed) {
            // Remove cloak so user can see the error
            document.documentElement.style.opacity = '1';
            const msg = 'Anda tidak memiliki akses ke halaman ini. Mengalihkan...';
            if (window.Toast) Toast.error(msg);
            else alert(msg);

            setTimeout(() => window.location.href = 'dashboard.html', 2000);
            return null;
        }
    }

    updateUserUI();
    return currentUser;
}

// ---- Login with Email & Password via Backend JWT ----
async function loginWithCredentials(email, password) {
    const { token, user } = await API.post('/api/auth/login', {
        email,
        password,
        session_id: API.getSessionId()
    });

    // Store JWT + user in localStorage
    API.setAuth(token, user);

    // Redirect to dashboard
    window.location.href = 'dashboard.html';
}

// ---- Logout ----
async function logout() {
    try {
        await API.post('/api/auth/logout', { session_id: API.getSessionId() });
    } catch (_) {
        // Silent fail — we're logging out anyway
    }
    API.clearAuth();
    currentUser = null;
    window.location.href = 'index.html';
}

/**
 * Helper to get pretty role labels based on role ID or permissions
 */
function getRoleLabel(user) {
    if (!user) return 'User';
    if (user.role === 'super_admin') return 'Super Admin';
    if (user.role === 'moderator' || (user.permissions && user.permissions.includes('IS_MODERATOR'))) return 'Moderator';
    return 'Admin Zona';
}

/**
 * Updates all user info in the UI (current header, sidebar, profile modal)
 */
function updateUserUI() {
    if (!currentUser) return;

    const roleLabel = getRoleLabel(currentUser);

    // Update user name displays
    document.querySelectorAll('[data-user-name]').forEach(el => {
        el.textContent = currentUser.name || 'User';
    });

    // Update user name initials
    document.querySelectorAll('[data-user-name-initials]').forEach(el => {
        const name = currentUser.name || 'User';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        el.textContent = initials;
    });

    // Update user email displays
    document.querySelectorAll('[data-user-email]').forEach(el => {
        el.textContent = currentUser.email;
    });

    // Update user username displays
    document.querySelectorAll('[data-user-username]').forEach(el => {
        el.textContent = `@${currentUser.username || (currentUser.email ? currentUser.email.split('@')[0] : 'user')}`;
    });

    // Update avatar
    document.querySelectorAll('[data-user-avatar]').forEach(el => {
        el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=6366f1&color=fff&size=200`;
    });

    // Update role badge and label
    document.querySelectorAll('[data-user-role], [data-user-role-label]').forEach(el => {
        el.textContent = roleLabel;

        if (el.hasAttribute('data-user-role')) {
            // Apply different styles based on role
            let styles = 'text-[10px] px-2 py-0.5 rounded-full border ';
            if (roleLabel === 'Super Admin') {
                styles += 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            } else if (roleLabel === 'Moderator') {
                styles += 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            } else {
                styles += 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            }
            el.className = styles;
        }
    });

    // Update zona display
    document.querySelectorAll('[data-user-zona]').forEach(el => {
        el.textContent = currentUser.zonas ? currentUser.zonas.nama : 'Semua Zona';
    });

    // Show/hide super admin elements
    document.querySelectorAll('[data-role="super_admin"]').forEach(el => {
        const isAllowed = isSuperAdmin();
        if (!isAllowed) {
            if (el.tagName === 'OPTION') el.remove();
            else el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });

    // Handle Granular Permissions
    document.querySelectorAll('[data-permission]').forEach(el => {
        const requiredPerm = el.getAttribute('data-permission');
        const hasPerm = hasPermission(requiredPerm);
        if (!hasPerm) {
            if (el.tagName === 'OPTION') el.remove();
            else el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });

    // Hide elements only for admin zona
    document.querySelectorAll('[data-role="admin_zona"]').forEach(el => {
        const isAllowed = currentUser.role === 'admin_zona';
        if (!isAllowed) {
            if (el.tagName === 'OPTION') el.remove();
            else el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });

    // --- Sidebar & Layout Logic ---
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('main');
    const headerLogout = document.getElementById('header-logout-btn');
    const headerRequest = document.getElementById('header-request-btn');

    if (currentUser.role === 'admin_zona') {
        // Admin Zona: Full-width, no sidebar
        if (sidebar) {
            sidebar.classList.add('hidden');
            sidebar.style.display = 'none';
        }
        if (mainContent) {
            mainContent.classList.remove('ml-64');
            mainContent.style.marginLeft = '0';
        }
        if (headerLogout) headerLogout.classList.replace('hidden', 'flex');
        if (headerRequest) headerRequest.classList.replace('hidden', 'flex');
    } else {
        // Super Admin / Moderator: Show sidebar, use offset
        if (sidebar) {
            sidebar.classList.remove('hidden');
            sidebar.style.display = 'flex';
        }
        if (mainContent) {
            mainContent.classList.add('ml-64');
            mainContent.style.marginLeft = '';
        }
    }

    // --- RELEASE CLOAK ---
    // Use transition for premium feel
    document.documentElement.style.transition = 'opacity 0.5s ease-in-out';
    document.documentElement.style.opacity = '1';
    document.documentElement.classList.remove('auth-loading');
}

/**
 * Toggles the user profile dropdown menu
 */
function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (!menu) return;

    if (menu.classList.contains('invisible')) {
        menu.classList.remove('invisible', 'opacity-0', 'translate-y-2');
        menu.classList.add('opacity-100', 'translate-y-0');
    } else {
        menu.classList.add('invisible', 'opacity-0', 'translate-y-2');
        menu.classList.remove('opacity-100', 'translate-y-0');
    }
}

/**
 * Handles clicks outside the user menu to close it
 */
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-profile-dropdown');
    const menu = document.getElementById('user-menu');
    if (dropdown && !dropdown.contains(e.target)) {
        if (menu && !menu.classList.contains('invisible')) {
            menu.classList.add('invisible', 'opacity-0', 'translate-y-2');
            menu.classList.remove('opacity-100', 'translate-y-0');
        }
    }
});

/**
 * Opens the profile detail modal
 */
function openProfileDetail() {
    const modal = document.getElementById('profile-detail-modal');
    if (!modal) return;

    // Close dropdown first
    toggleUserMenu();

    // Populate modal data (Refresh from currentUser first)
    updateUserUI();

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Closes the profile detail modal
 */
function closeProfileDetail() {
    const modal = document.getElementById('profile-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ---- Check if current user is Super Admin ----
function isSuperAdmin() {
    return currentUser?.role === 'super_admin' || currentUser?.role === 'moderator';
}

function hasPermission(perm) {
    if (!currentUser) return false;
    if (currentUser.role === 'moderator') return true;
    if (currentUser.role === 'super_admin' && perm !== 'manage_users') return true;
    return currentUser.permissions && currentUser.permissions.includes(perm);
}

// ---- Helper: Get zone label from currentUser or zona list ----
function getZoneLabel(zonaId) {
    if (window._zonaCache) {
        const z = window._zonaCache.find(z => z.id === zonaId);
        if (z) return z.nama;
    }
    return `Zona ${zonaId}`;
}
