import { dbGet, dbAll } from './db.js';
import { getCurrentCalendarWeek, matchesCalendarSlot } from './calendarSlot.js';

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function getWeekPanelForUser(userId, calendarEvents) {
    const slot = getCurrentCalendarWeek();
    const todayName = DAY_NAMES[new Date().getDay()];

    const event = (calendarEvents || []).find((e) => matchesCalendarSlot(e, slot));

    if (!event) {
        return {
            hasPlan: false,
            ...slot,
            todayName,
            todayItems: [],
            weekByDay: {}
        };
    }

    const plan = dbGet('SELECT * FROM weekly_plans WHERE id = ? AND user_id = ?', [
        event.plan_id,
        userId
    ]);

    if (!plan) {
        return {
            hasPlan: false,
            ...slot,
            todayName,
            todayItems: [],
            weekByDay: {}
        };
    }

    const items = dbAll(
        `SELECT wpi.*,
                COALESCE(t.name, wpi.topic_label) as topic_name,
                COALESCE(c.name, wpi.course_label) as course_name
         FROM weekly_plan_items wpi
         LEFT JOIN topics t ON wpi.topic_id = t.id
         LEFT JOIN courses c ON t.course_id = c.id
         WHERE wpi.plan_id = ?
         ORDER BY wpi.id`,
        [event.plan_id]
    );

    const weekByDay = {};
    for (const day of DAY_NAMES.slice(1).concat(['Pazar'])) {
        weekByDay[day] = [];
    }
    for (const item of items) {
        if (!weekByDay[item.day_name]) weekByDay[item.day_name] = [];
        weekByDay[item.day_name].push(item);
    }

    return {
        hasPlan: true,
        ...slot,
        todayName,
        planTitle: plan.title,
        planDateRange: plan.date_range,
        planId: plan.id,
        todayItems: items.filter((i) => i.day_name === todayName),
        weekByDay
    };
}
