const API_BASE = window.location.origin;

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
}

document.getElementById('forgotForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const submitBtn = document.getElementById('submitBtn');

    if (!email) {
        showStatus('Please enter your email address', 'error');
        return;
    }

    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/admin/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to send OTP');
        }

        sessionStorage.setItem('adminResetEmail', email);
        showStatus('OTP sent successfully! Redirecting...', 'success');

        setTimeout(() => {
            window.location.href = 'verify-otp.html';
        }, 1500);
    } catch (error) {
        showStatus(error.message || 'Failed to send OTP. Please try again.', 'error');
        submitBtn.disabled = false;
    }
});
