import { dbAll, dbGet } from './db.js';
import { localDateKey } from './progress.js';

function subtractDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() - days);
    return localDateKey(copy);
}

export function getLearningStreak(userId) {
    const rows = dbAll(
        `SELECT snapshot_date FROM progress_snapshots
         WHERE user_id = ? AND completed_topics > 0
         ORDER BY snapshot_date DESC
         LIMIT 60`,
        [userId]
    );
    const activeDates = new Set(rows.map((r) => r.snapshot_date));
    let streak = 0;
    for (let i = 0; i < 60; i += 1) {
        if (!activeDates.has(subtractDays(new Date(), i))) break;
        streak += 1;
    }
    return streak;
}

export const XP_PER_LEVEL = 100;
/** 30 dk çalışma = 15 XP (dakika ile orantılı) */
export const XP_PER_MINUTE = 0.5;

export function getStudyMinutes(userId) {
    const total = dbGet(
        'SELECT COALESCE(SUM(minutes), 0) as m FROM pomodoro_sessions WHERE user_id = ?',
        [userId]
    )?.m || 0;
    const today = dbGet(
        'SELECT COALESCE(SUM(minutes), 0) as m FROM pomodoro_sessions WHERE user_id = ? AND completed_on = ?',
        [userId, localDateKey()]
    )?.m || 0;
    return { total: Math.round(total), today: Math.round(today) };
}

export function getGamificationSummary(userId, stats) {
    const streak = getLearningStreak(userId);
    const studyMinutes = getStudyMinutes(userId);
    const badges = [];

    if (stats.completedTopics >= 1) badges.push({ icon: '🌱', label: 'İlk Adım' });
    if (stats.completedTopics >= 5) badges.push({ icon: '🔥', label: '5 Konu' });
    if (stats.overallPercent >= 50) badges.push({ icon: '🎯', label: 'Yarı Yol' });
    if (stats.overallPercent === 100 && stats.totalTopics > 0) badges.push({ icon: '🏆', label: 'Tamamlandı' });
    if (streak >= 3) badges.push({ icon: '⚡', label: `${streak} Gün Seri` });
    if (studyMinutes.total >= 120) badges.push({ icon: '🍅', label: 'Odaklı' });
    if (studyMinutes.total >= 360) badges.push({ icon: '🍅', label: 'Çalışma Ustası' });

    const studyXp = Math.round(studyMinutes.total * XP_PER_MINUTE);
    const xp = stats.completedTopics * 20 + streak * 10 + studyXp;
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    const xpIntoLevel = xp % XP_PER_LEVEL;
    const xpForLevel = XP_PER_LEVEL;
    const xpToNext = xpForLevel - xpIntoLevel;
    const levelProgressPercent = Math.round((xpIntoLevel / xpForLevel) * 100);

    return {
        streak,
        level,
        xp,
        xpIntoLevel,
        xpForLevel,
        xpToNext,
        levelProgressPercent,
        studyMinutes,
        badges
    };
}
