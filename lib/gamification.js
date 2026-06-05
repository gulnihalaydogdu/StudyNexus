import { dbAll } from './db.js';
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

export function getGamificationSummary(userId, stats) {
    const streak = getLearningStreak(userId);
    const badges = [];

    if (stats.completedTopics >= 1) badges.push({ icon: '🌱', label: 'İlk Adım' });
    if (stats.completedTopics >= 5) badges.push({ icon: '🔥', label: '5 Konu' });
    if (stats.overallPercent >= 50) badges.push({ icon: '🎯', label: 'Yarı Yol' });
    if (stats.overallPercent === 100 && stats.totalTopics > 0) badges.push({ icon: '🏆', label: 'Tamamlandı' });
    if (streak >= 3) badges.push({ icon: '⚡', label: `${streak} Gün Seri` });

    return {
        streak,
        level: Math.max(1, Math.floor(stats.completedTopics / 5) + 1),
        xp: stats.completedTopics * 20 + streak * 10,
        badges
    };
}
