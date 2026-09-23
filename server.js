const crypto = require('crypto');
// ================== LOAD ENV FIRST ==================
require('dotenv').config({ path: './config.env' });
require('dotenv').config();

// ================== IMPORT MODULES ==================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const studentLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});

const studentRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many registration attempts. Please try again later.' }
});

// ================== IMPORT MODELS ==================
const User = require('./models/User');
const Entry = require('./models/Entry');
const MealCounter = require("./models/MealCounter");

// ================== IMPORT ROUTES ==================
const adminAuthRoutes = require('./routes/adminAuth');
const adminUsersRoutes = require('./routes/adminUsers');
const managerAuthRoutes = require('./routes/managerAuth');
const managerRoutes = require('./routes/managerRoutes');
const managerAdminRoutes = require('./routes/managerAdmin');
const notificationRoutes = require('./routes/notificationRoutes');
const complaintRoutes = require('./routes/complaintRoutes');

// ================== IMPORT MIDDLEWARE ==================
const authAdmin = require('./middleware/authAdmin');
const authManager = require('./middleware/authManager');
const authStudent = require('./middleware/authStudent');

// ================== IMPORT UTILS ==================
const { transporter, sendMealEmail } = require('./utils/email');
const {
    getAdminManagerEmails,
    parseUserAgent,
    sendLoginEmail,
    sendProfileUpdateEmail
} = require('./utils/emailService');
const {
    prepareLoginOTP,
    prepareForgotPasswordOTP,
    prepareEmailVerifyOTP,
    validateLoginOTP,
    validateEmailVerifyOTP,
    validateForgotPasswordOTP,
    clearLoginOTP,
    clearForgotPasswordOTP,
    canResendOTP,
    resendCooldownSecondsRemaining
} = require('./utils/otpService');
const {
    buildLoginOtpEmail,
    buildEmailVerifyOtpEmail,
    buildForgotPasswordOtpEmail,
    sendOtpEmail
} = require('./utils/otpEmailTemplates');
const Admin = require('./models/Admin');
const Manager = require('./models/Manager');
const {
    getMealDateForSession,
    isSessionOpen,
    getBothSessionStatuses
} = require('./utils/mealSession');
const { startMealCronJobs } = require('./utils/cronJobs');
const {
    notifyStudent,
    notifyAllManagers,
    notifyAllAdmins,
    fireAndForget
} = require('./utils/notificationHelper');

const JWT_EXPIRY = '8h';

// ================== EXPRESS ==================
const app = express();
const port = process.env.PORT || 3000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const imageFileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/i;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    if (ok) return cb(null, true);
    cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'));
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFileFilter
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
app.use('/api/notifications', notificationRoutes);
app.use('/api/complaints', complaintRoutes);

// ================== PUBLIC SESSION STATUS ==================
app.get('/api/session-status', (req, res) => {
    res.json(getBothSessionStatuses());
});

// ================== USER REGISTRATION ==================
app.post('/api/register', studentRegisterLimiter, async (req, res) => {
    try {
        const { fullName, email, password, instituteId } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'Full name, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
            verificationStatus: 'pending',
            emailVerified: false
        });

        // Generate email-verification OTP BEFORE first save (hashed)
        const emailOtp = await prepareEmailVerifyOTP(newUser);
        await newUser.save();

        // Send email-verification OTP
        try {
            await sendOtpEmail(newUser.email, buildEmailVerifyOtpEmail(newUser.fullName, emailOtp));
        } catch (emailErr) {
            console.error('[Register] Email OTP send failed:', emailErr.message);
            // Continue — user can use /api/resend-email-verify-otp to get a new OTP
        }

        fireAndForget(async () => {
            await notifyStudent(newUser._id, {
                type: 'registration_success',
                title: 'Registration Successful',
                message: `Welcome ${newUser.fullName}! Please verify your email to activate your account.`,
                icon: 'fa-user-plus'
            });
            await notifyAllManagers({
                type: 'new_student_registration',
                title: 'New Student Registration',
                message: `${newUser.fullName} (${newUser.instituteId}) has registered and awaits verification.`,
                icon: 'fa-user-graduate'
            });
            await notifyAllManagers({
                type: 'verification_pending',
                title: 'Verification Pending',
                message: `Student ${newUser.fullName} is pending account verification.`,
                icon: 'fa-clock'
            });
            await notifyAllAdmins({
                type: 'new_student_registered',
                title: 'New Student Registered',
                message: `${newUser.fullName} registered with Institute ID ${newUser.instituteId}.`,
                icon: 'fa-user-plus'
            });
        });

        const userObj = newUser.toObject();
        delete userObj.password;
        delete userObj.emailVerifyOtp;
        delete userObj.emailVerifyOtpExpiry;

        res.status(201).json({
            message: 'Registration successful! Please check your email for a verification OTP.',
            requiresEmailVerification: true,
            email: newUser.email,
            user: userObj
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// ================== USER LOGIN — STEP 1 (send OTP) ==================
const verifyLoginOtpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many OTP attempts. Please try again later.' }
});

// ================== USER LOGIN — OPTION 1 (Email + Password) ==================
app.post('/api/login', studentLoginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Please verify your email address first.',
                requiresEmailVerification: true,
                email: user.email
            });
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

        // Option 1 Credentials verified — Issue JWT immediately
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const userObj = user.toObject();
        delete userObj.password;
        delete userObj.loginOtp;
        delete userObj.loginOtpExpiry;
        delete userObj.loginOtpAttempts;
        delete userObj.loginOtpLastSent;

        const loginTime = new Date();

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'login',
                title: 'Login Successful',
                message: `You logged in to Meal Tracker at ${loginTime.toLocaleString()}.`,
                icon: 'fa-sign-in-alt'
            });
        });

        const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'Unknown';
        const ip    = rawIp.split(',')[0].trim();
        const { browser, device } = parseUserAgent(req.headers['user-agent']);

        setImmediate(async () => {
            try {
                const adminManagerEmails = await getAdminManagerEmails();
                const recipients = [...new Set([user.email, ...adminManagerEmails].filter(Boolean))];
                await sendLoginEmail(user, { ip, browser, device, loginTime }, recipients);
            } catch (emailErr) {
                console.error('[LoginEmail] ❌ Failed:', emailErr.message);
            }
        });

        console.log(`[StudentAuth] ✅ Student ${user.email} logged in via Email+Password`);

        return res.json({
            message: 'Login successful',
            token,
            user: userObj
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================== USER LOGIN — OPTION 2 (Request Login OTP) ==================
app.post('/api/request-login-otp', studentLoginLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email address is required' });

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'No student account found with this email address' });

        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Please verify your email address first.',
                requiresEmailVerification: true,
                email: user.email
            });
        }

        if (user.verificationStatus === 'pending') {
            return res.status(403).json({ message: 'Your account is waiting for admin verification' });
        }

        if (user.verificationStatus === 'rejected') {
            return res.status(403).json({ message: 'Your account has been rejected' });
        }

        if (!canResendOTP(user) && user.loginOtp && user.loginOtpExpiry && new Date(user.loginOtpExpiry).getTime() > Date.now()) {
            const remaining = resendCooldownSecondsRemaining(user);
            return res.json({
                requiresOtp: true,
                email: user.email,
                message: `OTP already sent to your email. Please check your inbox or wait ${remaining}s before resending.`,
                cooldownSeconds: remaining
            });
        }

        const otp = await prepareLoginOTP(user);
        await user.save();

        try {
            await sendOtpEmail(user.email, buildLoginOtpEmail(user.fullName, otp, 'student'));
        } catch (emailErr) {
            console.error('[StudentLoginOTP] Email failed:', emailErr.message);
            clearLoginOTP(user);
            await user.save();
            return res.status(500).json({ message: 'Failed to send OTP email. Please try again.' });
        }

        return res.json({
            requiresOtp: true,
            email: user.email,
            message: 'A 6-digit OTP has been sent to your registered email. Please check your inbox.',
            cooldownSeconds: 60
        });
    } catch (error) {
        console.error('Request login OTP error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================== USER LOGIN — STEP 2 (verify OTP, issue JWT) ==================
app.post('/api/verify-login-otp', verifyLoginOtpLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });
        if (!/^\d{6}$/.test(String(otp).trim())) return res.status(400).json({ message: 'OTP must be a 6-digit number' });

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'Account not found' });

        const result = await validateLoginOTP(user, otp);
        await user.save();

        if (!result.ok) {
            return res.status(result.status).json({ message: result.message });
        }

        // OTP correct — issue JWT
        const token = jwt.sign(
            { id: user._id, email: user.email, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const userObj = user.toObject();
        delete userObj.password;
        delete userObj.loginOtp;
        delete userObj.loginOtpExpiry;
        delete userObj.loginOtpAttempts;
        delete userObj.loginOtpLastSent;

        const loginTime = new Date();

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'login',
                title: 'Login Successful',
                message: `You logged in to Meal Tracker at ${loginTime.toLocaleString()}.`,
                icon: 'fa-sign-in-alt'
            });
        });

        const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'Unknown';
        const ip    = rawIp.split(',')[0].trim();
        const { browser, device } = parseUserAgent(req.headers['user-agent']);

        setImmediate(async () => {
            try {
                const adminManagerEmails = await getAdminManagerEmails();
                const recipients = [...new Set([user.email, ...adminManagerEmails].filter(Boolean))];
                await sendLoginEmail(user, { ip, browser, device, loginTime }, recipients);
            } catch (emailErr) {
                console.error('[LoginEmail] ❌ Failed:', emailErr.message);
            }
        });

        console.log(`[StudentAuth] ✅ Student ${user.email} logged in via OTP`);

        return res.json({
            message: 'Login successful',
            token,
            user: userObj
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================== USER LOGIN — RESEND OTP ==================
app.post('/api/resend-login-otp', studentLoginLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'Account not found' });

        if (!canResendOTP(user)) {
            const wait = resendCooldownSecondsRemaining(user);
            return res.status(429).json({
                message: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting a new OTP.`
            });
        }

        const otp = await prepareLoginOTP(user);
        await user.save();

        try {
            await sendOtpEmail(user.email, buildLoginOtpEmail(user.fullName, otp, 'student'));
        } catch (emailErr) {
            console.error('[StudentResendOTP] Email failed:', emailErr.message);
            clearLoginOTP(user);
            await user.save();
            return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
        }

        return res.json({ message: 'New OTP sent to your registered email.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ================== FORGOT PASSWORD ==================
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many OTP requests. Please try again after 15 minutes.' }
});

app.post('/api/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        // Generic response — don't reveal if email exists
        if (!user) {
            return res.json({ message: 'OTP sent successfully' });
        }

        // Generate hashed OTP (secure storage)
        const otp = await prepareForgotPasswordOTP(user);
        await user.save();

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'forgot_password',
                title: 'Password Reset Requested',
                message: 'An OTP has been sent to your email for password reset.',
                icon: 'fa-envelope'
            });
        });

        try {
            await sendOtpEmail(user.email, buildForgotPasswordOtpEmail(user.fullName, otp, 'student'));
        } catch (emailErr) {
            console.error('[ForgotPwd] Email failed:', emailErr.message);
            clearForgotPasswordOTP(user);
            await user.save();
            return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
        }

        res.json({ message: 'OTP sent successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ================== RESET PASSWORD ==================
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword, confirmPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ message: 'Email and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        if (confirmPassword && newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.otpVerified) {
            return res.status(400).json({ message: 'OTP verification required before resetting password' });
        }

        if (!user.resetOTPExpiry || user.resetOTPExpiry < new Date()) {
            clearForgotPasswordOTP(user);
            await user.save();
            return res.status(400).json({ message: 'OTP has expired. Please start the reset process again.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        clearForgotPasswordOTP(user);
        await user.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});
// ================== USER PROFILE ==================
async function handleProfileUpdate(req, res) {
    try {
        if (req.user.role === 'student' && req.user.id !== req.params.userId) {
            return res.status(403).json({ message: "Forbidden: Cannot update another user's profile" });
        }

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const { fullName, instituteId, department, roomNumber } = req.body;

        // ── Snapshot BEFORE changes for the diff email ───────────────────────
        const snapshot = {
            fullName:    user.fullName,
            instituteId: user.instituteId,
            department:  user.department,
            roomNumber:  user.roomNumber,
            photoUrl:    user.photoUrl
        };

        if (instituteId) {
            const trimmedInstId = String(instituteId).trim();
            if (!/^\d{6}$/.test(trimmedInstId)) {
                return res.status(400).json({ message: 'Institute ID must be exactly 6 digits' });
            }
            const existingInst = await User.findOne({ instituteId: trimmedInstId, _id: { $ne: user._id } });
            if (existingInst) {
                return res.status(400).json({ message: 'Institute ID already registered to another user' });
            }
            user.instituteId = trimmedInstId;
        }

        if (fullName && fullName.trim()) user.fullName = fullName.trim();
        if (department !== undefined) user.department = String(department).trim();
        if (roomNumber !== undefined) user.roomNumber = String(roomNumber).trim();

        if (req.file) {
            user.photoUrl = `/uploads/${req.file.filename}`;
        }

        user.updatedAt = new Date();
        await user.save();

        // ── Build change diff ─────────────────────────────────────────────────
        const changes = [];
        if (snapshot.fullName    !== user.fullName)    changes.push({ field: 'Full Name',    previous: snapshot.fullName,    updated: user.fullName });
        if (snapshot.instituteId !== user.instituteId) changes.push({ field: 'Institute ID',  previous: snapshot.instituteId, updated: user.instituteId });
        if (snapshot.department  !== user.department)  changes.push({ field: 'Department',    previous: snapshot.department,  updated: user.department });
        if (snapshot.roomNumber  !== user.roomNumber)  changes.push({ field: 'Room Number',   previous: snapshot.roomNumber,  updated: user.roomNumber });
        if (req.file && snapshot.photoUrl !== user.photoUrl) changes.push({ field: 'Profile Photo', previous: 'Previous photo', updated: 'New photo uploaded' });

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'profile_updated',
                title: 'Profile Updated',
                message: 'Your profile information has been updated successfully.',
                icon: 'fa-user-edit'
            });
        });

        // ── Profile update email ──────────────────────────────────────────────
        setImmediate(async () => {
            try {
                const adminManagerEmails = await getAdminManagerEmails();
                const recipients = [...new Set([user.email, ...adminManagerEmails].filter(Boolean))];
                await sendProfileUpdateEmail(user, changes, recipients);
            } catch (emailErr) {
                console.error('[ProfileEmail] ❌ Failed (DB unchanged):', emailErr.message);
            }
        });

        const userObj = user.toObject();
        delete userObj.password;

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: userObj
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ success: false, message: error.message || 'Update failed' });
    }
}

app.post('/api/users/:userId/profile', authStudent, upload.single('photo'), handleProfileUpdate);
app.put('/api/users/:userId', authStudent, upload.single('photo'), handleProfileUpdate);
app.get('/api/users', authManager, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error getting users' });
    }
});
// ================== VERIFY FORGOT-PASSWORD OTP ==================
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const result = await validateForgotPasswordOTP(user, otp);
        await user.save();

        if (!result.ok) {
            return res.status(result.status).json({ message: result.message });
        }

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'email_verification',
                title: 'OTP Verified',
                message: 'Your OTP has been verified successfully.',
                icon: 'fa-check-circle'
            });
        });

        res.json({ message: 'OTP verified successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ================== EMAIL VERIFICATION OTP (Registration) ==================
app.post('/api/verify-email-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

        const user = await User.findOne({ email: String(email).trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.emailVerified) {
            return res.json({ message: 'Email already verified.' });
        }

        const result = await validateEmailVerifyOTP(user, otp);
        await user.save();

        if (!result.ok) {
            return res.status(result.status).json({ message: result.message });
        }

        console.log(`[StudentAuth] ✅ Student ${user.email} verified email via OTP`);

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'email_verified',
                title: 'Email Verified',
                message: 'Your email address has been verified successfully. Awaiting admin approval.',
                icon: 'fa-check-circle'
            });
        });

        res.json({ message: 'Email verified successfully! Your account is pending admin approval.' });
    } catch (error) {
        console.error('Verify email OTP error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ================== RESEND EMAIL VERIFICATION OTP ==================
app.post('/api/resend-email-verify-otp', studentLoginLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.emailVerified) {
            return res.json({ message: 'Email already verified.' });
        }

        const otp = await prepareEmailVerifyOTP(user);
        await user.save();

        try {
            await sendOtpEmail(user.email, buildEmailVerifyOtpEmail(user.fullName, otp));
        } catch (emailErr) {
            console.error('[EmailVerifyResend] Failed:', emailErr.message);
            user.emailVerifyOtp = null;
            user.emailVerifyOtpExpiry = null;
            await user.save();
            return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
        }

        res.json({ message: 'Verification OTP resent to your email.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ================== MEAL ENTRIES (upsert until lock) ==================
// ================== MEAL ENTRIES (upsert until lock) ==================
app.post('/api/entries', authStudent, async (req, res) => {
    try {
        const { userId, session, status } = req.body;

        if (!userId || !session || !status) {
            return res.status(400).json({ message: 'userId, session, and status are required' });
        }

        if (req.user.role === 'student' && req.user.id !== userId) {
            return res.status(403).json({ message: "Forbidden: Cannot alter another user's meal status" });
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
        const entryExisted = !!entry;

        if (entry?.locked) {
            return res.status(403).json({ message: `${session} meal is locked for this date` });
        }

        let previousStatus = 'ON';
        if (entry) {
            previousStatus = entry.status;
        } else if (session === 'Morning') {
            previousStatus = user.currentMorningStatus || 'ON';
        } else if (session === 'Evening') {
            previousStatus = user.currentEveningStatus || 'ON';
        }

    // Update current meal status in User model
if (session === "Morning") {
    user.currentMorningStatus = normalizedStatus;
} else if (session === "Evening") {
    user.currentEveningStatus = normalizedStatus;
}

await user.save();

if (entry) {
    entry.status = normalizedStatus;
    entry.name = user.fullName;
    entry.department = user.department;
    entry.roomNumber = user.roomNumber;
    entry.instituteId = user.instituteId;
    entry.email = user.email;
    entry.history.push({
        status: normalizedStatus,
        timestamp: now
    });

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
        history: [{
            status: normalizedStatus,
            timestamp: now
        }]
    });

    await entry.save();
}

    // Sync the MealCounter document after any meal status change.
    // MealCounter.adjustCounter() now calls recalcFromUsers() internally,
    // which counts distinct approved students (Morning ON OR Evening ON)
    // so totalActiveMeals is always a unique-student count, never a double-counted sum.
    await MealCounter.adjustCounter(session, 0);

        // ── In-app notifications (non-blocking) ───────────────────────────────
        fireAndForget(async () => {
            const mealLabel = `${session} Meal ${normalizedStatus}`;
            const typeKey = `${session.toLowerCase()}_meal_${normalizedStatus.toLowerCase()}`;

            await notifyStudent(userId, {
                type: typeKey,
                title: mealLabel,
                message: `Your ${session.toLowerCase()} meal has been set to ${normalizedStatus} for ${mealDate}.`,
                icon: normalizedStatus === 'ON' ? 'fa-utensils' : 'fa-ban',
                metadata: { session, status: normalizedStatus, mealDate }
            });

            if (entryExisted && previousStatus !== normalizedStatus) {
                await notifyStudent(userId, {
                    type: 'meal_updated',
                    title: 'Meal Updated',
                    message: `Your ${session.toLowerCase()} meal status was updated to ${normalizedStatus}.`,
                    icon: 'fa-sync-alt',
                    metadata: { session, status: normalizedStatus, mealDate }
                });
            }
        });

        // ── Email notification ────────────────────────────────────────────────
        // Only send when the status actually CHANGED to avoid duplicates.
        // Covers both: OFF→ON  (meal confirmed)  and  ON→OFF  (meal cancelled).
        if (previousStatus !== normalizedStatus) {
            // Collect all recipient email addresses
            try {
                const recipients = [];

                // 1. Student
                if (user.email) recipients.push(user.email);

                // 2. All approved managers
                const managers = await Manager.find(
                    { verificationStatus: 'approved' },
                    'email'
                ).lean();
                managers.forEach(m => { if (m.email) recipients.push(m.email); });

                // 3. All admins
                const admins = await Admin.find({}, 'email').lean();
                admins.forEach(a => { if (a.email) recipients.push(a.email); });

                // 4. Send (deduplication happens inside sendMealEmail)
                await sendMealEmail(
                    {
                        studentName: user.fullName,
                        instituteId: user.instituteId,
                        department:  user.department  || '—',
                        hostelName:  user.hostelName  || '—',
                        roomNumber:  user.roomNumber   || '—',
                        session,
                        status:      normalizedStatus,
                        mealDate,
                        timestamp:   now
                    },
                    recipients
                );
            } catch (emailErr) {
                // Per requirements: do NOT rollback the DB — just log and continue
                console.error('[MealEmail] ❌ Email send failed (DB unchanged):', emailErr.message);
            }
        } else {
            console.log(`[MealEmail] ℹ️  Status unchanged (${normalizedStatus}) — duplicate email suppressed.`);
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

app.get('/api/entries', authManager, async (req, res) => {
    try {
        const entries = await Entry.find().sort({ updatedAt: -1 });
        res.json(entries);
    } catch (error) {
        res.status(500).json({ message: 'Error getting entries' });
    }
});

app.get('/api/entries/user/:userId', authStudent, async (req, res) => {
    try {
        if (req.user.role === 'student' && req.user.id !== req.params.userId) {
            return res.status(403).json({ message: "Forbidden: Cannot access another user's entries" });
        }
        const { mealDate } = req.query;
        const query = { userId: req.params.userId };
        if (mealDate) query.mealDate = mealDate;

        const entries = await Entry.find(query).sort({ mealDate: -1, session: 1 });
        res.json(entries);
    } catch (error) {
        res.status(500).json({ message: 'Error getting user entries' });
    }
});

app.get('/api/entries/user/:userId/today', authStudent, async (req, res) => {
    try {
        if (req.user.role === 'student' && req.user.id !== req.params.userId) {
            return res.status(403).json({ message: "Forbidden: Cannot access another user's entries" });
        }
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

app.get('/api/users/verification/:userId', authStudent, async (req, res) => {
    try {
        if (req.user.role === 'student' && req.user.id !== req.params.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
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
        const { email, otp, newPassword } = req.body;

        if (!email || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Valid email and password (minimum 6 characters) are required' });
        }

        const user = await User.findOne({ email: email?.trim().toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.otpVerified) {
            return res.status(400).json({ message: 'OTP verification required before resetting password' });
        }

        if (otp && user.resetOTP !== String(otp).trim()) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        if (!user.resetOTPExpiry || Date.now() > user.resetOTPExpiry) {
            user.resetOTP = null;
            user.resetOTPExpiry = null;
            user.otpVerified = false;
            await user.save();
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetOTP = null;
        user.resetOTPExpiry = null;
        user.otpVerified = false;
        await user.save();

        fireAndForget(async () => {
            await notifyStudent(user._id, {
                type: 'password_changed',
                title: 'Password Changed',
                message: 'Your password has been changed successfully.',
                icon: 'fa-key'
            });
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

app.post('/api/users/upload-photo', authStudent, upload.single('photo'), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        if (req.user.role === 'student' && req.user.id !== userId) {
            return res.status(403).json({ message: "Forbidden" });
        }

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

app.delete('/api/users/:userId/photo', authStudent, async (req, res) => {
    try {
        if (req.user.role === 'student' && req.user.id !== req.params.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
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
    console.log(`Server running on port ${port}`);
});
