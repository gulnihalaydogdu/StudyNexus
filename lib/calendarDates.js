export const MONTH_NAMES = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const PLAN_DAY_OFFSET = {
    Pazartesi: 0,
    Salı: 1,
    Çarşamba: 2,
    Perşembe: 3,
    Cuma: 4,
    Cumartesi: 5,
    Pazar: 6
};

export function getMonthIndex(monthName) {
    return MONTH_NAMES.indexOf(monthName);
}

export function toDateKey(date) {
    const d = date instanceof Date ? new Date(date.getTime()) : parseDateKey(date);
    d.setHours(12, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
    const [y, m, d] = String(key || '').split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(dateKey, days) {
    const d = parseDateKey(dateKey);
    d.setDate(d.getDate() + days);
    return toDateKey(d);
}

export function getMondayOfWeek(date) {
    const d = new Date(date.getTime());
    d.setHours(12, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

export function getWeekEndFromStart(weekStart) {
    return addDays(weekStart, 6);
}

export function formatWeekRangeTR(weekStart, weekEnd) {
    const s = parseDateKey(weekStart);
    const e = parseDateKey(weekEnd);
    const short = (name) => MONTH_NAMES[name.getMonth()].slice(0, 3);
    if (s.getMonth() === e.getMonth()) {
        return `${s.getDate()}-${e.getDate()} ${short(s)}`;
    }
    return `${s.getDate()} ${short(s)} – ${e.getDate()} ${short(e)}`;
}

export function formatDateTR(dateKey) {
    const d = parseDateKey(dateKey);
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export function getWeeksForMonth(year, monthIndex) {
    const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
    const last = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
    const weeks = [];
    const seen = new Set();

    let cursor = getMondayOfWeek(first);
    for (let guard = 0; guard < 6; guard++) {
        const weekStart = toDateKey(cursor);
        if (seen.has(weekStart)) break;
        seen.add(weekStart);

        const weekEnd = getWeekEndFromStart(weekStart);
        const weekStartDate = parseDateKey(weekStart);
        const weekEndDate = parseDateKey(weekEnd);
        const overlaps = weekStartDate <= last && weekEndDate >= first;

        if (overlaps) {
            weeks.push({
                weekStart,
                weekEnd,
                label: formatWeekRangeTR(weekStart, weekEnd),
                year,
                month: MONTH_NAMES[monthIndex],
                weekIndex: weeks.length + 1
            });
        }

        cursor.setDate(cursor.getDate() + 7);
        if (cursor > last && cursor.getMonth() !== monthIndex) break;
    }

    return weeks;
}

export function getCalendarMonthsWithWeeks(count = 4) {
    const now = new Date();
    const months = [];
    for (let i = 0; i < count; i++) {
        const absolute = now.getMonth() + i;
        const monthIndex = absolute % 12;
        const year = now.getFullYear() + Math.floor(absolute / 12);
        months.push({
            name: MONTH_NAMES[monthIndex],
            year,
            monthIndex,
            weeks: getWeeksForMonth(year, monthIndex)
        });
    }
    return months;
}

export function getCurrentWeekSlot() {
    const now = new Date();
    const weekStart = toDateKey(getMondayOfWeek(now));
    const weekEnd = getWeekEndFromStart(weekStart);
    const monthIndex = now.getMonth();
    const weeks = getWeeksForMonth(now.getFullYear(), monthIndex);
    const match = weeks.find((w) => w.weekStart === weekStart);

    return {
        weekStart,
        weekEnd,
        year: now.getFullYear(),
        month: MONTH_NAMES[monthIndex],
        week: match?.weekIndex || 1,
        weekRangeLabel: formatWeekRangeTR(weekStart, weekEnd)
    };
}

export function legacySlotToWeekStart(year, monthName, weekNum) {
    const monthIndex = getMonthIndex(monthName);
    if (monthIndex < 0) return getCurrentWeekSlot().weekStart;
    const weeks = getWeeksForMonth(year, monthIndex);
    const legacy = weeks[Number(weekNum) - 1];
    if (legacy) return legacy.weekStart;
    const approxDay = Math.min(28, (Number(weekNum) - 1) * 7 + 1);
    return toDateKey(getMondayOfWeek(new Date(year, monthIndex, approxDay, 12, 0, 0, 0)));
}

export function resolveWeekSlot({ weekStart, year, month, week }) {
    if (weekStart) {
        const start = toDateKey(weekStart);
        const end = getWeekEndFromStart(start);
        const d = parseDateKey(start);
        const monthIndex = d.getMonth();
        const weeks = getWeeksForMonth(d.getFullYear(), monthIndex);
        const match = weeks.find((w) => w.weekStart === start);
        return {
            weekStart: start,
            weekEnd: end,
            year: d.getFullYear(),
            month: MONTH_NAMES[monthIndex],
            week: match?.weekIndex || 1,
            weekRangeLabel: formatWeekRangeTR(start, end)
        };
    }

    if (year && month && week) {
        const start = legacySlotToWeekStart(Number(year), month, Number(week));
        return resolveWeekSlot({ weekStart: start });
    }

    return null;
}

export function isDateInWeek(dateKey, weekStart, weekEnd) {
    return dateKey >= weekStart && dateKey <= weekEnd;
}

export function dayNameForDateKey(dateKey) {
    return DAY_NAMES[parseDateKey(dateKey).getDay()];
}

export function dateForDayInWeek(weekStart, dayName) {
    const offset = PLAN_DAY_OFFSET[dayName];
    if (offset === undefined) return null;
    return addDays(weekStart, offset);
}

export function calendarBoxId(weekStart) {
    return `cal-box-${weekStart}`;
}
