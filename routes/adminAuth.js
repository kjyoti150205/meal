const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Admin = require('../models/Admin');
const { sendPasswordResetOTP } = require('../utils/email');

const JWT_EXPIRY = '8h';

const router = express.Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;

const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many OTP requests. Please try again after 15 minutes.' }
});

const verifyOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Please try again later.' }
});

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function clearResetFields(admin) {
    admin.resetOTP = null;
    admin.resetOTPExpiry = null;
    admin.otpVerified = false;
}

router.post('/login', async (req, res) => {
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

        const token = jwt.sign(
            { id: admin._id, email: admin.email, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        res.json({
            message: 'Login successful',
            token,
            admin: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                createdAt: admin.createdAt
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const admin = await Admin.findOne({ email: normalizedEmail });

        if (!admin) {
            return res.status(404).json({ message: 'No admin account found with this email' });
        }

        const otp = generateOTP();
        const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

        admin.resetOTP = otp;
        admin.resetOTPExpiry = expiry;
        admin.otpVerified = false;
        await admin.save();

        await sendPasswordResetOTP(normalizedEmail, otp);

        res.json({ message: 'OTP sent to your registered email address' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Failed to send OTP. Please try again later.' });
    }
});

router.post('/verify-otp', verifyOtpLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
            return res.status(400).json({ message: 'A valid 6-digit OTP is required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const admin = await Admin.findOne({ email: normalizedEmail });

        if (!admin || !admin.resetOTP) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        if (!admin.resetOTPExpiry || admin.resetOTPExpiry < new Date()) {
            clearResetFields(admin);
            await admin.save();
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        if (admin.resetOTP !== String(otp).trim()) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        admin.otpVerified = true;
        await admin.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ message: 'Failed to verify OTP' });
    }
});

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

        const normalizedEmail = email.trim().toLowerCase();
        const admin = await Admin.findOne({ email: normalizedEmail });

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        if (!admin.otpVerified) {
            return res.status(400).json({ message: 'OTP verification required before resetting password' });
        }

        if (!admin.resetOTPExpiry || admin.resetOTPExpiry < new Date()) {
            clearResetFields(admin);
            await admin.save();
            return res.status(400).json({ message: 'OTP has expired. Please start the reset process again.' });
        }

        admin.password = await bcrypt.hash(newPassword, 10);
        clearResetFields(admin);
        await admin.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
});

module.exports = router;
