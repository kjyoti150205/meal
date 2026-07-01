const mongoose = require('mongoose');

const mealSummarySchema = new mongoose.Schema({
    date: {
        type: String,
        required: true
    },
    session: {
        type: String,
        enum: ['Morning', 'Evening'],
        required: true
    },
    totalMealOn: { type: Number, default: 0 },
    totalMealOff: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 },
    finalized: { type: Boolean, default: false },
    finalizedAt: Date
}, {
    timestamps: true
});

mealSummarySchema.index({ date: 1, session: 1 }, { unique: true });

module.exports = mongoose.model('MealSummary', mealSummarySchema);
