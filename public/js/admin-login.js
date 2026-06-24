const API_BASE = window.location.origin;

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('admin');

        const response = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('admin', JSON.stringify(data.admin));

        showStatus('Login successful! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1000);
    } catch (error) {
        showStatus(error.message || 'Login failed. Please try again.', 'error');
    }
});

if (localStorage.getItem('adminToken')) {
    window.location.href = 'admin-dashboard.html';
}
