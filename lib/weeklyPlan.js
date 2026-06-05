import { dbGet, dbRun, dbAll } from './db.js';
import { localDateKey } from './progress.js';

export function getPlanForUser(planId, userId) {
    return dbGet('SELECT * FROM weekly_plans WHERE id = ? AND user_id = ?', [planId, userId]);
}

export function getPlanItemsWithNames(planId, userId = null, dateKey = localDateKey()) {
    return dbAll(
        `SELECT wpi.*,
                COALESCE(t.name, wpi.topic_label) as topic_name,
                COALESCE(c.name, wpi.course_label) as course_name,
                CASE WHEN wpi.is_completed = 1 OR dtc.id IS NOT NULL THEN 1 ELSE 0 END as daily_completed
         FROM weekly_plan_items wpi
         LEFT JOIN topics t ON wpi.topic_id = t.id
         LEFT JOIN courses c ON t.course_id = c.id
         LEFT JOIN daily_task_completions dtc
            ON dtc.plan_item_id = wpi.id
            AND dtc.user_id = ?
            AND dtc.completed_on = ?
         WHERE wpi.plan_id = ?`,
        [userId ?? -1, dateKey, planId]
    );
}

export function replacePlanItems(planId, planData) {
    dbRun('DELETE FROM weekly_plan_items WHERE plan_id = ?', [planId]);
    if (!planData?.length) return;

    for (const item of planData) {
        const names = dbGet(
            `SELECT t.name as topic_name, c.name as course_name
             FROM topics t JOIN courses c ON t.course_id = c.id WHERE t.id = ?`,
            [item.topicId]
        );
        dbRun(
            `INSERT INTO weekly_plan_items
            (plan_id, day_name, topic_id, description, topic_label, course_label, is_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                planId,
                item.day,
                item.topicId,
                item.description || '',
                names?.topic_name || '',
                names?.course_name || '',
                item.completed ? 1 : 0
            ]
        );
    }
}

export function duplicateWeeklyPlan(sourcePlanId, userId) {
    const source = dbGet('SELECT * FROM weekly_plans WHERE id = ?', [sourcePlanId]);
    if (!source) return null;

    const items = dbAll('SELECT * FROM weekly_plan_items WHERE plan_id = ?', [sourcePlanId]);
    const { lastID } = dbRun('INSERT INTO weekly_plans (user_id, title, date_range) VALUES (?, ?, ?)', [
        userId,
        `${source.title} (Kopya)`,
        source.date_range
    ]);

    for (const item of items) {
        dbRun(
            `INSERT INTO weekly_plan_items
            (plan_id, day_name, topic_id, description, topic_label, course_label, is_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                lastID,
                item.day_name,
                item.topic_id,
                item.description,
                item.topic_label,
                item.course_label,
                item.is_completed || 0
            ]
        );
    }

    return lastID;
}
