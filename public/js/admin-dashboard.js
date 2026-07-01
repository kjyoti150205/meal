const API_BASE = window.location.origin;

let currentTab = 'pending';
let currentSection = 'users';
let usersCache = { pending: [], approved: [], rejected: [] };
let managersCache = { pending: [], approved: [], rejected: [] };

function getToken() {
    return localStorage.getItem('adminToken');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
    };
}

function redirectToLogin() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('admin');
    window.location.href = 'admin-login.html';
}

function checkAuth() {
    if (!getToken()) {
        redirectToLogin();
        return false;
    }
    return true;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

async function apiFetch(url, options = {}) {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: { ...authHeaders(), ...options.headers }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        redirectToLogin();
        throw new Error('Session expired');
    }

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

async function loadAllUsers() {
    const [pending, approved, rejected] = await Promise.all([
        apiFetch('/api/admin/pending-users'),
        apiFetch('/api/admin/approved-users'),
        apiFetch('/api/admin/rejected-users')
    ]);

    usersCache = { pending, approved, rejected };
}

async function loadAllManagers() {
    const [pending, approved, rejected] = await Promise.all([
        apiFetch('/api/admin/pending-managers'),
        apiFetch('/api/admin/approved-managers'),
        apiFetch('/api/admin/rejected-managers')
    ]);

    managersCache = { pending, approved, rejected };
}

async function loadAll() {
    await Promise.all([loadAllUsers(), loadAllManagers()]);

    document.getElementById('pendingCount').textContent = usersCache.pending.length + managersCache.pending.length;
    document.getElementById('approvedCount').textContent = usersCache.approved.length + managersCache.approved.length;
    document.getElementById('rejectedCount').textContent = usersCache.rejected.length + managersCache.rejected.length;

    renderTable();
}

function renderTable() {
    const isManagers = currentSection === 'managers';
    const cache = isManagers ? managersCache : usersCache;
    const items = cache[currentTab] || [];
    const tbody = document.getElementById('usersTableBody');
    const thead = document.querySelector('.panel table thead tr');

    if (isManagers) {
        thead.innerHTML = `
            <th>Name</th>
            <th>Email</th>
            <th>Manager ID</th>
            <th>Hostel</th>
            <th>Designation</th>
            <th>Registered</th>
            <th>Status</th>
            <th>Actions</th>`;
    } else {
        thead.innerHTML = `
            <th>Name</th>
            <th>Email</th>
            <th>Institute ID</th>
            <th>Department</th>
            <th>Room</th>
            <th>Registered</th>
            <th>Status</th>
            <th>Actions</th>`;
    }

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <div><i class="fas fa-inbox"></i></div>
                        <p>No ${currentTab} ${isManagers ? 'managers' : 'users'} found.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = items.map((item) => {
        const status = item.verificationStatus || currentTab;
        const approveBtn = currentTab === 'pending'
            ? `<button class="btn-sm btn-approve" data-action="approve" data-id="${item._id}">Approve</button>`
            : '';
        const rejectBtn = currentTab === 'pending'
            ? `<button class="btn-sm btn-reject" data-action="reject" data-id="${item._id}">Reject</button>`
            : '';

        if (isManagers) {
            return `
                <tr>
                    <td>${escapeHtml(item.name || '—')}</td>
                    <td>${escapeHtml(item.email || '—')}</td>
                    <td>${escapeHtml(item.managerId || '—')}</td>
                    <td>${escapeHtml(item.hostelName || '—')}</td>
                    <td>${escapeHtml(item.designation || '—')}</td>
                    <td>${formatDate(item.registrationDate)}</td>
                    <td><span class="status-badge ${status}">${status}</span></td>
                    <td>
                        <div class="row-actions">
                            ${approveBtn}
                            ${rejectBtn}
                            <button class="btn-sm btn-view" data-action="view" data-id="${item._id}">View Details</button>
                        </div>
                    </td>
                </tr>`;
        }

        return `
            <tr>
                <td>${escapeHtml(item.name || '—')}</td>
                <td>${escapeHtml(item.email || '—')}</td>
                <td>${escapeHtml(item.instituteId || '—')}</td>
                <td>${escapeHtml(item.department || '—')}</td>
                <td>${escapeHtml(item.roomNumber || '—')}</td>
                <td>${formatDate(item.registrationDate)}</td>
                <td><span class="status-badge ${status}">${status}</span></td>
                <td>
                    <div class="row-actions">
                        ${approveBtn}
                        ${rejectBtn}
                        <button class="btn-sm btn-view" data-action="view" data-id="${item._id}">View Details</button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function findItemById(id) {
    const cache = currentSection === 'managers' ? managersCache : usersCache;
    return [...cache.pending, ...cache.approved, ...cache.rejected].find((item) => item._id === id);
}

function openDetailsModal(item) {
    const grid = document.getElementById('detailGrid');
    const isManager = currentSection === 'managers';

    if (isManager) {
        grid.innerHTML = `
            <div class="detail-item"><span>Name</span><span>${escapeHtml(item.name || '—')}</span></div>
            <div class="detail-item"><span>Email</span><span>${escapeHtml(item.email || '—')}</span></div>
            <div class="detail-item"><span>Manager ID</span><span>${escapeHtml(item.managerId || '—')}</span></div>
            <div class="detail-item"><span>Phone</span><span>${escapeHtml(item.phone || '—')}</span></div>
            <div class="detail-item"><span>Hostel</span><span>${escapeHtml(item.hostelName || '—')}</span></div>
            <div class="detail-item"><span>Designation</span><span>${escapeHtml(item.designation || '—')}</span></div>
            <div class="detail-item"><span>Registration Date</span><span>${formatDate(item.registrationDate)}</span></div>
            <div class="detail-item"><span>Status</span><span>${escapeHtml(item.verificationStatus || '—')}</span></div>`;
    } else {
        grid.innerHTML = `
            <div class="detail-item"><span>Name</span><span>${escapeHtml(item.name || '—')}</span></div>
            <div class="detail-item"><span>Email</span><span>${escapeHtml(item.email || '—')}</span></div>
            <div class="detail-item"><span>Institute ID</span><span>${escapeHtml(item.instituteId || '—')}</span></div>
            <div class="detail-item"><span>Department</span><span>${escapeHtml(item.department || '—')}</span></div>
            <div class="detail-item"><span>Room Number</span><span>${escapeHtml(item.roomNumber || '—')}</span></div>
            <div class="detail-item"><span>Registration Date</span><span>${formatDate(item.registrationDate)}</span></div>
            <div class="detail-item"><span>Verification Status</span><span>${escapeHtml(item.verificationStatus || '—')}</span></div>
            <div class="detail-item"><span>Verified On</span><span>${formatDate(item.verificationTimestamp)}</span></div>`;
    }

    document.getElementById('detailsModal').classList.add('open');
}

async function handleAction(action, itemId) {
    const item = findItemById(itemId);
    if (!item) return;

    if (action === 'view') {
        openDetailsModal(item);
        return;
    }

    const label = currentSection === 'managers' ? 'manager' : 'user';
    const confirmMsg = action === 'approve'
        ? `Approve ${item.name}?`
        : `Reject ${item.name}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
        const endpoint = currentSection === 'managers'
            ? `/api/admin/${action}-manager/${itemId}`
            : `/api/admin/${action}/${itemId}`;

        await apiFetch(endpoint, { method: 'POST' });
        showToast(`${label.charAt(0).toUpperCase() + label.slice(1)} ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
        await loadAll();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        currentSection = btn.dataset.section || 'users';
        renderTable();
    });
});

document.getElementById('usersTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    handleAction(button.dataset.action, button.dataset.id);
});

document.getElementById('logoutBtn').addEventListener('click', redirectToLogin);

document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('detailsModal').classList.remove('open');
});

document.getElementById('detailsModal').addEventListener('click', (event) => {
    if (event.target.id === 'detailsModal') {
        document.getElementById('detailsModal').classList.remove('open');
    }
});

if (checkAuth()) {
    const admin = JSON.parse(localStorage.getItem('admin') || '{}');
    document.getElementById('adminMeta').textContent = admin.email || '';
    loadAll().catch((error) => showToast(error.message, 'error'));
}
