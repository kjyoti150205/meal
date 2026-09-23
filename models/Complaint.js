const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    studentName: { type: String, required: true },
    email: { type: String, required: true },
    instituteId: { type: String, default: '' },
    department: { type: String, default: '' },
    roomNumber: { type: String, default: '' },
    category: { type: String, required: true },
    subject: { type: String, required: true },
    description: { type: String, default: '' },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    image: { type: String, default: null },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Resolved', 'Rejected'],
        default: 'Pending'
    },
    managerReply: { type: String, default: '' },
    resolvedAt: { type: Date, default: null }
}, {
    timestamps: true
});

complaintSchema.pre('save', function() {
    if (this.studentId && !this.userId) this.userId = this.studentId;
    if (this.userId && !this.studentId) this.studentId = this.userId;
});

module.exports = mongoose.model('Complaint', complaintSchema);
