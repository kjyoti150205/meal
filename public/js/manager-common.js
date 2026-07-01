const API_BASE = window.location.origin;

function getManagerToken() {
    return localStorage.getItem('managerToken');
}

function getManager() {
    try {
        return JSON.parse(localStorage.getItem('manager') || 'null');
    } catch {
        return null;
    }
}

function authHeaders() {
    const headers = { Authorization: `Bearer ${getManagerToken()}` };
    if (!(arguments[0] instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

function redirectToLogin() {
    localStorage.removeItem('managerToken');
    localStorage.removeItem('manager');
    window.location.href = 'manager_login.html';
}

function checkManagerAuth() {
    if (!getManagerToken()) {
        redirectToLogin();
        return false;
    }
    return true;
}

function logoutManager() {
    redirectToLogin();
}

function showToast(message, type = 'info') {
    let container = document.getElementById('mgrToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mgrToastContainer';
        container.className = 'mgr-toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `mgr-toast mgr-toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function showLoading(show = true) {
    let overlay = document.getElementById('mgrLoadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mgrLoadingOverlay';
        overlay.className = 'mgr-loading-overlay';
        overlay.innerHTML = '<div class="mgr-loader"><div class="mgr-loader-ring"></div><p>Loading...</p></div>';
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active', show);
}

async function managerFetch(url, options = {}) {
    const isForm = options.body instanceof FormData;
    const headers = { Authorization: `Bearer ${getManagerToken()}`, ...options.headers };
    if (!isForm && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${url}`, { ...options, headers });

    if (response.status === 401) {
        redirectToLogin();
        throw new Error('Session expired. Please login again.');
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Request failed');
        return data;
    }

    if (!response.ok) throw new Error('Request failed');
    return response;
}

function getInitials(name) {
    if (!name) return 'M';
    return name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatMs(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function initSidebar(activePage) {
    const manager = getManager();
    const sidebar = document.getElementById('mgrSidebar');
    const overlay = document.getElementById('mgrSidebarOverlay');
    const toggle = document.getElementById('mgrMenuToggle');

    if (manager) {
        const nameEl = document.getElementById('mgrUserName');
        const avatarEl = document.getElementById('mgrUserAvatar');
        if (nameEl) nameEl.textContent = manager.fullName || 'Manager';
        if (avatarEl) {
            if (manager.photoUrl) {
                avatarEl.innerHTML = `<img src="${manager.photoUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                avatarEl.textContent = getInitials(manager.fullName);
            }
        }
    }

    document.querySelectorAll('.mgr-nav-link').forEach((link) => {
        link.classList.toggle('active', link.dataset.page === activePage);
    });

    if (toggle && sidebar && overlay) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        });
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
    }

    const logoutBtn = document.getElementById('mgrLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutManager);
}

function renderBarChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(data);
    if (entries.length === 0) {
        container.innerHTML = '<div class="mgr-empty"><i class="fas fa-chart-bar"></i><p>No data available</p></div>';
        return;
    }

    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    container.innerHTML = `<div class="mgr-chart-bar">${entries.map(([label, value]) => `
        <div class="mgr-chart-bar-item">
            <span class="mgr-chart-bar-value">${value}</span>
            <div class="mgr-chart-bar-fill" style="height:${Math.max((value / maxVal) * 160, 4)}px"></div>
            <span class="mgr-chart-bar-label">${escapeHtml(label)}</span>
        </div>
    `).join('')}</div>`;
}

function renderDonutChart(containerId, data, colors) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(data);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);

    if (total === 0) {
        container.innerHTML = '<div class="mgr-empty"><i class="fas fa-chart-pie"></i><p>No data available</p></div>';
        return;
    }

    const defaultColors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    let cumulative = 0;
    const segments = entries.map(([label, value], i) => {
        const pct = (value / total) * 100;
        const start = cumulative;
        cumulative += pct;
        return { label, value, pct, start, color: (colors && colors[i]) || defaultColors[i % defaultColors.length] };
    });

    const gradient = segments.map((s) => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

    container.innerHTML = `
        <div class="mgr-donut-wrap">
            <div class="mgr-donut" style="background:conic-gradient(${gradient})">
                <div class="mgr-donut-center">${total}</div>
            </div>
            <div class="mgr-donut-legend">
                ${segments.map((s) => `
                    <div class="mgr-legend-item">
                        <span class="mgr-legend-dot" style="background:${s.color}"></span>
                        <span>${escapeHtml(s.label)}: <strong>${s.value}</strong></span>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function renderLineChart(containerId, points, valueKey = 'pct') {
    const container = document.getElementById(containerId);
    if (!container || !points.length) {
        if (container) container.innerHTML = '<div class="mgr-empty"><i class="fas fa-chart-line"></i><p>No data</p></div>';
        return;
    }

    const max = Math.max(...points.map((p) => p[valueKey] || 0), 1);
    container.innerHTML = `<div class="mgr-line-chart">${points.map((p) => `
        <div class="mgr-line-bar-item">
            <div class="mgr-line-bar-fill" style="height:${Math.max(((p[valueKey] || 0) / max) * 140, 4)}px" title="${p[valueKey]}%"></div>
            <span class="mgr-chart-bar-label">${escapeHtml((p.date || '').slice(5))}</span>
        </div>
    `).join('')}</div>`;
}

function statusBadge(status) {
    const s = (status || '').toUpperCase();
    if (s === 'ON') return '<span class="mgr-badge success">ON</span>';
    if (s === 'OFF') return '<span class="mgr-badge danger">OFF</span>';
    if (s === 'APPROVED') return '<span class="mgr-badge success">Approved</span>';
    if (s === 'PENDING') return '<span class="mgr-badge warning">Pending</span>';
    if (s === 'REJECTED') return '<span class="mgr-badge danger">Rejected</span>';
    return `<span class="mgr-badge info">${escapeHtml(status || '—')}</span>`;
}

function studentPhotoUrl(photoUrl) {
    if (!photoUrl) return null;
    return photoUrl.startsWith('http') ? photoUrl : `${API_BASE}${photoUrl}`;
}

function renderPagination(containerId, page, totalPages, onPage) {
    const el = document.getElementById(containerId);
    if (!el || totalPages <= 1) {
        if (el) el.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
            html += `<button class="mgr-page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (Math.abs(i - page) === 3) {
            html += '<span class="mgr-page-dots">…</span>';
        }
    }
    el.innerHTML = html;
    el.querySelectorAll('.mgr-page-btn').forEach((btn) => {
        btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page, 10)));
    });
}
