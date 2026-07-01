/**
 * Meal session timing (hostel timezone: local server time)
 * Morning: open 6:30 PM (prev day) → close 6:30 AM (locks)
 * Evening: open 6:30 AM → close 6:30 PM (locks)
 */

const OPEN_MINUTES = 6 * 60 + 30;   // 6:30
const EVENING_CLOSE = 18 * 60 + 30; // 18:30

function pad(n) {
    return String(n).padStart(2, '0');
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function getMinutes(now = new Date()) {
    return now.getHours() * 60 + now.getMinutes();
}

/** Calendar date the morning meal is served (closes 6:30 AM that day) */
function getMorningMealDate(now = new Date()) {
    const minutes = getMinutes(now);
    if (minutes < OPEN_MINUTES) {
        return formatDateKey(now);
    }
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return formatDateKey(next);
}

/** Calendar date the evening meal is served (closes 6:30 PM that day) */
function getEveningMealDate(now = new Date()) {
    return formatDateKey(now);
}

function getMealDateForSession(session, now = new Date()) {
    return session === 'Morning' ? getMorningMealDate(now) : getEveningMealDate(now);
}

function isMorningSessionOpen(now = new Date()) {
    const minutes = getMinutes(now);
    return minutes >= EVENING_CLOSE || minutes < OPEN_MINUTES;
}

function isEveningSessionOpen(now = new Date()) {
    const minutes = getMinutes(now);
    return minutes >= OPEN_MINUTES && minutes < EVENING_CLOSE;
}

function isSessionOpen(session, now = new Date()) {
    return session === 'Morning' ? isMorningSessionOpen(now) : isEveningSessionOpen(now);
}

/** Milliseconds until session closes */
function getTimeUntilClose(session, now = new Date()) {
    const close = new Date(now);
    if (session === 'Morning') {
        close.setHours(6, 30, 0, 0);
        if (getMinutes(now) >= OPEN_MINUTES) {
            close.setDate(close.getDate() + 1);
        }
    } else {
        close.setHours(18, 30, 0, 0);
        if (getMinutes(now) >= EVENING_CLOSE) {
            close.setDate(close.getDate() + 1);
        }
    }
    return Math.max(0, close - now);
}

function getSessionStatus(session, now = new Date()) {
    const open = isSessionOpen(session, now);
    return {
        session,
        open,
        locked: !open,
        mealDate: getMealDateForSession(session, now),
        closesInMs: open ? getTimeUntilClose(session, now) : 0
    };
}

function getBothSessionStatuses(now = new Date()) {
    return {
        morning: getSessionStatus('Morning', now),
        evening: getSessionStatus('Evening', now)
    };
}

module.exports = {
    OPEN_MINUTES,
    EVENING_CLOSE,
    formatDateKey,
    parseDateKey,
    getMorningMealDate,
    getEveningMealDate,
    getMealDateForSession,
    isMorningSessionOpen,
    isEveningSessionOpen,
    isSessionOpen,
    getTimeUntilClose,
    getSessionStatus,
    getBothSessionStatuses
};
