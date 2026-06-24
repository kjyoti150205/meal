const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    password: String,
    instituteId: String,
    department: String,
    roomNumber: String,
    photoUrl: String,

    // NEW FIELDS
    batch: {
        type: String,
        default: "2023-2027"
    },

    hostelName: {
        type: String,
        default: "Girls Hostel"
    },

    verificationStatus: {
        type: String,
        default: 'pending'
    },

    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId
    },

    verificationTimestamp: Date

}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);