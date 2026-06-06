import { dbAll, dbGet, dbRun } from './db.js';

export function getThreadForPair(teacherId, studentId) {
    return dbGet('SELECT * FROM message_threads WHERE teacher_id = ? AND student_id = ?', [
        teacherId,
        studentId
    ]);
}

function syncLegacyFeedback(threadId, teacherId, studentId) {
    const feedback = dbAll(
        `SELECT id, teacher_id, message, created_at
         FROM plan_feedback
         WHERE teacher_id = ? AND student_id = ?
         ORDER BY created_at ASC, id ASC`,
        [teacherId, studentId]
    );
    if (!feedback.length) return;

    for (const item of feedback) {
        const exists = dbGet(
            `SELECT id FROM messages
             WHERE thread_id = ? AND sender_id = ? AND body = ? AND created_at = ?`,
            [threadId, item.teacher_id, item.message, item.created_at]
        );
        if (exists) continue;
        dbRun(
            `INSERT INTO messages (thread_id, sender_id, body, created_at, read_at)
             VALUES (?, ?, ?, ?, datetime('now'))`,
            [threadId, item.teacher_id, item.message, item.created_at]
        );
    }
    dbRun(`UPDATE message_threads SET updated_at = datetime('now') WHERE id = ?`, [threadId]);
}

export function getOrCreateThread(teacherId, studentId) {
    let thread = getThreadForPair(teacherId, studentId);
    if (!thread) {
        const { lastID } = dbRun(
            `INSERT INTO message_threads (teacher_id, student_id, updated_at)
             VALUES (?, ?, datetime('now'))`,
            [teacherId, studentId]
        );
        thread = dbGet('SELECT * FROM message_threads WHERE id = ?', [lastID]);
        syncLegacyFeedback(thread.id, teacherId, studentId);
    }
    return thread;
}

export function userCanAccessThread(userId, role, thread) {
    if (!thread) return false;
    if (role === 'teacher') return thread.teacher_id === userId;
    if (role === 'student') return thread.student_id === userId;
    return false;
}

export function getThreadMessages(threadId, limit = 150) {
    return dbAll(
        `SELECT m.id, m.thread_id, m.sender_id, m.body, m.created_at, m.read_at,
                u.full_name, u.username, u.role AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.thread_id = ?
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT ?`,
        [threadId, limit]
    );
}

export function sendMessage({ threadId, senderId, body }) {
    const trimmed = String(body || '').trim();
    if (!trimmed || trimmed.length > 1200) {
        return { ok: false, error: 'Mesaj 1-1200 karakter olmalı.' };
    }

    const thread = dbGet('SELECT * FROM message_threads WHERE id = ?', [threadId]);
    if (!thread) return { ok: false, error: 'Sohbet bulunamadı.' };

    const { lastID } = dbRun(
        `INSERT INTO messages (thread_id, sender_id, body, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [threadId, senderId, trimmed]
    );
    dbRun(`UPDATE message_threads SET updated_at = datetime('now') WHERE id = ?`, [threadId]);

    return { ok: true, messageId: lastID, thread };
}

export function markThreadRead(threadId, readerId) {
    dbRun(
        `UPDATE messages SET read_at = datetime('now')
         WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL`,
        [threadId, readerId]
    );
}

export function getUnreadCountForUser(userId, role) {
    if (role === 'student') {
        return (
            dbGet(
                `SELECT COUNT(*) AS c FROM messages m
                 JOIN message_threads t ON t.id = m.thread_id
                 WHERE t.student_id = ? AND m.sender_id != ? AND m.read_at IS NULL`,
                [userId, userId]
            )?.c || 0
        );
    }
    if (role === 'teacher') {
        return (
            dbGet(
                `SELECT COUNT(*) AS c FROM messages m
                 JOIN message_threads t ON t.id = m.thread_id
                 WHERE t.teacher_id = ? AND m.sender_id != ? AND m.read_at IS NULL`,
                [userId, userId]
            )?.c || 0
        );
    }
    return 0;
}

export function getUnreadCountForStudent(teacherId, studentId) {
    return (
        dbGet(
            `SELECT COUNT(*) AS c FROM messages m
             JOIN message_threads t ON t.id = m.thread_id
             WHERE t.teacher_id = ? AND t.student_id = ? AND m.sender_id = ? AND m.read_at IS NULL`,
            [teacherId, studentId, studentId]
        )?.c || 0
    );
}

export function getThreadsForStudent(studentId) {
    return dbAll(
        `SELECT t.id, t.teacher_id, t.student_id, t.updated_at,
                u.full_name, u.username, u.branch,
                (SELECT body FROM messages WHERE thread_id = t.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message,
                (SELECT COUNT(*) FROM messages WHERE thread_id = t.id AND sender_id != ? AND read_at IS NULL) AS unread_count
         FROM teacher_student_links tsl
         JOIN users u ON u.id = tsl.teacher_id
         LEFT JOIN message_threads t ON t.teacher_id = tsl.teacher_id AND t.student_id = tsl.student_id
         WHERE tsl.student_id = ?
         ORDER BY COALESCE(t.updated_at, tsl.joined_at) DESC`,
        [studentId, studentId]
    );
}

export function getThreadsForTeacher(teacherId) {
    return dbAll(
        `SELECT t.id, t.teacher_id, t.student_id, t.updated_at,
                u.full_name, u.username, u.grade,
                (SELECT body FROM messages WHERE thread_id = t.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message,
                (SELECT COUNT(*) FROM messages WHERE thread_id = t.id AND sender_id != ? AND read_at IS NULL) AS unread_count
         FROM teacher_student_links tsl
         JOIN users u ON u.id = tsl.student_id
         LEFT JOIN message_threads t ON t.teacher_id = tsl.teacher_id AND t.student_id = tsl.student_id
         WHERE tsl.teacher_id = ?
         ORDER BY COALESCE(t.updated_at, tsl.joined_at) DESC`,
        [teacherId, teacherId]
    );
}
