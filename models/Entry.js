const mongoose = require('mongoose');

const historyItemSchema = new mongoose.Schema({
    status: String,
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const entrySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    session: {
        type: String,
        enum: ['Morning', 'Evening'],
        required: true
    },
    mealDate: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['ON', 'OFF'],
        required: true
    },
    name: String,
    department: String,
    roomNumber: String,
    instituteId: String,
    email: String,
    locked: { type: Boolean, default: false },
    lockedAt: Date,
    history: [historyItemSchema]
}, {
    timestamps: true
});

entrySchema.index({ userId: 1, mealDate: 1, session: 1 }, { unique: true });
entrySchema.index({ mealDate: 1, session: 1 });
entrySchema.index({ department: 1 });
entrySchema.index({ roomNumber: 1 });

module.exports = mongoose.model('Entry', entrySchema);
