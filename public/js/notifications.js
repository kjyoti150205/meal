/* Notification Bell — shared across Student, Manager, and Admin dashboards */

(function () {
    'use strict';

    const API_BASE = window.location.origin;
    const POLL_INTERVAL = 30000;

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function timeAgo(dateStr) {
        const date = new Date(dateStr);
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    function getAuthHeaders(token) {
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async function notificationFetch(token, url, options = {}) {
        const res = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers: {
                ...getAuthHeaders(token),
                ...(options.headers || {})
            }
        });

        if (res.status === 401) {
            return { unauthorized: true };
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Request failed');
        }

        return res.json();
    }

    function initNotificationBell(config) {
        const {
            mountSelector,
            getToken,
            theme = 'default'
        } = config;

        const mount = document.querySelector(mountSelector);
        if (!mount) return null;

        const token = getToken();
        if (!token) return null;

        const bellId = `notif-bell-${Date.now()}`;
        mount.insertAdjacentHTML('beforeend', `
            <div class="notif-bell-wrap notif-theme-${theme}" id="${bellId}">
                <button class="notif-bell-btn" type="button" aria-label="Notifications" aria-expanded="false">
                    <i class="fas fa-bell"></i>
                    <span class="notif-badge hidden" id="${bellId}-badge">0</span>
                </button>
                <div class="notif-dropdown" id="${bellId}-dropdown" aria-hidden="true">
                    <div class="notif-dropdown-header">
                        <h3><i class="fas fa-bell"></i> Notifications</h3>
                        <button class="notif-mark-all" type="button" title="Mark all as read">
                            <i class="fas fa-check-double"></i> Mark all read
                        </button>
                    </div>
                    <div class="notif-list" id="${bellId}-list">
                        <div class="notif-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
                    </div>
                </div>
            </div>
        `);

        const wrap = document.getElementById(bellId);
        const bellBtn = wrap.querySelector('.notif-bell-btn');
        const dropdown = document.getElementById(`${bellId}-dropdown`);
        const listEl = document.getElementById(`${bellId}-list`);
        const badgeEl = document.getElementById(`${bellId}-badge`);
        const markAllBtn = wrap.querySelector('.notif-mark-all');

        let isOpen = false;
        let notifications = [];
        let pollTimer = null;

        function setBadge(count) {
            if (count > 0) {
                badgeEl.textContent = count > 99 ? '99+' : count;
                badgeEl.classList.remove('hidden');
            } else {
                badgeEl.classList.add('hidden');
            }
        }

        function renderList() {
            if (!notifications.length) {
                listEl.innerHTML = `
                    <div class="notif-empty">
                        <i class="fas fa-bell-slash"></i>
                        <p>No notifications yet</p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = notifications.map((n) => `
                <div class="notif-item ${n.read ? 'read' : 'unread'}" data-id="${n._id}">
                    <div class="notif-item-icon">
                        <i class="fas ${escapeHtml(n.icon || 'fa-bell')}"></i>
                    </div>
                    <div class="notif-item-body">
                        <div class="notif-item-top">
                            <strong class="notif-item-title">${escapeHtml(n.title)}</strong>
                            <span class="notif-item-time">${timeAgo(n.createdAt)}</span>
                        </div>
                        <p class="notif-item-message">${escapeHtml(n.message)}</p>
                        <div class="notif-item-actions">
                            ${!n.read ? `<button class="notif-action-btn mark-read" type="button" title="Mark as read"><i class="fas fa-check"></i></button>` : ''}
                            <button class="notif-action-btn delete-notif" type="button" title="Delete"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
                </div>
            `).join('');
        }

        async function refreshUnreadCount() {
            try {
                const data = await notificationFetch(token, '/api/notifications/unread-count');
                if (data.unauthorized) return;
                setBadge(data.count || 0);
            } catch (err) {
                console.warn('Notification count refresh failed:', err.message);
            }
        }

        async function loadNotifications() {
            try {
                const data = await notificationFetch(token, '/api/notifications?limit=30');
                if (data.unauthorized) return;
                notifications = Array.isArray(data) ? data : [];
                renderList();
                const unread = notifications.filter((n) => !n.read).length;
                setBadge(unread);
            } catch (err) {
                listEl.innerHTML = `<div class="notif-empty"><p>Failed to load notifications</p></div>`;
            }
        }

        function closeDropdown() {
            isOpen = false;
            dropdown.classList.remove('show');
            bellBtn.setAttribute('aria-expanded', 'false');
            dropdown.setAttribute('aria-hidden', 'true');
        }

        function openDropdown() {
            isOpen = true;
            dropdown.classList.add('show');
            bellBtn.setAttribute('aria-expanded', 'true');
            dropdown.setAttribute('aria-hidden', 'false');
            loadNotifications();
        }

        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isOpen) closeDropdown();
            else openDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) closeDropdown();
        });

        markAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await notificationFetch(token, '/api/notifications/read-all', { method: 'PUT' });
                notifications = notifications.map((n) => ({ ...n, read: true }));
                renderList();
                setBadge(0);
            } catch (err) {
                console.warn('Mark all read failed:', err.message);
            }
        });

        listEl.addEventListener('click', async (e) => {
            const item = e.target.closest('.notif-item');
            if (!item) return;
            const id = item.dataset.id;

            if (e.target.closest('.mark-read')) {
                e.stopPropagation();
                try {
                    await notificationFetch(token, `/api/notifications/${id}/read`, { method: 'PUT' });
                    notifications = notifications.map((n) =>
                        n._id === id ? { ...n, read: true } : n
                    );
                    renderList();
                    await refreshUnreadCount();
                } catch (err) {
                    console.warn('Mark read failed:', err.message);
                }
            }

            if (e.target.closest('.delete-notif')) {
                e.stopPropagation();
                try {
                    await notificationFetch(token, `/api/notifications/${id}`, { method: 'DELETE' });
                    const deleted = notifications.find((n) => n._id === id);
                    notifications = notifications.filter((n) => n._id !== id);
                    renderList();
                    if (deleted && !deleted.read) await refreshUnreadCount();
                    else setBadge(notifications.filter((n) => !n.read).length);
                } catch (err) {
                    console.warn('Delete notification failed:', err.message);
                }
            }
        });

        refreshUnreadCount();
        pollTimer = setInterval(refreshUnreadCount, POLL_INTERVAL);

        return {
            refresh: loadNotifications,
            destroy: () => clearInterval(pollTimer)
        };
    }

    window.initNotificationBell = initNotificationBell;
})();
