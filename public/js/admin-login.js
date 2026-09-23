const API_BASE = window.location.origin;

let _otpEmail       = '';
let _resendInterval = null;

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className   = type || '';
}

function showOtpPanel(email) {
    _otpEmail = email;
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('otpPanel').style.display  = 'block';
    document.getElementById('otpEmailDisplay').textContent = email;
    startResendCountdown(30);
}

function backToLogin() {
    document.getElementById('otpPanel').style.display  = 'none';
    document.getElementById('loginForm').style.display = 'block';
    clearInterval(_resendInterval);
    showStatus('', '');
}

function startResendCountdown(seconds) {
    const btn   = document.getElementById('resendOtpBtn');
    const timer = document.getElementById('resendTimer');
    btn.disabled = true;
    let remaining = seconds;
    timer.textContent = remaining;
    clearInterval(_resendInterval);
    _resendInterval = setInterval(() => {
        remaining--;
        timer.textContent = remaining;
        if (remaining <= 0) {
            clearInterval(_resendInterval);
            btn.disabled  = false;
            btn.innerHTML = 'Resend OTP';
        }
    }, 1000);
}

// STEP 1 — verify email + password → receive OTP
document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email     = document.getElementById('email').value.trim();
    const password  = document.getElementById('password').value;
    const submitBtn = document.getElementById('submitBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';

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

        if (data.requiresOtp) {
            showStatus('OTP sent to your email. Please check your inbox.', 'success');
            showOtpPanel(data.email || email);
        }
    } catch (error) {
        showStatus(error.message || 'Login failed. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
});

// STEP 2 — verify OTP → receive JWT
async function verifyLoginOtp() {
    const otp = document.getElementById('otpInput').value.trim();
    const btn = document.getElementById('verifyOtpBtn');

    if (!/^\d{6}$/.test(otp)) {
        showStatus('Please enter a valid 6-digit OTP.', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

    try {
        const response = await fetch(`${API_BASE}/api/admin/verify-login-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: _otpEmail, otp })
        });

        const data = await response.json();

        if (!response.ok) {
            showStatus(data.message || 'Invalid OTP.', 'error');
            return;
        }

        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('admin', JSON.stringify(data.admin));

        showStatus('Login successful! Redirecting to dashboard...', 'success');
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 800);
    } catch (error) {
        showStatus(error.message || 'Verification failed. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Verify OTP';
    }
}

// Resend OTP
async function resendLoginOtp() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/resend-login-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: _otpEmail })
        });
        const data = await response.json();
        showStatus(data.message || 'New OTP sent.', response.ok ? 'success' : 'error');
        if (response.ok) startResendCountdown(30);
    } catch (err) {
        showStatus('Failed to resend OTP. Please try again.', 'error');
    }
}

if (localStorage.getItem('adminToken') && localStorage.getItem('adminToken') !== 'undefined') {
    window.location.href = 'admin-dashboard.html';
}
