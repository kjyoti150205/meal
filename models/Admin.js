const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'admin'
    },

    // ── Forgot Password OTP (hashed) ──────────────────────────────────────
    resetOTP: {
        type: String,
        default: null
    },
    resetOTPExpiry: {
        type: Date,
        default: null
    },
    otpVerified: {
        type: Boolean,
        default: false
    },

    // ── Login OTP (hashed) — 2-step login ─────────────────────────────────
    loginOtp: {
        type: String,
        default: null
    },
    loginOtpExpiry: {
        type: Date,
        default: null
    },
    loginOtpAttempts: {
        type: Number,
        default: 0
    },
    loginOtpLastSent: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('Admin', adminSchema);
