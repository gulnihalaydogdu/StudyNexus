import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
    getNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    ensureDailyReminderNotification
} from '../lib/notifications.js';

const router = express.Router();

router.get('/api/notifications', requireAuth, (req, res) => {
    // Öğrenciler için günlük hatırlatma bildirimini tembel üret
    if (req.session.role === 'student') {
        try {
            ensureDailyReminderNotification(req.session.userId);
        } catch (err) {
            console.error('Günlük hatırlatma üretilemedi:', err);
        }
    }

    res.json({
        success: true,
        notifications: getNotifications(req.session.userId),
        unread: getUnreadCount(req.session.userId)
    });
});

router.post('/api/notifications/read', requireAuth, (req, res) => {
    const id = req.body.id ? Number(req.body.id) : null;
    if (id && Number.isFinite(id)) {
        markNotificationRead(req.session.userId, id);
    } else {
        markAllNotificationsRead(req.session.userId);
    }
    res.json({ success: true, unread: getUnreadCount(req.session.userId) });
});

export default router;
