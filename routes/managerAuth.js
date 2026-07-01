const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Manager = require('../models/Manager');

const router = express.Router();
const JWT_EXPIRY = '8h';

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatManager(manager) {
    const obj = manager.toObject();
    delete obj.password;
    return obj;
}

router.post('/register', async (req, res) => {
    try {
        const { fullName, email, password, phone, managerId, hostelName, designation } = req.body;

        if (!fullName || !isValidEmail(email) || !password) {
            return res.status(400).json({ message: 'Full name, valid email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingManager = await Manager.findOne({ email: normalizedEmail });

        if (existingManager) {
            return res.status(400).json({ message: 'Manager already exists with this email' });
        }

        if (managerId) {
            const existingId = await Manager.findOne({ managerId: managerId.trim() });
            if (existingId) {
                return res.status(400).json({ message: 'Manager ID already registered' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newManager = new Manager({
            fullName: fullName.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            phone: phone?.trim() || '',
            managerId: managerId?.trim() || '',
            hostelName: hostelName?.trim() || '',
            designation: designation?.trim() || '',
            verificationStatus: 'pending'
        });

        await newManager.save();

        res.status(201).json({
            message: 'Registration successful. Your account is waiting for Admin approval.',
            manager: formatManager(newManager)
        });
    } catch (error) {
        console.error('Manager registration error:', error);
        res.status(500).json({ message: 'Registration failed. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!isValidEmail(email) || !password) {
            return res.status(400).json({ message: 'Valid email and password are required' });
        }

        const manager = await Manager.findOne({ email: email.trim().toLowerCase() });

        if (!manager) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, manager.password);

        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (manager.verificationStatus === 'pending') {
            return res.status(403).json({
                message: 'Your account is waiting for Admin approval.'
            });
        }

        if (manager.verificationStatus === 'rejected') {
            return res.status(403).json({
                message: 'Your account has been rejected by Admin.'
            });
        }

        const token = jwt.sign(
            { id: manager._id, email: manager.email, role: 'manager' },
            process.env.JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        res.json({
            message: 'Login successful',
            token,
            manager: formatManager(manager)
        });
    } catch (error) {
        console.error('Manager login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
