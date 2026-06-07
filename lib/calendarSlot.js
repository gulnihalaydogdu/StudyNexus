import {
    MONTH_NAMES,
    getCurrentWeekSlot,
    isDateInWeek,
    resolveWeekSlot,
    calendarBoxId,
    toDateKey
} from './calendarDates.js';

export { MONTH_NAMES, calendarBoxId };

export function formatMonthSlot(year, month) {
    return `${year}|${month}`;
}

export function parseMonthSlot(value) {
    const raw = String(value ?? '');
    const [yearPart, ...monthParts] = raw.split('|');
    const month = monthParts.join('|') || raw;
    const year = Number(yearPart);
    return {
        year: Number.isFinite(year) && year > 1970 ? year : new Date().getFullYear(),
        month
    };
}

export function getCurrentCalendarWeek() {
    return getCurrentWeekSlot();
}

export function matchesCalendarSlot(event, slot) {
    if (event.week_start_date && slot.weekStart) {
        return event.week_start_date === slot.weekStart;
    }
    return (
        Number(event.target_year) === Number(slot.year) &&
        event.target_month === slot.month &&
        Number(event.target_week) === Number(slot.week)
    );
}

export function matchesWeekContainingDate(event, dateKey) {
    if (event.week_start_date) {
        return isDateInWeek(dateKey, event.week_start_date, event.week_end_date);
    }
    const slot = getCurrentWeekSlot();
    return matchesCalendarSlot(event, slot);
}

export function normalizeWeekInput(body = {}) {
    return resolveWeekSlot({
        weekStart: body.weekStart || body.weekStartDate,
        year: body.year,
        month: body.month,
        week: body.week
    });
}
