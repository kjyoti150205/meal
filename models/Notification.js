const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    recipientRole: {
        type: String,
        enum: ['student', 'manager', 'admin'],
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    icon: {
        type: String,
        default: 'fa-bell'
    },
    read: {
        type: Boolean,
        default: false,
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

notificationSchema.index({ recipientId: 1, recipientRole: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, recipientRole: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
