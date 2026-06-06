import { dbAll, dbGet, dbRun } from './db.js';
import { getWeekPanelForUser } from './weekPanel.js';
import { localDateKey } from './progress.js';

export function createNotification(userId, { type, title, body = '', link = null }) {
    if (!userId || !type || !title) return null;
    const { lastID } = dbRun(
        `INSERT INTO notifications (user_id, type, title, body, link)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, type, title, String(body).slice(0, 500), link]
    );
    return lastID;
}

export function getNotifications(userId, limit = 30) {
    return dbAll(
        `SELECT id, type, title, body, link, is_read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [userId, limit]
    );
}

export function getUnreadCount(userId) {
    return dbGet(
        'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0',
        [userId]
    )?.c || 0;
}

export function markNotificationRead(userId, notificationId) {
    dbRun('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
        notificationId,
        userId
    ]);
}

export function markAllNotificationsRead(userId) {
    dbRun('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
}

/**
 * Bugün için bekleyen görev varsa ve henüz oluşturulmadıysa
 * uygulama içi günlük hatırlatma bildirimi üretir (mail'den bağımsız).
 */
export function ensureDailyReminderNotification(userId) {
    const today = localDateKey();
    const alreadyLogged = dbGet(
        `SELECT id FROM study_reminder_log
         WHERE user_id = ? AND reminder_date = ? AND reminder_type = 'inapp_daily'`,
        [userId, today]
    );
    if (alreadyLogged) return;

    const calendarEvents = dbAll('SELECT * FROM calendar_events WHERE user_id = ?', [userId]);
    const weekPanel = getWeekPanelForUser(userId, calendarEvents);
    const pending = (weekPanel.todayItems || []).filter((item) => !item.daily_completed);

    // Plan yoksa ya da bekleyen görev yoksa, günü işaretleyip bildirim üretme
    dbRun(
        `INSERT OR IGNORE INTO study_reminder_log (user_id, reminder_date, reminder_type)
         VALUES (?, ?, 'inapp_daily')`,
        [userId, today]
    );

    if (!weekPanel.hasPlan || pending.length === 0) return;

    const preview = pending
        .slice(0, 3)
        .map((i) => i.topic_name)
        .join(', ');
    const extra = pending.length > 3 ? ` ve ${pending.length - 3} konu daha` : '';

    createNotification(userId, {
        type: 'reminder',
        title: `📋 ${weekPanel.todayName} için ${pending.length} görevin var`,
        body: `${preview}${extra}`,
        link: '/'
    });
}
