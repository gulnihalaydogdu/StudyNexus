import { config, isMailConfigured } from '../config.js';
import { dbAll, dbGet, dbRun } from './db.js';
import { sendMail } from './mail.js';
import { escapeHtml } from './escape.js';
import { getWeekPanelForUser } from './weekPanel.js';
import { localDateKey } from './progress.js';

let schedulerStarted = false;

function reminderHtml({ name, weekPanel }) {
    const items = weekPanel.todayItems
        .map(
            (item) =>
                `<li style="margin:8px 0;"><strong>${escapeHtml(item.course_name)}</strong> — ${escapeHtml(item.topic_name)}${
                    item.description
                        ? `<br><span style="color:#7c7b9b;font-size:13px;">${escapeHtml(item.description)}</span>`
                        : ''
                }</li>`
        )
        .join('');

    return `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:0;background:#f5f3f9;font-family:'Segoe UI',Arial,sans-serif;color:#2e1065;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 16px;background:linear-gradient(160deg,#f5f3f9,#ede9fe);">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:20px;border:1px solid #e9e4f4;box-shadow:0 18px 36px rgba(109,40,217,0.12);overflow:hidden;">
        <tr><td style="height:6px;background:linear-gradient(90deg,#a78bfa,#7c3aed,#f472b6);"></td></tr>
        <tr><td style="padding:30px;">
          <h1 style="margin:0 0 10px;font-size:24px;">Bugünkü planın hazır 📋</h1>
          <p style="margin:0 0 18px;color:#7c7b9b;">Merhaba <strong style="color:#7c3aed;">${escapeHtml(name)}</strong>, ${escapeHtml(weekPanel.todayName)} için programındaki konular:</p>
          <ul style="padding-left:20px;margin:0 0 22px;">${items}</ul>
          <a href="${escapeHtml(config.appUrl)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;text-decoration:none;font-weight:700;">StudyNexus'u Aç</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function processDailyReminders() {
    if (!isMailConfigured()) return { sent: 0, skipped: 'mail_not_configured' };

    const today = localDateKey();
    const students = dbAll(
        `SELECT id, username, full_name, email
         FROM users
         WHERE role = 'student' AND is_verified = 1 AND email IS NOT NULL AND email != ''`
    );

    let sent = 0;
    for (const student of students) {
        const alreadySent = dbGet(
            `SELECT id FROM study_reminder_log
             WHERE user_id = ? AND reminder_date = ? AND reminder_type = 'daily_plan'`,
            [student.id, today]
        );
        if (alreadySent) continue;

        const calendarEvents = dbAll('SELECT * FROM calendar_events WHERE user_id = ?', [student.id]);
        const weekPanel = getWeekPanelForUser(student.id, calendarEvents);
        const pendingItems = (weekPanel.todayItems || []).filter((item) => !item.daily_completed);
        if (!weekPanel.hasPlan || pendingItems.length === 0) continue;

        const result = await sendMail({
            to: student.email,
            subject: 'StudyNexus — Bugünkü çalışma planınız',
            html: reminderHtml({
                name: student.full_name || student.username,
                weekPanel: { ...weekPanel, todayItems: pendingItems }
            })
        });

        if (!result.skipped) {
            dbRun(
                `INSERT OR IGNORE INTO study_reminder_log (user_id, reminder_date, reminder_type)
                 VALUES (?, ?, 'daily_plan')`,
                [student.id, today]
            );
            sent += 1;
        }
    }

    return { sent };
}

export function startDailyReminderScheduler() {
    if (schedulerStarted) return;
    schedulerStarted = true;

    const run = () => {
        processDailyReminders().catch((err) => {
            console.error('Hatırlatıcılar çalıştırılamadı:', err);
        });
    };

    setTimeout(run, config.reminders.initialDelayMs);
    setInterval(run, config.reminders.intervalMs);
}
