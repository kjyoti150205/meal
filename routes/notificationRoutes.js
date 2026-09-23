const express = require('express');
const authAny = require('../middleware/authAny');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.use(authAny);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.post('/', notificationController.createNotification);
router.put('/read-all', notificationController.markAllRead);
router.put('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
