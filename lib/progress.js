import { dbAll, dbRun } from './db.js';

export function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function recordProgressSnapshot(userId, stats, dateKey = localDateKey()) {
    dbRun(
        `INSERT INTO progress_snapshots
        (user_id, snapshot_date, total_topics, completed_topics, overall_percent)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
            total_topics = excluded.total_topics,
            completed_topics = excluded.completed_topics,
            overall_percent = excluded.overall_percent,
            created_at = datetime('now')`,
        [
            userId,
            dateKey,
            stats.totalTopics,
            stats.completedTopics,
            stats.overallPercent
        ]
    );
}

export function getProgressTrend(userId, limit = 7) {
    return dbAll(
        `SELECT snapshot_date, total_topics, completed_topics, overall_percent
         FROM progress_snapshots
         WHERE user_id = ?
         ORDER BY snapshot_date DESC
         LIMIT ?`,
        [userId, limit]
    ).reverse();
}
