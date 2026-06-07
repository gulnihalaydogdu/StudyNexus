import { dbGet, dbAll } from './db.js';
import { getCurrentWeekSlot, matchesWeekContainingDate, dateForDayInWeek, formatDateTR } from './calendarDates.js';
import { localDateKey } from './progress.js';

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function getWeekPanelForUser(userId, calendarEvents) {
    const slot = getCurrentWeekSlot();
    const todayName = DAY_NAMES[new Date().getDay()];
    const todayKey = localDateKey();

    const event = (calendarEvents || []).find((e) => matchesWeekContainingDate(e, todayKey));

    if (!event) {
        return {
            hasPlan: false,
            ...slot,
            weekStart: slot.weekStart,
            weekEnd: slot.weekEnd,
            weekRangeLabel: slot.weekRangeLabel,
            todayName,
            todayDateLabel: formatDateTR(todayKey),
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
            weekStart: slot.weekStart,
            weekEnd: slot.weekEnd,
            weekRangeLabel: slot.weekRangeLabel,
            todayName,
            todayDateLabel: formatDateTR(todayKey),
            todayItems: [],
            weekByDay: {}
        };
    }

    const weekStart = event.week_start_date || slot.weekStart;
    const weekEnd = event.week_end_date || slot.weekEnd;

    const items = dbAll(
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
         WHERE wpi.plan_id = ?
         ORDER BY wpi.id`,
        [userId, todayKey, event.plan_id]
    ).map((item) => {
        const scheduledDate = dateForDayInWeek(weekStart, item.day_name);
        return {
            ...item,
            scheduled_date: scheduledDate,
            scheduled_label: scheduledDate ? formatDateTR(scheduledDate) : null
        };
    });

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
        year: event.target_year,
        month: event.target_month,
        week: event.target_week,
        weekStart,
        weekEnd,
        weekRangeLabel: slot.weekRangeLabel,
        todayName,
        todayKey,
        todayDateLabel: formatDateTR(todayKey),
        planTitle: plan.title,
        planDateRange: plan.date_range,
        planId: plan.id,
        todayItems: items.filter((i) => i.day_name === todayName),
        weekByDay
    };
}
