const express = require('express');
const Manager = require('../models/Manager');
const { sendApprovalEmail, sendRejectionEmail } = require('../utils/email');

const router = express.Router();

const MANAGER_FIELDS = '-password';

function formatManager(manager) {
    const obj = manager.toObject();
    delete obj.password;
    return {
        _id: obj._id,
        name: obj.fullName,
        email: obj.email,
        phone: obj.phone || '—',
        managerId: obj.managerId || '—',
        hostelName: obj.hostelName || '—',
        designation: obj.designation || '—',
        registrationDate: obj.createdAt,
        verificationStatus: obj.verificationStatus || 'pending',
        verificationTimestamp: obj.verificationTimestamp
    };
}

router.get('/pending-managers', async (req, res) => {
    try {
        const managers = await Manager.find({ verificationStatus: 'pending' })
            .select(MANAGER_FIELDS)
            .sort({ createdAt: -1 });

        res.json(managers.map(formatManager));
    } catch (error) {
        console.error('Fetch pending managers error:', error);
        res.status(500).json({ message: 'Failed to fetch pending managers' });
    }
});

router.get('/approved-managers', async (req, res) => {
    try {
        const managers = await Manager.find({ verificationStatus: 'approved' })
            .select(MANAGER_FIELDS)
            .sort({ verificationTimestamp: -1 });

        res.json(managers.map(formatManager));
    } catch (error) {
        console.error('Fetch approved managers error:', error);
        res.status(500).json({ message: 'Failed to fetch approved managers' });
    }
});

router.get('/rejected-managers', async (req, res) => {
    try {
        const managers = await Manager.find({ verificationStatus: 'rejected' })
            .select(MANAGER_FIELDS)
            .sort({ verificationTimestamp: -1 });

        res.json(managers.map(formatManager));
    } catch (error) {
        console.error('Fetch rejected managers error:', error);
        res.status(500).json({ message: 'Failed to fetch rejected managers' });
    }
});

router.post('/approve-manager/:managerId', async (req, res) => {
    try {
        const { managerId } = req.params;

        const manager = await Manager.findById(managerId);

        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        if (manager.verificationStatus === 'approved') {
            return res.status(400).json({ message: 'Manager is already approved' });
        }

        manager.verificationStatus = 'approved';
        manager.verifiedBy = req.admin.id;
        manager.verificationTimestamp = new Date();
        await manager.save();

        try {
            await sendApprovalEmail({
                fullName: manager.fullName,
                email: manager.email,
                instituteId: manager.managerId || 'N/A',
                department: manager.designation || '—',
                roomNumber: manager.hostelName || '—',
                batch: '—',
                createdAt: manager.createdAt
            });
        } catch (emailErr) {
            console.error('Manager approval email error:', emailErr);
        }

        res.json({
            message: 'Manager approved successfully',
            manager: formatManager(manager)
        });
    } catch (error) {
        console.error('Approve manager error:', error);
        res.status(500).json({ message: error.message || 'Failed to approve manager' });
    }
});

router.post('/reject-manager/:managerId', async (req, res) => {
    try {
        const { managerId } = req.params;

        const manager = await Manager.findById(managerId);

        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        if (manager.verificationStatus === 'rejected') {
            return res.status(400).json({ message: 'Manager is already rejected' });
        }

        manager.verificationStatus = 'rejected';
        manager.verifiedBy = req.admin.id;
        manager.verificationTimestamp = new Date();
        await manager.save();

        try {
            await sendRejectionEmail({
                fullName: manager.fullName,
                email: manager.email,
                instituteId: manager.managerId || 'N/A',
                department: manager.designation || '—',
                roomNumber: manager.hostelName || '—',
                batch: '—'
            });
        } catch (emailErr) {
            console.error('Manager rejection email error:', emailErr);
        }

        res.json({
            message: 'Manager rejected successfully',
            manager: formatManager(manager)
        });
    } catch (error) {
        console.error('Reject manager error:', error);
        res.status(500).json({ message: error.message || 'Failed to reject manager' });
    }
});

module.exports = router;
