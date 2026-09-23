const Notification = require('../models/Notification');

function getRecipientFilter(user) {
    return {
        recipientId: user.id,
        recipientRole: user.role
    };
}

exports.getNotifications = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const notifications = await Notification.find(getRecipientFilter(req.user))
            .sort({ createdAt: -1 })
            .limit(limit);

        res.json(notifications);
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            ...getRecipientFilter(req.user),
            read: false
        });
        res.json({ count });
    } catch (error) {
        console.error('Unread count error:', error);
        res.status(500).json({ message: 'Failed to get unread count' });
    }
};

exports.createNotification = async (req, res) => {
    try {
        const { type, title, message, icon, metadata } = req.body;

        if (!type || !title || !message) {
            return res.status(400).json({ message: 'type, title, and message are required' });
        }

        const notification = new Notification({
            recipientId: req.user.id,
            recipientRole: req.user.role,
            type,
            title,
            message,
            icon: icon || 'fa-bell',
            metadata: metadata || {}
        });

        await notification.save();
        res.status(201).json({ message: 'Notification created', notification });
    } catch (error) {
        console.error('Create notification error:', error);
        res.status(500).json({ message: 'Failed to create notification' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, ...getRecipientFilter(req.user) },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification marked as read', notification });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ message: 'Failed to mark notification as read' });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { ...getRecipientFilter(req.user), read: false },
            { read: true }
        );

        res.json({
            message: 'All notifications marked as read',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ message: 'Failed to mark all as read' });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            ...getRecipientFilter(req.user)
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ message: 'Failed to delete notification' });
    }
};
