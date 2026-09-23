'use strict';
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const Manager = require('../models/Manager');
const { notifyAllAdmins, fireAndForget } = require('../utils/notificationHelper');
const {
    prepareLoginOTP,
    validateLoginOTP,
    clearLoginOTP,
    canResendOTP,
    resendCooldownSecondsRemaining
} = require('../utils/otpService');
const {
    buildLoginOtpEmail,
    sendOtpEmail
} = require('../utils/otpEmailTemplates');

const router     = express.Router();
const JWT_EXPIRY = '8h';

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiters
// ─────────────────────────────────────────────────────────────────────────────
const managerLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});

const managerRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many registration attempts. Please try again later.' }
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

function formatManager(manager) {
    const obj = manager.toObject();
    delete obj.password;
    // Never expose hashed OTP fields to clients
    delete obj.loginOtp;
    delete obj.loginOtpExpiry;
    delete obj.loginOtpAttempts;
    delete obj.loginOtpLastSent;
    return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER
// POST /api/manager/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', managerRegisterLimiter, async (req, res) => {
    try {
        const { fullName, email, password, phone, managerId, hostelName, designation } = req.body;

        if (!fullName || !isValidEmail(email) || !password) {
            return res.status(400).json({ message: 'Full name, valid email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingManager = await Manager.findOne({ email: normalizedEmail });

        if (existingManager) {
            return res.status(400).json({ message: 'Manager already exists with this email' });
        }

        if (managerId) {
            const existingId = await Manager.findOne({ managerId: managerId.trim() });
            if (existingId) {
                return res.status(400).json({ message: 'Manager ID already registered' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newManager = new Manager({
            fullName:           fullName.trim(),
            email:              normalizedEmail,
            password:           hashedPassword,
            phone:              phone?.trim()       || '',
            managerId:          managerId?.trim()   || '',
            hostelName:         hostelName?.trim()  || '',
            designation:        designation?.trim() || '',
            verificationStatus: 'pending'
        });

        await newManager.save();

        fireAndForget(async () => {
            await notifyAllAdmins({
                type:    'new_manager_registered',
                title:   'New Manager Registered',
                message: `${newManager.fullName} (${newManager.email}) has registered and awaits approval.`,
                icon:    'fa-user-tie'
            });
        });

        res.status(201).json({
            message: 'Registration successful. Your account is waiting for Admin approval.',
            manager: formatManager(newManager)
        });
    } catch (error) {
        console.error('Manager registration error:', error);
        res.status(500).json({ message: 'Registration failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Verify email + password, send login OTP
// POST /api/manager/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', managerLoginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!isValidEmail(email) || !password) {
            return res.status(400).json({ message: 'Valid email and password are required' });
        }

        const manager = await Manager.findOne({ email: email.trim().toLowerCase() });

        if (!manager) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, manager.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (manager.verificationStatus === 'pending') {
            return res.status(403).json({ message: 'Your account is waiting for Admin approval.' });
        }

        if (manager.verificationStatus === 'rejected') {
            return res.status(403).json({ message: 'Your account has been rejected by Admin.' });
        }

        // Credentials + status OK — issue JWT token directly (no login OTP for managers)
        const token = jwt.sign(
            { id: manager._id, email: manager.email, role: 'manager' },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        console.log(`[ManagerAuth] ✅ Manager ${manager.email} logged in successfully`);

        return res.json({
            message: 'Login successful',
            token,
            manager: formatManager(manager)
        });
    } catch (error) {
        console.error('Manager login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Verify login OTP, issue JWT
// POST /api/manager/verify-login-otp
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

        const manager = await Manager.findOne({ email: email.trim().toLowerCase() });
        if (!manager) {
            return res.status(404).json({ message: 'Account not found' });
        }

        const result = await validateLoginOTP(manager, otp);
        await manager.save();

        if (!result.ok) {
            return res.status(result.status).json({ message: result.message });
        }

        // OTP correct — issue JWT
        const token = jwt.sign(
            { id: manager._id, email: manager.email, role: 'manager' },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        console.log(`[ManagerAuth] ✅ Manager ${manager.email} logged in via OTP`);

        return res.json({
            message: 'Login successful',
            token,
            manager: formatManager(manager)
        });
    } catch (error) {
        console.error('Manager verify-login-otp error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESEND login OTP (30-second cooldown)
// POST /api/manager/resend-login-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-login-otp', managerLoginLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        const manager = await Manager.findOne({ email: email.trim().toLowerCase() });
        if (!manager) {
            return res.status(404).json({ message: 'Account not found' });
        }

        if (!canResendOTP(manager)) {
            const wait = resendCooldownSecondsRemaining(manager);
            return res.status(429).json({
                message: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting a new OTP.`
            });
        }

        const otp = await prepareLoginOTP(manager);
        await manager.save();

        try {
            await sendOtpEmail(manager.email, buildLoginOtpEmail(manager.fullName, otp, 'manager'));
        } catch (emailErr) {
            console.error('[ManagerResendOTP] Email failed:', emailErr.message);
            clearLoginOTP(manager);
            await manager.save();
            return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
        }

        return res.json({ message: 'New OTP sent to your registered email.' });
    } catch (error) {
        console.error('Manager resend-login-otp error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
