const express = require('express');
const path = require('path');
const multer = require('multer');
const User = require('../models/User');
const Entry = require('../models/Entry');
const MealSummary = require('../models/MealSummary');
const {
    getMealDateForSession,
    getBothSessionStatuses,
    isSessionOpen,
    formatDateKey,
    parseDateKey
} = require('../utils/mealSession');
const { getLiveCounts } = require('../utils/mealReports');

const router = express.Router();

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => cb(null, `mgr-${Date.now()}${path.extname(file.originalname)}`)
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/\.(jpg|jpeg|png|webp)$/i.test(file.originalname)) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

function escapeCsv(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function buildPagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(query.limit, 10) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

function sortUsers(users, sortBy, sortOrder) {
    const dir = sortOrder === 'desc' ? -1 : 1;
    return users.sort((a, b) => {
        let va = a[sortBy] ?? '';
        let vb = b[sortBy] ?? '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
    });
}

router.get('/me', async (req, res) => {
    try {
        const Manager = require('../models/Manager');
        const manager = await Manager.findById(req.manager.id).select('-password');
        if (!manager) return res.status(404).json({ message: 'Manager not found' });
        res.json(manager);
    } catch (error) {
        console.error('Manager profile error:', error);
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
});

router.put('/profile', upload.single('photo'), async (req, res) => {
    try {
        const Manager = require('../models/Manager');
        const manager = await Manager.findById(req.manager.id);
        if (!manager) return res.status(404).json({ message: 'Manager not found' });

        if (req.body.fullName) manager.fullName = req.body.fullName.trim();
        if (req.body.phone) manager.phone = req.body.phone.trim();
        if (req.body.hostelName) manager.hostelName = req.body.hostelName.trim();
        if (req.body.designation) manager.designation = req.body.designation.trim();
        if (req.file) manager.photoUrl = `/uploads/${req.file.filename}`;

        await manager.save();
        const obj = manager.toObject();
        delete obj.password;
        res.json({ message: 'Profile updated', manager: obj });
    } catch (error) {
        console.error('Manager profile update error:', error);
        res.status(500).json({ message: error.message || 'Update failed' });
    }
});

router.get('/session-status', (req, res) => {
    res.json(getBothSessionStatuses());
});

router.get('/dashboard/stats', async (req, res) => {
    try {
        const now = new Date();
        const morningDate = getMealDateForSession('Morning', now);
        const eveningDate = getMealDateForSession('Evening', now);

        const [
            totalStudents,
            verifiedStudents,
            pendingStudents,
            rejectedStudents,
            morningLive,
            eveningLive,
            recentEntries
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ verificationStatus: 'approved' }),
            User.countDocuments({ verificationStatus: 'pending' }),
            User.countDocuments({ verificationStatus: 'rejected' }),
            getLiveCounts('Morning', morningDate),
            getLiveCounts('Evening', eveningDate),
            Entry.find().sort({ updatedAt: -1 }).limit(8).lean()
        ]);

        const totalActiveMeals = morningLive.totalMealOn + eveningLive.totalMealOn;
        const attendanceNumerator = morningLive.totalMealOn + eveningLive.totalMealOn;
        const attendanceDenominator = verifiedStudents * 2 || 1;
        const attendancePercent = Math.round((attendanceNumerator / attendanceDenominator) * 1000) / 10;

        res.json({
            totalStudents,
            verifiedStudents,
            pendingStudents,
            rejectedStudents,
            todayMorningOn: morningLive.totalMealOn,
            todayMorningOff: morningLive.totalMealOff,
            todayEveningOn: eveningLive.totalMealOn,
            todayEveningOff: eveningLive.totalMealOff,
            totalActiveMeals,
            attendancePercent,
            liveMealCount: morningLive.liveMealCount + eveningLive.liveMealCount,
            morningDate,
            eveningDate,
            sessionStatus: getBothSessionStatuses(now),
            recentEntries
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ message: 'Failed to load dashboard stats' });
    }
});

router.get('/students', async (req, res) => {
    try {
        const { search, department, room, verification, mealStatus, session, sortBy, sortOrder } = req.query;
        const { page, limit, skip } = buildPagination(req.query);
        const now = new Date();
        const morningDate = getMealDateForSession('Morning', now);
        const eveningDate = getMealDateForSession('Evening', now);

        const filter = {};
        if (verification) filter.verificationStatus = verification;
        if (department) filter.department = new RegExp(department, 'i');
        if (room) filter.roomNumber = new RegExp(room, 'i');

        if (search) {
            const term = search.trim();
            filter.$or = [
                { fullName: new RegExp(term, 'i') },
                { email: new RegExp(term, 'i') },
                { instituteId: new RegExp(term, 'i') },
                { roomNumber: new RegExp(term, 'i') },
                { department: new RegExp(term, 'i') }
            ];
        }

        let users = await User.find(filter).select('-password').lean();
        const userIds = users.map((u) => u._id);

        const entries = await Entry.find({
            userId: { $in: userIds },
            mealDate: { $in: [morningDate, eveningDate] }
        }).lean();

        const entryMap = {};
        entries.forEach((e) => {
            entryMap[`${e.userId}_${e.session}`] = e;
        });

        let records = users.map((u) => {
            const morning = entryMap[`${u._id}_Morning`];
            const evening = entryMap[`${u._id}_Evening`];
            return {
                _id: u._id,
                fullName: u.fullName,
                email: u.email,
                instituteId: u.instituteId,
                department: u.department || '—',
                roomNumber: u.roomNumber || '—',
                photoUrl: u.photoUrl,
                verificationStatus: u.verificationStatus || 'pending',
                morningStatus: morning?.status || '—',
                eveningStatus: evening?.status || '—',
                registrationDate: u.createdAt,
                lastUpdated: u.updatedAt
            };
        });

        if (mealStatus && session) {
            records = records.filter((r) => {
                const st = session === 'Morning' ? r.morningStatus : r.eveningStatus;
                return (st || '').toUpperCase() === mealStatus.toUpperCase();
            });
        } else if (mealStatus) {
            records = records.filter((r) =>
                r.morningStatus.toUpperCase() === mealStatus.toUpperCase() ||
                r.eveningStatus.toUpperCase() === mealStatus.toUpperCase()
            );
        }

        const sortField = sortBy || 'fullName';
        records = sortUsers(records, sortField, sortOrder);

        const total = records.length;
        const paginated = records.slice(skip, skip + limit);

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            morningDate,
            eveningDate,
            students: paginated
        });
    } catch (error) {
        console.error('Students list error:', error);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
});

router.get('/student-records', async (req, res) => {
    try {
        const dateKey = req.query.date || formatDateKey(new Date());
        const { search, department, room, mealStatus, session, sortBy, sortOrder } = req.query;
        const { page, limit, skip } = buildPagination(req.query);

        const filter = { verificationStatus: 'approved' };
        if (department) filter.department = new RegExp(department, 'i');
        if (room) filter.roomNumber = new RegExp(room, 'i');
        if (search) {
            const term = search.trim();
            filter.$or = [
                { fullName: new RegExp(term, 'i') },
                { email: new RegExp(term, 'i') },
                { instituteId: new RegExp(term, 'i') },
                { roomNumber: new RegExp(term, 'i') },
                { department: new RegExp(term, 'i') }
            ];
        }

        let users = await User.find(filter).select('-password').lean();
        const entries = await Entry.find({ mealDate: dateKey }).lean();
        const entryMap = {};
        entries.forEach((e) => {
            entryMap[`${e.userId}_${e.session}`] = e;
        });

        let records = users.map((u) => {
            const morning = entryMap[`${u._id}_Morning`];
            const evening = entryMap[`${u._id}_Evening`];
            return {
                _id: u._id,
                name: u.fullName,
                email: u.email,
                instituteId: u.instituteId,
                department: u.department || '—',
                roomNumber: u.roomNumber || '—',
                photoUrl: u.photoUrl,
                morningStatus: morning?.status || '—',
                eveningStatus: evening?.status || '—',
                morningTime: morning?.updatedAt,
                eveningTime: evening?.updatedAt,
                date: dateKey
            };
        });

        if (mealStatus && session) {
            records = records.filter((r) => {
                const st = session === 'Morning' ? r.morningStatus : r.eveningStatus;
                return (st || '').toUpperCase() === mealStatus.toUpperCase();
            });
        }

        records = sortUsers(records, sortBy || 'name', sortOrder);
        const total = records.length;

        res.json({
            date: dateKey,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            students: records.slice(skip, skip + limit)
        });
    } catch (error) {
        console.error('Student records error:', error);
        res.status(500).json({ message: 'Failed to fetch student records' });
    }
});

router.get('/meal-history/:userId', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const user = await User.findById(req.params.userId).select('-password');
        if (!user) return res.status(404).json({ message: 'Student not found' });

        const query = { userId: user._id };
        if (startDate || endDate) {
            query.mealDate = {};
            if (startDate) query.mealDate.$gte = startDate;
            if (endDate) query.mealDate.$lte = endDate;
        }

        const entries = await Entry.find(query).sort({ mealDate: -1, session: 1 }).lean();
        const byDate = {};

        entries.forEach((e) => {
            if (!byDate[e.mealDate]) {
                byDate[e.mealDate] = { date: e.mealDate, morning: null, evening: null };
            }
            if (e.session === 'Morning') byDate[e.mealDate].morning = e.status;
            if (e.session === 'Evening') byDate[e.mealDate].evening = e.status;
        });

        res.json({
            student: {
                _id: user._id,
                fullName: user.fullName,
                instituteId: user.instituteId,
                department: user.department,
                roomNumber: user.roomNumber
            },
            history: Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
        });
    } catch (error) {
        console.error('Meal history error:', error);
        res.status(500).json({ message: 'Failed to fetch meal history' });
    }
});

router.get('/reports/daily', async (req, res) => {
    try {
        const dateKey = req.query.date || formatDateKey(new Date());
        const summaries = await MealSummary.find({ date: dateKey });
        const morningSummary = summaries.find((s) => s.session === 'Morning');
        const eveningSummary = summaries.find((s) => s.session === 'Evening');

        let morning = morningSummary;
        let evening = eveningSummary;

        if (!morningSummary?.finalized) {
            morning = await getLiveCounts('Morning', dateKey);
            morning.finalized = false;
        }
        if (!eveningSummary?.finalized) {
            evening = await getLiveCounts('Evening', dateKey);
            evening.finalized = false;
        }

        const totalStudents = morning.totalStudents || evening.totalStudents ||
            await User.countDocuments({ verificationStatus: 'approved' });

        res.json({
            date: dateKey,
            morningMealOn: morning.totalMealOn ?? 0,
            morningMealOff: morning.totalMealOff ?? 0,
            eveningMealOn: evening.totalMealOn ?? 0,
            eveningMealOff: evening.totalMealOff ?? 0,
            totalStudents,
            attendancePercent: Math.round(
                (((morning.totalMealOn ?? 0) + (evening.totalMealOn ?? 0)) / (totalStudents * 2 || 1)) * 1000
            ) / 10,
            mealCount: (morning.totalMealOn ?? 0) + (evening.totalMealOn ?? 0),
            morningFinalized: morningSummary?.finalized ?? false,
            eveningFinalized: eveningSummary?.finalized ?? false
        });
    } catch (error) {
        console.error('Daily report error:', error);
        res.status(500).json({ message: 'Failed to generate daily report' });
    }
});

router.get('/reports', async (req, res) => {
    try {
        const { startDate, endDate, session, department, room, search, mealStatus } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = { mealDate: { $gte: startDate, $lte: endDate } };
        } else if (req.query.date) {
            dateFilter = { mealDate: req.query.date };
        }

        let entries = await Entry.find({ ...dateFilter, locked: true }).sort({ mealDate: -1 }).lean();

        if (session) entries = entries.filter((e) => e.session === session);
        if (department) entries = entries.filter((e) => new RegExp(department, 'i').test(e.department || ''));
        if (room) entries = entries.filter((e) => new RegExp(room, 'i').test(e.roomNumber || ''));
        if (mealStatus) entries = entries.filter((e) => (e.status || '').toUpperCase() === mealStatus.toUpperCase());
        if (search) {
            const term = search.toLowerCase();
            entries = entries.filter((e) =>
                (e.name || '').toLowerCase().includes(term) ||
                (e.instituteId || '').toLowerCase().includes(term) ||
                (e.email || '').toLowerCase().includes(term)
            );
        }

        const departmentCounts = {};
        const sessionCounts = { Morning: 0, Evening: 0 };
        const statusCounts = { ON: 0, OFF: 0 };
        const dailyCounts = {};

        entries.forEach((entry) => {
            const dept = entry.department || 'Unknown';
            departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
            if (entry.session === 'Morning') sessionCounts.Morning++;
            if (entry.session === 'Evening') sessionCounts.Evening++;
            const status = (entry.status || '').toUpperCase();
            if (status === 'ON') statusCounts.ON++;
            if (status === 'OFF') statusCounts.OFF++;
            dailyCounts[entry.mealDate] = (dailyCounts[entry.mealDate] || 0) + 1;
        });

        res.json({
            totalEntries: entries.length,
            activeUsers: new Set(entries.map((e) => String(e.userId))).size,
            morningEntries: sessionCounts.Morning,
            eveningEntries: sessionCounts.Evening,
            statusCounts,
            departmentCounts,
            dailyCounts,
            entries
        });
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).json({ message: 'Failed to generate report' });
    }
});

router.get('/analytics', async (req, res) => {
    try {
        const { range } = req.query;
        const now = new Date();
        let days = 7;
        if (range === 'daily') days = 1;
        else if (range === 'weekly') days = 7;
        else if (range === 'monthly') days = 30;

        const start = new Date(now);
        start.setDate(start.getDate() - days + 1);
        const startKey = formatDateKey(start);
        const endKey = formatDateKey(now);

        const summaries = await MealSummary.find({
            date: { $gte: startKey, $lte: endKey },
            finalized: true
        }).sort({ date: 1 });

        const daily = {};
        const attendance = {};
        const deptCounts = {};

        summaries.forEach((s) => {
            if (!daily[s.date]) daily[s.date] = { date: s.date, on: 0, off: 0 };
            daily[s.date].on += s.totalMealOn;
            daily[s.date].off += s.totalMealOff;
            attendance[s.date] = s.attendancePercentage;

            const deptEntries = []; // populated from entries below
        });

        const entries = await Entry.find({
            mealDate: { $gte: startKey, $lte: endKey },
            status: 'ON',
            locked: true
        }).select('department mealDate session').lean();

        entries.forEach((e) => {
            const dept = e.department || 'Unknown';
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        });

        res.json({
            range: range || 'weekly',
            startDate: startKey,
            endDate: endKey,
            dailyTrend: Object.values(daily),
            attendanceGraph: Object.entries(attendance).map(([date, pct]) => ({ date, pct })),
            departmentMeals: deptCounts,
            summaries
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ message: 'Failed to load analytics' });
    }
});

router.get('/entries', async (req, res) => {
    try {
        const { session, search, startDate, endDate, mealDate } = req.query;
        const query = {};

        if (session) query.session = session;
        if (mealDate) query.mealDate = mealDate;
        if (startDate && endDate) query.mealDate = { $gte: startDate, $lte: endDate };

        let entries = await Entry.find(query).sort({ updatedAt: -1 }).lean();

        if (search) {
            const term = search.toLowerCase();
            entries = entries.filter((entry) =>
                (entry.name || '').toLowerCase().includes(term) ||
                (entry.department || '').toLowerCase().includes(term) ||
                (entry.roomNumber || '').toLowerCase().includes(term) ||
                (entry.instituteId || '').toLowerCase().includes(term)
            );
        }

        res.json(entries);
    } catch (error) {
        console.error('Fetch entries error:', error);
        res.status(500).json({ message: 'Failed to fetch entries' });
    }
});

router.get('/export/csv', async (req, res) => {
    try {
        const dateKey = req.query.date || formatDateKey(new Date());
        const entries = await Entry.find({ mealDate: dateKey }).sort({ name: 1 }).lean();

        const headers = ['Name', 'Institute ID', 'Email', 'Department', 'Room', 'Session', 'Status', 'Date', 'Locked'];
        const rows = entries.map((e) => [
            e.name, e.instituteId, e.email, e.department, e.roomNumber,
            e.session, e.status, e.mealDate, e.locked ? 'Yes' : 'No'
        ].map(escapeCsv).join(','));

        const csv = [headers.join(','), ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=meal-report-${dateKey}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({ message: 'Export failed' });
    }
});

router.get('/export/pdf', async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const dateKey = req.query.date || formatDateKey(new Date());
        const report = await MealSummary.find({ date: dateKey });
        const entries = await Entry.find({ mealDate: dateKey }).limit(200).lean();

        const doc = new PDFDocument({ margin: 40 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=meal-report-${dateKey}.pdf`);
        doc.pipe(res);

        doc.fontSize(18).text('Meal Tracker Report', { align: 'center' });
        doc.fontSize(12).text(`Date: ${dateKey}`, { align: 'center' });
        doc.moveDown();

        report.forEach((s) => {
            doc.text(`${s.session}: ON ${s.totalMealOn} | OFF ${s.totalMealOff} | Attendance ${s.attendancePercentage}%`);
        });
        doc.moveDown();
        doc.text('Student Records (sample):');
        entries.slice(0, 50).forEach((e) => {
            doc.fontSize(9).text(`${e.name} | ${e.session} | ${e.status} | ${e.department || '—'}`);
        });
        doc.end();
    } catch (error) {
        console.error('PDF export error:', error);
        res.status(500).json({ message: 'PDF export failed' });
    }
});

router.delete('/entries/:entryId', async (req, res) => {
    try {
        const entry = await Entry.findById(req.params.entryId);
        if (!entry) return res.status(404).json({ message: 'Entry not found' });
        if (entry.locked) return res.status(400).json({ message: 'Cannot delete locked entry' });
        await Entry.findByIdAndDelete(req.params.entryId);
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Delete entry error:', error);
        res.status(500).json({ message: 'Failed to delete entry' });
    }
});

router.get('/users', async (req, res) => {
    try {
        const users = await User.find({ verificationStatus: 'approved' })
            .select('-password')
            .sort({ fullName: 1 });
        res.json(users);
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
});

module.exports = router;
