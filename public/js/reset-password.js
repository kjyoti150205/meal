const API_BASE = window.location.origin;

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
}

const savedEmail = sessionStorage.getItem('adminResetEmail');
const otpVerified = sessionStorage.getItem('adminOtpVerified');

if (!savedEmail || otpVerified !== 'true') {
    window.location.href = 'admin-forgot-password.html';
}

document.getElementById('resetForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = document.getElementById('submitBtn');

    if (newPassword.length < 6) {
        showStatus('Password must be at least 6 characters', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showStatus('Passwords do not match', 'error');
        return;
    }

    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: savedEmail,
                newPassword,
                confirmPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Password reset failed');
        }

        sessionStorage.removeItem('adminResetEmail');
        sessionStorage.removeItem('adminOtpVerified');
        showStatus('Password reset successfully! Redirecting to login...', 'success');

        setTimeout(() => {
            window.location.href = 'admin-login.html';
        }, 2000);
    } catch (error) {
        showStatus(error.message || 'Failed to reset password. Please try again.', 'error');
        submitBtn.disabled = false;
    }
});
