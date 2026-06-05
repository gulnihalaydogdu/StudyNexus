import { dbAll, dbGet, dbRun } from './db.js';
import { sendMail } from './mail.js';
import { config } from '../config.js';

function tomorrowIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

function alreadySent(userId, key) {
    const row = dbGet('SELECT id FROM reminder_log WHERE user_id = ? AND reminder_key = ?', [
        userId,
        key
    ]);
    return Boolean(row);
}

function markSent(userId, key) {
    dbRun('INSERT OR IGNORE INTO reminder_log (user_id, reminder_key) VALUES (?, ?)', [userId, key]);
}

export async function processStudyReminders(userId) {
    const user = dbGet('SELECT email, full_name, username FROM users WHERE id = ?', [userId]);
    if (!user?.email) return;

    const date = tomorrowIso();
    const plans = dbAll(
        `SELECT sp.*, t.name as topic_name, c.name as course_name
         FROM study_plans sp
         JOIN topics t ON sp.topic_id = t.id
         JOIN courses c ON t.course_id = c.id
         WHERE sp.user_id = ? AND sp.plan_date = ? AND sp.is_done = 0`,
        [userId, date]
    );

    if (plans.length === 0) return;

    const key = `daily_${date}`;
    if (alreadySent(userId, key)) return;

    const lines = plans
        .map(
            (p) =>
                `<li><strong>${p.course_name}</strong> — ${p.topic_name} (${p.start_time || '—'} - ${p.end_time || '—'})</li>`
        )
        .join('');

    const name = user.full_name || user.username;
    await sendMail({
        to: user.email,
        subject: 'StudyNexus — Yarınki çalışma planınız',
        html: `<h2>Merhaba ${name},</h2>
               <p>Yarın (${date}) için ${plans.length} göreviniz var:</p>
               <ul>${lines}</ul>
               <p><a href="${config.appUrl}/">Dashboard'a git</a></p>`
    });

    markSent(userId, key);
}
