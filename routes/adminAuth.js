'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const Admin = require('../models/Admin');
const {
    prepareLoginOTP,
    prepareForgotPasswordOTP,
    validateLoginOTP,
    validateForgotPasswordOTP,
    clearForgotPasswordOTP,
    canResendOTP,
    resendCooldownSecondsRemaining
} = require('../utils/otpService');
const {
    buildLoginOtpEmail,
    buildForgotPasswordOtpEmail,
    sendOtpEmail
} = require('../utils/otpEmailTemplates');

const JWT_EXPIRY = '8h';
const router     = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiters
// ─────────────────────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many OTP requests. Please try again after 15 minutes.' }
});

const verifyOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Please try again later.' }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Verify email + password, send login OTP
// POST /api/admin/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!isValidEmail(email) || !password) {
            return res.status(400).json({ message: 'Valid email and password are required' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });

        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Credentials verified — generate & send login OTP (or reuse active OTP if sent <30s ago)
        if (!canResendOTP(admin) && admin.loginOtp && admin.loginOtpExpiry && new Date(admin.loginOtpExpiry).getTime() > Date.now()) {
            return res.json({
                requiresOtp: true,
                email:       admin.email,
                message:     'OTP sent to your registered email. Please verify to complete login.'
            });
        }

        const otp = await prepareLoginOTP(admin);
        await admin.save();

        try {
            await sendOtpEmail(admin.email, buildLoginOtpEmail(admin.name, otp, 'admin'));
        } catch (emailErr) {
            console.error('[AdminLoginOTP] Email send failed:', emailErr.message);
            // Clear OTP so admin isn't stuck with an unsent code
            const { clearLoginOTP } = require('../utils/otpService');
            clearLoginOTP(admin);
            await admin.save();
            return res.status(500).json({ message: 'Failed to send OTP email. Please try again.' });
        }

        // Never return a token here — only after OTP verification
        return res.json({
            requiresOtp: true,
            email:       admin.email,
            message:     'OTP sent to your registered email. Please verify to complete login.'
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Verify login OTP, issue JWT
// POST /api/admin/verify-login-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-login-otp', verifyOtpLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!isValidEmail(email) || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        if (!/^\d{6}$/.test(String(otp).trim())) {
            return res.status(400).json({ message: 'OTP must be a 6-digit number' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
        if (!admin) {
            return res.status(404).json({ message: 'Account not found' });
        }

        const result = await validateLoginOTP(admin, otp);
        await admin.save();   // save attempt count / cleared fields

        if (!result.ok) {
            return res.status(result.status).json({ message: result.message });
        }

        // OTP correct — issue JWT
        const token = jwt.sign(
            { id: admin._id, email: admin.email, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        console.log(`[AdminAuth] ✅ Admin ${admin.email} logged in via OTP`);

        return res.json({
            message: 'Login successful',
            token,
            admin: {
                _id:       admin._id,
                name:      admin.name,
                email:     admin.email,
                role:      admin.role,
                createdAt: admin.createdAt
            }
        });
    } catch (error) {
        console.error('Admin verify-login-otp error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESEND login OTP (30-second cooldown)
// POST /api/admin/resend-login-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-login-otp', loginLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
        if (!admin) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (!canResendOTP(admin)) {
            const wait = resendCooldownSecondsRemaining(admin);
            return res.status(429).json({
                message: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting a new OTP.`
            });
        }

        const otp = await prepareLoginOTP(admin);
        await admin.save();

        try {
            await sendOtpEmail(admin.email, buildLoginOtpEmail(admin.name, otp, 'admin'));
        } catch (emailErr) {
            console.error('[AdminResendOTP] Email failed:', emailErr.message);
            const { clearLoginOTP } = require('../utils/otpService');
            clearLoginOTP(admin);
            await admin.save();
            return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
        }

        return res.json({ message: 'New OTP sent to your registered email.' });
    } catch (error) {
        console.error('Admin resend-login-otp error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD — send OTP (hashed storage)
// POST /api/admin/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
        if (!admin) {
            // Generic response — don't reveal whether email exists
            return res.json({ message: 'OTP sent to your registered email address' });
        }

        const otp = await prepareForgotPasswordOTP(admin);
        await admin.save();

        try {
            await sendOtpEmail(admin.email, buildForgotPasswordOtpEmail(admin.name, otp, 'admin'));
        } catch (emailErr) {
            console.error('[AdminForgotPwd] Email failed:', emailErr.message);
            clearForgotPasswordOTP(admin);
            await admin.save();
            return res.status(500).json({ message: 'Failed to send OTP. Please try again later.' });
        }

        res.json({ message: 'OTP sent to your registered email address' });
    } catch (error) {
        console.error('Admin forgot-password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY forgot-password OTP
// POST /api/admin/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-otp', verifyOtpLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
            return res.status(400).json({ message: 'A valid 6-digit OTP is required' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
        if (!admin) {
            return res.status(404).json({ message: 'Account not found' });
        }

        const result = await validateForgotPasswordOTP(admin, otp);
        await admin.save();

        if (!result.ok) {
            return res.status(result.status).json({ message: result.message });
        }

        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Admin verify-otp error:', error);
        res.status(500).json({ message: 'Failed to verify OTP' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD
// POST /api/admin/reset-password
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword, confirmPassword } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        if (!admin.otpVerified) {
            return res.status(400).json({ message: 'OTP verification required before resetting password' });
        }

        if (!admin.resetOTPExpiry || admin.resetOTPExpiry < new Date()) {
            clearForgotPasswordOTP(admin);
            await admin.save();
            return res.status(400).json({ message: 'OTP has expired. Please start the reset process again.' });
        }

        admin.password = await bcrypt.hash(newPassword, 10);
        clearForgotPasswordOTP(admin);
        await admin.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Admin reset-password error:', error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
});

module.exports = router;
