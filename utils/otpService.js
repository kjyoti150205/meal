'use strict';
/**
 * otpService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core OTP logic for Hostel Meal Tracker.
 *
 * Features:
 *  - CSPRNG 6-digit generation (crypto.randomInt(100000, 1000000))
 *  - Hashing with bcryptjs (cost 10)
 *  - Backwards-compatibility for bcrypt ($2a$, $2b$, $2y$) and legacy plain text
 *  - Timezone-safe UTC timestamp expiry checks
 *  - Independent field tracking for Login, Registration, and Password Reset
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const bcrypt  = require('bcryptjs');

const OTP_EXPIRY_MS       = 5  * 60 * 1000;  // 5 minutes
const RESEND_COOLDOWN_MS  = 60 * 1000;        // 60 seconds
const MAX_ATTEMPTS        = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Generate a cryptographically secure 6-digit OTP (string)
// ─────────────────────────────────────────────────────────────────────────────
function generateOTP() {
    return String(crypto.randomInt(100000, 1000000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash an OTP for safe storage
// ─────────────────────────────────────────────────────────────────────────────
async function hashOTP(otp) {
    if (!otp) return null;
    return bcrypt.hash(String(otp).trim(), 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify a plain-text OTP against stored hash (with legacy plain-text fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function verifyOTP(plainOtp, storedHash) {
    if (!plainOtp || !storedHash) return false;

    const cleanPlain  = String(plainOtp).trim();
    const cleanStored = String(storedHash).trim();

    if (cleanStored.startsWith('$2a$') || cleanStored.startsWith('$2b$') || cleanStored.startsWith('$2y$')) {
        try {
            return await bcrypt.compare(cleanPlain, cleanStored);
        } catch (err) {
            console.error('[OTP Engine] bcrypt.compare error:', err.message);
            return false;
        }
    }

    // Fallback comparison for legacy unhashed OTPs in MongoDB
    return cleanPlain === cleanStored;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prepare login OTP fields on a model document and return the plain-text OTP.
// Caller must save the document.
// ─────────────────────────────────────────────────────────────────────────────
async function prepareLoginOTP(doc) {
    const otp = generateOTP();

    doc.loginOtp         = await hashOTP(otp);
    doc.loginOtpExpiry   = new Date(Date.now() + OTP_EXPIRY_MS);
    doc.loginOtpAttempts = 0;
    doc.loginOtpLastSent = new Date();

    return otp;  // plain-text — send via email, never store or return in API
}

// ─────────────────────────────────────────────────────────────────────────────
// Prepare forgot-password OTP fields on a model document.
// Caller must save the document.
// ─────────────────────────────────────────────────────────────────────────────
async function prepareForgotPasswordOTP(doc) {
    const otp = generateOTP();

    doc.resetOTP       = await hashOTP(otp);
    doc.resetOTPExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    doc.otpVerified    = false;

    return otp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prepare email-verification OTP fields on a User document.
// Caller must save the document.
// ─────────────────────────────────────────────────────────────────────────────
async function prepareEmailVerifyOTP(doc) {
    const otp = generateOTP();

    doc.emailVerifyOtp       = await hashOTP(otp);
    doc.emailVerifyOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    doc.emailVerified        = false;

    return otp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear login OTP fields (call after successful verification OR invalidation)
// ─────────────────────────────────────────────────────────────────────────────
function clearLoginOTP(doc) {
    doc.loginOtp         = null;
    doc.loginOtpExpiry   = null;
    doc.loginOtpAttempts = 0;
    doc.loginOtpLastSent = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear forgot-password OTP fields
// ─────────────────────────────────────────────────────────────────────────────
function clearForgotPasswordOTP(doc) {
    doc.resetOTP       = null;
    doc.resetOTPExpiry = null;
    doc.otpVerified    = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate a login OTP submission.
// Returns { ok: true } or { ok: false, status, message, maxed }
// ─────────────────────────────────────────────────────────────────────────────
async function validateLoginOTP(doc, plainOtp) {
    if (!doc.loginOtp || !doc.loginOtpExpiry) {
        return { ok: false, status: 400, message: 'No OTP found. Please request a new one.' };
    }

    const expiryTime = new Date(doc.loginOtpExpiry).getTime();
    if (isNaN(expiryTime) || Date.now() > expiryTime) {
        clearLoginOTP(doc);
        return { ok: false, status: 400, message: 'OTP has expired. Please request a new one.' };
    }

    if ((doc.loginOtpAttempts || 0) >= MAX_ATTEMPTS) {
        clearLoginOTP(doc);
        return { ok: false, status: 429, message: 'Too many failed attempts. Please request a new OTP.', maxed: true };
    }

    const match = await verifyOTP(plainOtp, doc.loginOtp);

    if (!match) {
        doc.loginOtpAttempts = (doc.loginOtpAttempts || 0) + 1;
        const remaining = MAX_ATTEMPTS - doc.loginOtpAttempts;

        if (doc.loginOtpAttempts >= MAX_ATTEMPTS) {
            clearLoginOTP(doc);
            return { ok: false, status: 429, message: 'Too many failed attempts. OTP invalidated. Please request a new one.', maxed: true };
        }

        return {
            ok: false,
            status: 400,
            message: `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        };
    }

    clearLoginOTP(doc);
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate an email-verification OTP submission (Registration)
// ─────────────────────────────────────────────────────────────────────────────
async function validateEmailVerifyOTP(doc, plainOtp) {
    if (!doc.emailVerifyOtp || !doc.emailVerifyOtpExpiry) {
        return { ok: false, status: 400, message: 'No verification OTP found. Please request a new one.' };
    }

    const expiryTime = new Date(doc.emailVerifyOtpExpiry).getTime();
    if (isNaN(expiryTime) || Date.now() > expiryTime) {
        doc.emailVerifyOtp       = null;
        doc.emailVerifyOtpExpiry = null;
        return { ok: false, status: 400, message: 'OTP has expired. Please request a new one.' };
    }

    const match = await verifyOTP(plainOtp, doc.emailVerifyOtp);
    if (!match) {
        return { ok: false, status: 400, message: 'Invalid OTP' };
    }

    doc.emailVerified        = true;
    doc.emailVerifyOtp       = null;
    doc.emailVerifyOtpExpiry = null;
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate a forgot-password OTP submission
// ─────────────────────────────────────────────────────────────────────────────
async function validateForgotPasswordOTP(doc, plainOtp) {
    if (!doc.resetOTP || !doc.resetOTPExpiry) {
        return { ok: false, status: 400, message: 'Please request a new OTP' };
    }

    const expiryTime = new Date(doc.resetOTPExpiry).getTime();
    if (isNaN(expiryTime) || Date.now() > expiryTime) {
        clearForgotPasswordOTP(doc);
        return { ok: false, status: 400, message: 'OTP has expired. Please request a new one.' };
    }

    const match = await verifyOTP(plainOtp, doc.resetOTP);
    if (!match) {
        return { ok: false, status: 400, message: 'Invalid OTP' };
    }

    doc.otpVerified = true;
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if resend is allowed (30-second cooldown)
// ─────────────────────────────────────────────────────────────────────────────
function canResendOTP(doc) {
    if (!doc.loginOtpLastSent) return true;
    const elapsed = Date.now() - new Date(doc.loginOtpLastSent).getTime();
    return elapsed >= RESEND_COOLDOWN_MS;
}

function resendCooldownSecondsRemaining(doc) {
    if (!doc.loginOtpLastSent) return 0;
    const elapsed = Date.now() - new Date(doc.loginOtpLastSent).getTime();
    return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    OTP_EXPIRY_MS,
    RESEND_COOLDOWN_MS,
    MAX_ATTEMPTS,
    generateOTP,
    hashOTP,
    verifyOTP,
    prepareLoginOTP,
    prepareForgotPasswordOTP,
    prepareEmailVerifyOTP,
    clearLoginOTP,
    clearForgotPasswordOTP,
    validateLoginOTP,
    validateEmailVerifyOTP,
    validateForgotPasswordOTP,
    canResendOTP,
    resendCooldownSecondsRemaining
};
