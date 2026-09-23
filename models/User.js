const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
{
    fullName: String,

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: String,

    instituteId: String,

    department: String,

    roomNumber: String,

    photoUrl: String,

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
    },

    // ── Email Verification OTP (hashed) ───────────────────────────────────
    emailVerified: {
        type: Boolean,
        default: false
    },

    emailVerifyOtp: {
        type: String,
        default: null
    },

    emailVerifyOtpExpiry: {
        type: Date,
        default: null
    },

    // ── Student Details ────────────────────────────────────────────────────
    batch: {
        type: String,
        default: "2023-2027"
    },

    hostelName: {
        type: String,
        default: "Girls Hostel"
    },

    // ── Verification ───────────────────────────────────────────────────────
    verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Manager',
        default: null
    },

    verificationTimestamp: {
        type: Date,
        default: null
    },

    // ── Current Meal Status ────────────────────────────────────────────────
    currentMorningStatus: {
        type: String,
        enum: ['ON', 'OFF'],
        default: 'ON'
    },

    currentEveningStatus: {
        type: String,
        enum: ['ON', 'OFF'],
        default: 'ON'
    }

}, {
    timestamps: true
});

userSchema.index({ verificationStatus: 1 });
userSchema.index({ instituteId: 1 });
userSchema.index({ department: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);