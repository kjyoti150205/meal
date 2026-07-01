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

    photoUrl: String

}, {
    timestamps: true
});

module.exports = mongoose.model('Manager', managerSchema);