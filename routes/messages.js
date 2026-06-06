import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getTeacherStudentLink } from '../lib/coaching.js';
import { dbGet } from '../lib/db.js';
import { createNotification } from '../lib/notifications.js';
import {
    getOrCreateThread,
    userCanAccessThread,
    getThreadMessages,
    sendMessage,
    markThreadRead,
    getUnreadCountForUser,
    getThreadsForStudent,
    getThreadsForTeacher
} from '../lib/messages.js';

const router = express.Router();

function displayName(user) {
    return user?.full_name || user?.username || 'Kullanıcı';
}

router.get('/api/messages/unread-count', requireAuth, (req, res) => {
    res.json({
        success: true,
        unread: getUnreadCountForUser(req.session.userId, req.session.role)
    });
});

router.get('/api/messages/threads', requireAuth, (req, res) => {
    const { userId, role } = req.session;
    const threads =
        role === 'teacher' ? getThreadsForTeacher(userId) : getThreadsForStudent(userId);
    res.json({ success: true, threads, unread: getUnreadCountForUser(userId, role) });
});

router.get('/api/messages/thread', requireAuth, (req, res) => {
    const teacherId =
        req.session.role === 'teacher' ? req.session.userId : Number(req.query.teacherId);
    const studentId =
        req.session.role === 'student' ? req.session.userId : Number(req.query.studentId);

    if (!Number.isFinite(teacherId) || !Number.isFinite(studentId)) {
        return res.status(400).json({ success: false, message: 'Geçersiz istek.' });
    }

    if (req.session.role === 'teacher' && teacherId !== req.session.userId) {
        return res.status(403).json({ success: false, message: 'Yetkisiz.' });
    }
    if (req.session.role === 'student' && studentId !== req.session.userId) {
        return res.status(403).json({ success: false, message: 'Yetkisiz.' });
    }

    const link = getTeacherStudentLink(teacherId, studentId);
    if (!link) {
        return res.status(403).json({ success: false, message: 'Bağlantı bulunamadı.' });
    }

    const thread = getOrCreateThread(teacherId, studentId);
    const messages = getThreadMessages(thread.id);
    markThreadRead(thread.id, req.session.userId);

    const partner =
        req.session.role === 'teacher'
            ? dbGet('SELECT id, full_name, username, grade FROM users WHERE id = ?', [studentId])
            : dbGet('SELECT id, full_name, username, branch FROM users WHERE id = ?', [teacherId]);

    res.json({
        success: true,
        thread: {
            id: thread.id,
            teacher_id: thread.teacher_id,
            student_id: thread.student_id
        },
        partner,
        messages,
        unread: getUnreadCountForUser(req.session.userId, req.session.role)
    });
});

router.post('/api/messages/thread/:threadId', requireAuth, (req, res) => {
    const threadId = Number(req.params.threadId);
    if (!Number.isFinite(threadId)) {
        return res.status(400).json({ success: false, message: 'Geçersiz sohbet.' });
    }

    const thread = dbGet('SELECT * FROM message_threads WHERE id = ?', [threadId]);
    if (!thread || !userCanAccessThread(req.session.userId, req.session.role, thread)) {
        return res.status(403).json({ success: false, message: 'Yetkisiz.' });
    }

    const result = sendMessage({
        threadId,
        senderId: req.session.userId,
        body: req.body.body
    });
    if (!result.ok) {
        return res.status(400).json({ success: false, message: result.error });
    }

    const message = dbGet(
        `SELECT m.id, m.thread_id, m.sender_id, m.body, m.created_at, m.read_at,
                u.full_name, u.username, u.role AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`,
        [result.messageId]
    );

    const recipientId =
        req.session.userId === thread.teacher_id ? thread.student_id : thread.teacher_id;
    const sender = dbGet('SELECT full_name, username FROM users WHERE id = ?', [
        req.session.userId
    ]);
    const preview = String(req.body.body || '').trim().slice(0, 100);
    const link =
        req.session.role === 'teacher' ? `/teacher/student/${thread.student_id}` : '/';

    createNotification(recipientId, {
        type: 'message',
        title: `${displayName(sender)} mesaj gönderdi`,
        body: preview,
        link
    });

    res.json({
        success: true,
        message,
        unread: getUnreadCountForUser(req.session.userId, req.session.role)
    });
});

export default router;
