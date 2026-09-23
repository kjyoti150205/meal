const mongoose = require('mongoose');

const mealCounterSchema = new mongoose.Schema({
    morningActiveMeals: {
        type: Number,
        default: 0,
        min: 0
    },
    eveningActiveMeals: {
        type: Number,
        default: 0,
        min: 0
    },
    // totalActiveMeals = unique students with Morning ON OR Evening ON
    // (NOT a simple sum — students in both sessions count once)
    totalActiveMeals: {
        type: Number,
        default: 0,
        min: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

/**
 * Recalculate all three counters from the User collection.
 * This is the ONLY correct way to compute totalActiveMeals — it counts
 * distinct students, so a student with both Morning ON and Evening ON
 * is counted only ONCE in the total.
 *
 * morningActiveMeals = approved users with currentMorningStatus = 'ON'
 * eveningActiveMeals = approved users with currentEveningStatus = 'ON'
 * totalActiveMeals   = approved users with (currentMorningStatus = 'ON' OR currentEveningStatus = 'ON')
 */
mealCounterSchema.statics.recalcFromUsers = async function () {
    const User = mongoose.model('User');
    const approvedFilter = { verificationStatus: 'approved' };

    const [morningActive, eveningActive, totalActive] = await Promise.all([
        User.countDocuments({ ...approvedFilter, currentMorningStatus: 'ON' }),
        User.countDocuments({ ...approvedFilter, currentEveningStatus: 'ON' }),
        User.countDocuments({
            ...approvedFilter,
            $or: [
                { currentMorningStatus: 'ON' },
                { currentEveningStatus: 'ON' }
            ]
        })
    ]);

    let doc = await this.findOne();
    if (!doc) {
        doc = new this();
    }

    doc.morningActiveMeals = morningActive;
    doc.eveningActiveMeals = eveningActive;
    doc.totalActiveMeals   = totalActive;
    doc.lastUpdated        = new Date();

    await doc.save();
    return doc;
};

/**
 * Get the singleton counter document.
 * If it doesn't exist, initialise by recalculating from Users.
 */
mealCounterSchema.statics.getSingleton = async function () {
    let doc = await this.findOne();
    if (!doc) {
        // No document yet — bootstrap from actual user data
        doc = await this.recalcFromUsers();
    }
    return doc;
};

/**
 * Adjust morning or evening counter by delta (+1 / -1) after a single
 * student's meal status changes, then recompute totalActiveMeals
 * correctly from the User collection (unique-student count).
 *
 * @param {string} session - 'Morning' or 'Evening'
 * @param {number} delta   - +1 (OFF→ON) or -1 (ON→OFF), or 0 (no change)
 */
mealCounterSchema.statics.adjustCounter = async function (session, delta) {
    // Always recalc from Users — this is the only way to get totalActiveMeals
    // right (unique-student count, not a double-counted sum).
    const doc = await this.recalcFromUsers();
    return doc;
};

/**
 * Reset by re-reading from Users (no hardcoded values).
 */
mealCounterSchema.statics.resetCounter = async function () {
    return this.recalcFromUsers();
};

module.exports = mongoose.model('MealCounter', mealCounterSchema);