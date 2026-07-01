const cron = require('node-cron');
const { lockAndFinalize } = require('./mealReports');
const { getMorningMealDate, getEveningMealDate } = require('./mealSession');

function startMealCronJobs() {
    // Morning report — 6:30 AM daily
    cron.schedule('30 6 * * *', async () => {
        try {
            const dateKey = getMorningMealDate(new Date());
            console.log(`[CRON] Finalizing Morning session for ${dateKey}`);
            await lockAndFinalize('Morning', dateKey);
            console.log('[CRON] Morning session finalized');
        } catch (err) {
            console.error('[CRON] Morning finalize error:', err);
        }
    });

    // Evening report — 6:30 PM daily
    cron.schedule('30 18 * * *', async () => {
        try {
            const dateKey = getEveningMealDate(new Date());
            console.log(`[CRON] Finalizing Evening session for ${dateKey}`);
            await lockAndFinalize('Evening', dateKey);
            console.log('[CRON] Evening session finalized');
        } catch (err) {
            console.error('[CRON] Evening finalize error:', err);
        }
    });

    console.log('✅ Meal cron jobs scheduled (6:30 AM & 6:30 PM)');
}

module.exports = { startMealCronJobs };
