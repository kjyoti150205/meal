const API_BASE = window.location.origin;

let currentTab = 'pending';
let usersCache = { pending: [], approved: [], rejected: [] };

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

    document.getElementById('pendingCount').textContent = pending.length;
    document.getElementById('approvedCount').textContent = approved.length;
    document.getElementById('rejectedCount').textContent = rejected.length;

    renderTable();
}

function renderTable() {
    const users = usersCache[currentTab] || [];
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <div><i class="fas fa-inbox"></i></div>
                        <p>No ${currentTab} users found.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = users.map((user) => {
        const status = user.verificationStatus || currentTab;
        const approveBtn = currentTab === 'pending'
            ? `<button class="btn-sm btn-approve" data-action="approve" data-id="${user._id}">Approve</button>`
            : '';
        const rejectBtn = currentTab === 'pending'
            ? `<button class="btn-sm btn-reject" data-action="reject" data-id="${user._id}">Reject</button>`
            : '';

        return `
            <tr>
                <td>${escapeHtml(user.name || '—')}</td>
                <td>${escapeHtml(user.email || '—')}</td>
                <td>${escapeHtml(user.instituteId || '—')}</td>
                <td>${escapeHtml(user.department || '—')}</td>
                <td>${escapeHtml(user.roomNumber || '—')}</td>
                <td>${formatDate(user.registrationDate)}</td>
                <td><span class="status-badge ${status}">${status}</span></td>
                <td>
                    <div class="row-actions">
                        ${approveBtn}
                        ${rejectBtn}
                        <button class="btn-sm btn-view" data-action="view" data-id="${user._id}">View Details</button>
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

function findUserById(id) {
    return [...usersCache.pending, ...usersCache.approved, ...usersCache.rejected]
        .find((user) => user._id === id);
}

function openDetailsModal(user) {
    const grid = document.getElementById('detailGrid');
    grid.innerHTML = `
        <div class="detail-item"><span>Name</span><span>${escapeHtml(user.name || '—')}</span></div>
        <div class="detail-item"><span>Email</span><span>${escapeHtml(user.email || '—')}</span></div>
        <div class="detail-item"><span>Institute ID</span><span>${escapeHtml(user.instituteId || '—')}</span></div>
        <div class="detail-item"><span>Department</span><span>${escapeHtml(user.department || '—')}</span></div>
        <div class="detail-item"><span>Room Number</span><span>${escapeHtml(user.roomNumber || '—')}</span></div>
        <div class="detail-item"><span>Registration Date</span><span>${formatDate(user.registrationDate)}</span></div>
        <div class="detail-item"><span>Verification Status</span><span>${escapeHtml(user.verificationStatus || '—')}</span></div>
        <div class="detail-item"><span>Verified On</span><span>${formatDate(user.verificationTimestamp)}</span></div>
    `;
    document.getElementById('detailsModal').classList.add('open');
}

async function handleAction(action, userId) {
    const user = findUserById(userId);
    if (!user) return;

    if (action === 'view') {
        openDetailsModal(user);
        return;
    }

    const confirmMsg = action === 'approve'
        ? `Approve ${user.name}?`
        : `Reject ${user.name}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
        await apiFetch(`/api/admin/${action}/${userId}`, { method: 'POST' });
        showToast(`User ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
        await loadAllUsers();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
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
    loadAllUsers().catch((error) => showToast(error.message, 'error'));
}
