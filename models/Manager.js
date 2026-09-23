const mongoose = require('mongoose');

const managerSchema = new mongoose.Schema({
    fullName: String,

    email: {
        type: String,
        unique: true
    },

    password: String,

    phone: String,

    managerId: {
        type: String,
        unique: true
    },

    hostelName: String,

    designation: String,

    verificationStatus: {
        type: String,
        default: "pending"
    },

    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId
    },

    verificationTimestamp: Date,

    photoUrl: String,

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

module.exports = mongoose.model('Manager', managerSchema);