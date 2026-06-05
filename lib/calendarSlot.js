const MONTH_NAMES = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export function formatMonthSlot(year, month) {
    return `${year}|${month}`;
}

/** Modal select value → { year, month } */
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
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: MONTH_NAMES[now.getMonth()],
        week: Math.min(4, Math.ceil(now.getDate() / 7))
    };
}

export function calendarBoxId(year, month, week) {
    return `cal-box-${year}-${month}-${week}`;
}

export function matchesCalendarSlot(event, { year, month, week }) {
    return (
        Number(event.target_year) === Number(year) &&
        event.target_month === month &&
        Number(event.target_week) === Number(week)
    );
}
