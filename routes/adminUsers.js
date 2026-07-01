const express = require('express');
const User = require('../models/User');
const { sendApprovalEmail, sendRejectionEmail } = require('../utils/email');

const router = express.Router();

const USER_FIELDS = '-password';

function formatUser(user) {
    const obj = user.toObject();
    delete obj.password;
    return {
        _id: obj._id,
        name: obj.fullName,
        email: obj.email,
        instituteId: obj.instituteId,
        department: obj.department || '—',
        roomNumber: obj.roomNumber || '—',
        registrationDate: obj.createdAt,
        verificationStatus: obj.verificationStatus || 'pending',
        verificationTimestamp: obj.verificationTimestamp
    };
}

router.get('/pending-users', async (req, res) => {
    try {
        const users = await User.find({ verificationStatus: 'pending' })
            .select(USER_FIELDS)
            .sort({ createdAt: -1 });

        res.json(users.map(formatUser));
    } catch (error) {
        console.error('Fetch pending users error:', error);
        res.status(500).json({ message: 'Failed to fetch pending users' });
    }
});

router.get('/approved-users', async (req, res) => {
    try {
        const users = await User.find({ verificationStatus: 'approved' })
            .select(USER_FIELDS)
            .sort({ verificationTimestamp: -1 });

        res.json(users.map(formatUser));
    } catch (error) {
        console.error('Fetch approved users error:', error);
        res.status(500).json({ message: 'Failed to fetch approved users' });
    }
});

router.get('/rejected-users', async (req, res) => {
    try {
        const users = await User.find({ verificationStatus: 'rejected' })
            .select(USER_FIELDS)
            .sort({ verificationTimestamp: -1 });

        res.json(users.map(formatUser));
    } catch (error) {
        console.error('Fetch rejected users error:', error);
        res.status(500).json({ message: 'Failed to fetch rejected users' });
    }
});

router.post('/approve/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.verificationStatus === 'approved') {
            return res.status(400).json({ message: 'User is already approved' });
        }

        user.verificationStatus = 'approved';
        user.verifiedBy = req.admin.id;
        user.verificationTimestamp = new Date();
        await user.save();

        await sendApprovalEmail(user);

        res.json({
            message: 'User approved successfully',
            user: formatUser(user)
        });
    } catch (error) {
    console.error("ERROR MESSAGE:", error.message);
    console.error("ERROR STACK:", error.stack);

    res.status(500).json({
        message: error.message
    });
}
});

router.post('/reject/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.verificationStatus === 'rejected') {
            return res.status(400).json({ message: 'User is already rejected' });
        }

        user.verificationStatus = 'rejected';
        user.verifiedBy = req.admin.id;
        user.verificationTimestamp = new Date();
        await user.save();
await sendRejectionEmail(user);

        res.json({
            message: 'User rejected successfully',
            user: formatUser(user)
        });
    } catch (error) {
    console.error("========== ERROR ==========");
    console.error(error);
    console.error(error.stack);

    res.status(500).json({
        message: error.message,
        stack: error.stack
    });
}
});

module.exports = router;
