'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    createComplaint,
    getMyComplaints,
    getAllComplaints,
    updateComplaint,
    deleteComplaint
} = require('../controllers/complaintController');

const authAny = require('../middleware/authAny');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const unique = `complaint-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, unique + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
               allowed.test(file.mimetype);
    if (ok) return cb(null, true);
    cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── Role-guard helper ────────────────────────────────────────────────────────
function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions.' });
        }
        next();
    };
}

// ===================== MIDDLEWARE =====================
// All complaint routes require a valid JWT (student, manager, or admin).
router.use(authAny);

// ===================== ROUTES =====================
// Student: submit a new complaint
router.post('/', requireRole('student'), upload.single('image'), createComplaint);

// Student: fetch own complaints by their MongoDB _id (single canonical route)
router.get('/my/:studentId', requireRole('student', 'manager', 'admin'), getMyComplaints);

// Manager/Admin: fetch all complaints with optional filters
router.get('/', requireRole('manager', 'admin'), getAllComplaints);

// Manager/Admin: update status or add a reply
router.put('/:id', requireRole('manager', 'admin'), updateComplaint);

// Manager/Admin: delete a complaint
router.delete('/:id', requireRole('manager', 'admin'), deleteComplaint);

module.exports = router;
