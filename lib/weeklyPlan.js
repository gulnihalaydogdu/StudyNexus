import { dbGet, dbRun, dbAll } from './db.js';

export function getPlanForUser(planId, userId) {
    return dbGet('SELECT * FROM weekly_plans WHERE id = ? AND user_id = ?', [planId, userId]);
}

export function getPlanItemsWithNames(planId) {
    return dbAll(
        `SELECT wpi.*,
                COALESCE(t.name, wpi.topic_label) as topic_name,
                COALESCE(c.name, wpi.course_label) as course_name
         FROM weekly_plan_items wpi
         LEFT JOIN topics t ON wpi.topic_id = t.id
         LEFT JOIN courses c ON t.course_id = c.id
         WHERE wpi.plan_id = ?`,
        [planId]
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
            (plan_id, day_name, topic_id, description, topic_label, course_label)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                planId,
                item.day,
                item.topicId,
                item.description || '',
                names?.topic_name || '',
                names?.course_name || ''
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
            (plan_id, day_name, topic_id, description, topic_label, course_label)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                lastID,
                item.day_name,
                item.topic_id,
                item.description,
                item.topic_label,
                item.course_label
            ]
        );
    }

    return lastID;
}
