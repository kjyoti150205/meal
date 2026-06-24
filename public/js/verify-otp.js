const API_BASE = window.location.origin;

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
}

const savedEmail = sessionStorage.getItem('adminResetEmail');

if (!savedEmail) {
    window.location.href = 'admin-forgot-password.html';
} else {
    document.getElementById('email').value = savedEmail;
}

document.getElementById('otp').addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
});

document.getElementById('verifyForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const otp = document.getElementById('otp').value.trim();
    const submitBtn = document.getElementById('submitBtn');

    if (!/^\d{6}$/.test(otp)) {
        showStatus('Please enter a valid 6-digit OTP', 'error');
        return;
    }

    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/admin/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'OTP verification failed');
        }

        sessionStorage.setItem('adminResetEmail', email);
        sessionStorage.setItem('adminOtpVerified', 'true');
        showStatus('OTP verified! Redirecting...', 'success');

        setTimeout(() => {
            window.location.href = 'reset-password.html';
        }, 1500);
    } catch (error) {
        showStatus(error.message || 'Invalid OTP. Please try again.', 'error');
        submitBtn.disabled = false;
    }
});
