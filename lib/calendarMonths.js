import { getCalendarMonthsWithWeeks } from './calendarDates.js';

export function getDynamicMonths(count = 4) {
    return getCalendarMonthsWithWeeks(count);
}

export { getCalendarMonthsWithWeeks };
