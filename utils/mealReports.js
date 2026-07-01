const User = require('../models/User');
const Entry = require('../models/Entry');
const MealSummary = require('../models/MealSummary');
const { getMealDateForSession } = require('./mealSession');

/**
 * Finalize a meal session — snapshot final ON/OFF counts into MealSummary.
 * Uses latest Entry status per approved student for the given date+session.
 */
async function finalizeSession(session, dateKey) {
    const mealDate = dateKey || getMealDateForSession(session, new Date());

    const totalStudents = await User.countDocuments({ verificationStatus: 'approved' });

    const entries = await Entry.find({
        mealDate,
        session,
        locked: true
    });

    let totalMealOn = 0;
    let totalMealOff = 0;

    entries.forEach((entry) => {
        const status = (entry.status || '').toUpperCase();
        if (status === 'ON') totalMealOn++;
        else if (status === 'OFF') totalMealOff++;
    });

    const attendancePercentage = totalStudents > 0
        ? Math.round((totalMealOn / totalStudents) * 1000) / 10
        : 0;

    const summary = await MealSummary.findOneAndUpdate(
        { date: mealDate, session },
        {
            date: mealDate,
            session,
            totalMealOn,
            totalMealOff,
            totalStudents,
            attendancePercentage,
            finalized: true,
            finalizedAt: new Date()
        },
        { upsert: true, new: true }
    );

    return summary;
}

/** Lock all open entries for a session+date and compute summary */
async function lockAndFinalize(session, dateKey) {
    const mealDate = dateKey || getMealDateForSession(session, new Date());

    await Entry.updateMany(
        { mealDate, session, locked: { $ne: true } },
        { $set: { locked: true, lockedAt: new Date() } }
    );

    return finalizeSession(session, mealDate);
}

/** Live counts for dashboard (unfrozen session) */
async function getLiveCounts(session, mealDate) {
    const totalStudents = await User.countDocuments({ verificationStatus: 'approved' });

    const entries = await Entry.find({ mealDate, session });

    let on = 0;
    let off = 0;
    entries.forEach((e) => {
        const s = (e.status || '').toUpperCase();
        if (s === 'ON') on++;
        else if (s === 'OFF') off++;
    });

    return {
        mealDate,
        session,
        totalMealOn: on,
        totalMealOff: off,
        totalStudents,
        liveMealCount: on,
        attendancePercentage: totalStudents > 0
            ? Math.round((on / totalStudents) * 1000) / 10
            : 0
    };
}

module.exports = {
    finalizeSession,
    lockAndFinalize,
    getLiveCounts
};
