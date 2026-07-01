// ================== LOAD ENV FIRST ==================
require('dotenv').config({ path: './config.env' });

// ================== IMPORT MODULES ==================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// ================== IMPORT MODELS ==================
const User = require('./models/User');
const Entry = require('./models/Entry');

// ================== IMPORT ROUTES ==================
const adminAuthRoutes = require('./routes/adminAuth');
const adminUsersRoutes = require('./routes/adminUsers');
const managerAuthRoutes = require('./routes/managerAuth');
const managerRoutes = require('./routes/managerRoutes');
const managerAdminRoutes = require('./routes/managerAdmin');

// ================== IMPORT MIDDLEWARE ==================
const authAdmin = require('./middleware/authAdmin');
const authManager = require('./middleware/authManager');

// ================== IMPORT UTILS ==================
const { transporter } = require('./utils/email');
const {
    getMealDateForSession,
    isSessionOpen,
    getBothSessionStatuses
} = require('./utils/mealSession');
const { startMealCronJobs } = require('./utils/cronJobs');

const JWT_EXPIRY = '8h';

// ================== EXPRESS ==================
const app = express();
const port = 3000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        console.log('📦 Database:', mongoose.connection.db.databaseName);
        startMealCronJobs();
    })
    .catch((err) => console.error('❌ MongoDB Error:', err));

mongoose.connection.on('error', (err) => console.log('DB Error:', err));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// ================== ROUTES ==================
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', authAdmin, adminUsersRoutes);
app.use('/api/admin', authAdmin, managerAdminRoutes);
app.use('/api/manager', managerAuthRoutes);
app.use('/api/manager', authManager, managerRoutes);

// ================== PUBLIC SESSION STATUS ==================
app.get('/api/session-status', (req, res) => {
    res.json(getBothSessionStatuses());
});

// ================== USER REGISTRATION ==================
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, instituteId } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'Full name, email, and password are required' });
        }

        if (!instituteId || !/^\d{6}$/.test(instituteId)) {
            return res.status(400).json({ message: 'Institute ID must be exactly 6 digits' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const existingInstitute = await User.findOne({ instituteId });
        if (existingInstitute) {
            return res.status(400).json({ message: 'Institute ID already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            fullName: fullName.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            instituteId,
            verificationStatus: 'pending'
        });

        await newUser.save();

        const userObj = newUser.toObject();
        delete userObj.password;

        res.status(201).json({
            message: 'User registered successfully. Awaiting admin approval.',
            user: userObj
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// ================== USER LOGIN (JWT) ==================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email?.trim().toLowerCase() });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.verificationStatus === 'pending') {
            return res.status(403).json({ message: 'Your account is waiting for admin verification' });
        }

        if (user.verificationStatus === 'rejected') {
            return res.status(403).json({ message: 'Your account has been rejected' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const userObj = user.toObject();
        delete userObj.password;

        res.json({
            message: 'Login successful',
            token,
            user: userObj
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================== USER PROFILE ==================
app.post('/api/users/:userId/profile', upload.single('photo'), async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const { fullName, instituteId, department, roomNumber } = req.body;

        if (instituteId && !/^\d{6}$/.test(instituteId)) {
            return res.status(400).json({ message: 'Institute ID must be exactly 6 digits' });
        }

        user.fullName = fullName || user.fullName;
        user.instituteId = instituteId || user.instituteId;
        user.department = department || user.department;
        user.roomNumber = roomNumber || user.roomNumber;

        if (req.file) user.photoUrl = `/uploads/${req.file.filename}`;

        await user.save();
        const userObj = user.toObject();
        delete userObj.password;

        res.json({ message: 'Profile updated successfully', user: userObj });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: error.message || 'Update failed' });
    }
});

app.put('/api/users/:userId', upload.single('photo'), async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.fullName = req.body.fullName || user.fullName;
        user.department = req.body.department || user.department;
        user.roomNumber = req.body.roomNumber || user.roomNumber;
        user.instituteId = req.body.instituteId || user.instituteId;

        if (req.file) user.photoUrl = `/uploads/${req.file.filename}`;

        await user.save();
        const userObj = user.toObject();
        delete userObj.password;

        res.json({ message: 'Profile updated successfully', user: userObj });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error getting users' });
    }
});

// ================== MEAL ENTRIES (upsert until lock) ==================
app.post('/api/entries', async (req, res) => {
    try {
        const { userId, session, status } = req.body;

        if (!userId || !session || !status) {
            return res.status(400).json({ message: 'userId, session, and status are required' });
        }

        if (!['Morning', 'Evening'].includes(session)) {
            return res.status(400).json({ message: 'Invalid session' });
        }

        const normalizedStatus = status.toUpperCase();
        if (!['ON', 'OFF'].includes(normalizedStatus)) {
            return res.status(400).json({ message: 'Status must be ON or OFF' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.verificationStatus !== 'approved') {
            return res.status(403).json({ message: 'Account not approved for meal selection' });
        }

        const now = new Date();
        if (!isSessionOpen(session, now)) {
            return res.status(403).json({
                message: `${session} meal session is closed. Changes are locked.`
            });
        }

        const mealDate = getMealDateForSession(session, now);

        let entry = await Entry.findOne({ userId, session, mealDate });

        if (entry?.locked) {
            return res.status(403).json({ message: `${session} meal is locked for this date` });
        }

        if (entry) {
            entry.status = normalizedStatus;
            entry.name = user.fullName;
            entry.department = user.department;
            entry.roomNumber = user.roomNumber;
            entry.instituteId = user.instituteId;
            entry.email = user.email;
            entry.history.push({ status: normalizedStatus, timestamp: now });
            await entry.save();
        } else {
            entry = new Entry({
                userId,
                session,
                mealDate,
                status: normalizedStatus,
                name: user.fullName,
                department: user.department,
                roomNumber: user.roomNumber,
                instituteId: user.instituteId,
                email: user.email,
                history: [{ status: normalizedStatus, timestamp: now }]
            });
            await entry.save();
        }

        res.status(201).json({
            message: `${session} meal set to ${normalizedStatus}`,
            entry
        });
    } catch (error) {
        console.error('Entry error:', error);
        res.status(500).json({ message: error.message || 'Failed to save meal' });
    }
});

app.get('/api/entries', async (req, res) => {
    try {
        const entries = await Entry.find().sort({ updatedAt: -1 });
        res.json(entries);
    } catch (error) {
        res.status(500).json({ message: 'Error getting entries' });
    }
});

app.get('/api/entries/user/:userId', async (req, res) => {
    try {
        const { mealDate } = req.query;
        const query = { userId: req.params.userId };
        if (mealDate) query.mealDate = mealDate;

        const entries = await Entry.find(query).sort({ mealDate: -1, session: 1 });
        res.json(entries);
    } catch (error) {
        res.status(500).json({ message: 'Error getting user entries' });
    }
});

app.get('/api/entries/user/:userId/today', async (req, res) => {
    try {
        const now = new Date();
        const morningDate = getMealDateForSession('Morning', now);
        const eveningDate = getMealDateForSession('Evening', now);

        const entries = await Entry.find({
            userId: req.params.userId,
            mealDate: { $in: [morningDate, eveningDate] }
        });

        const morning = entries.find((e) => e.session === 'Morning');
        const evening = entries.find((e) => e.session === 'Evening');

        res.json({
            sessionStatus: getBothSessionStatuses(now),
            morningDate,
            eveningDate,
            morning: morning || null,
            evening: evening || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error getting today entries' });
    }
});

app.get('/api/users/verification/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            verificationStatus: user.verificationStatus || 'pending',
            verificationTimestamp: user.verificationTimestamp
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to get verification status' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const user = await User.findOne({ email: email?.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/users/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.photoUrl = `/uploads/${req.file.filename}`;
        await user.save();

        const userObj = user.toObject();
        delete userObj.password;

        res.json({ message: 'Photo uploaded successfully', photoUrl: user.photoUrl, user: userObj });
    } catch (error) {
        res.status(500).json({ message: 'Upload failed' });
    }
});

app.delete('/api/users/:userId/photo', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.photoUrl = null;
        await user.save();

        const userObj = user.toObject();
        delete userObj.password;
        res.json({ message: 'Photo removed successfully', user: userObj });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

app.delete('/api/entries/:entryId', authManager, async (req, res) => {
    try {
        const entry = await Entry.findById(req.params.entryId);
        if (!entry) return res.status(404).json({ message: 'Entry not found' });
        if (entry.locked) return res.status(400).json({ message: 'Cannot delete locked entry' });

        await Entry.findByIdAndDelete(req.params.entryId);
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting entry' });
    }
});

app.get('/dashboard.html', (req, res) => {
    res.redirect('/user_dashboard.html');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
