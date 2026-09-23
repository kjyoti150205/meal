const Notification = require('../models/Notification');
const Manager = require('../models/Manager');
const Admin = require('../models/Admin');

async function createNotification({
    recipientId,
    recipientRole,
    type,
    title,
    message,
    icon = 'fa-bell',
    metadata = {}
}) {
    try {
        const notification = new Notification({
            recipientId,
            recipientRole,
            type,
            title,
            message,
            icon,
            metadata
        });
        await notification.save();
        return notification;
    } catch (error) {
        console.error('Notification create error:', error.message);
        return null;
    }
}

async function notifyStudent(userId, payload) {
    return createNotification({ recipientId: userId, recipientRole: 'student', ...payload });
}

async function notifyManager(managerId, payload) {
    return createNotification({ recipientId: managerId, recipientRole: 'manager', ...payload });
}

async function notifyAdmin(adminId, payload) {
    return createNotification({ recipientId: adminId, recipientRole: 'admin', ...payload });
}

async function notifyAllManagers(payload) {
    try {
        const managers = await Manager.find({ verificationStatus: 'approved' }).select('_id');
        await Promise.all(managers.map((m) => notifyManager(m._id, payload)));
    } catch (error) {
        console.error('Notify all managers error:', error.message);
    }
}

async function notifyAllAdmins(payload) {
    try {
        const admins = await Admin.find().select('_id');
        await Promise.all(admins.map((a) => notifyAdmin(a._id, payload)));
    } catch (error) {
        console.error('Notify all admins error:', error.message);
    }
}

function fireAndForget(fn) {
    Promise.resolve().then(fn).catch((err) => {
        console.error('Notification side-effect error:', err.message);
    });
}

module.exports = {
    createNotification,
    notifyStudent,
    notifyManager,
    notifyAdmin,
    notifyAllManagers,
    notifyAllAdmins,
    fireAndForget
};
