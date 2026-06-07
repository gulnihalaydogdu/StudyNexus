import { dbGet, dbRun } from './db.js';
import { resolveWeekSlot } from './calendarDates.js';

function slotsEqual(a, b) {
    if (a.weekStart && b.weekStart) return a.weekStart === b.weekStart;
    return (
        Number(a.year ?? a.target_year) === Number(b.year ?? b.target_year) &&
        (a.month ?? a.target_month) === (b.month ?? b.target_month) &&
        Number(a.week ?? a.target_week) === Number(b.week ?? b.target_week)
    );
}

export function getPlanCalendarSlot(userId, planId) {
    return dbGet(
        `SELECT id, plan_id, target_year, target_month, target_week, week_start_date, week_end_date
         FROM calendar_events WHERE user_id = ? AND plan_id = ?`,
        [userId, planId]
    );
}

export function getSlotAssignmentByWeekStart(userId, weekStart) {
    return dbGet(
        `SELECT id, plan_id, target_year, target_month, target_week, week_start_date, week_end_date
         FROM calendar_events
         WHERE user_id = ? AND week_start_date = ?`,
        [userId, weekStart]
    );
}

export function getSlotAssignment(userId, year, month, week) {
    const resolved = resolveWeekSlot({ year, month, week });
    if (!resolved) return null;
    return getSlotAssignmentByWeekStart(userId, resolved.weekStart);
}

/**
 * Plan tek bir haftada kalır; boş slota taşınırsa eski atama silinir.
 * Hedef slot başka bir plana ayrılmışsa hata döner.
 */
export function assignPlanToCalendarSlot({ userId, planId, weekStart, year, month, week }) {
    const resolved = resolveWeekSlot({ weekStart, year, month, week });
    if (!resolved) {
        return { ok: false, message: 'Geçersiz takvim slotu.' };
    }

    const target = resolved;
    const current = getPlanCalendarSlot(userId, planId);
    const occupant = getSlotAssignmentByWeekStart(userId, target.weekStart);

    if (current && slotsEqual(
        { weekStart: current.week_start_date, year: current.target_year, month: current.target_month, week: current.target_week },
        target
    )) {
        return {
            ok: true,
            action: 'unchanged',
            message: 'Plan zaten bu haftada.',
            ...target,
            weekStartDate: target.weekStart,
            weekEndDate: target.weekEnd
        };
    }

    if (occupant && Number(occupant.plan_id) !== Number(planId)) {
        return {
            ok: false,
            message: 'Bu hafta dolu. Boş bir hafta seçin.'
        };
    }

    if (current) {
        dbRun('DELETE FROM calendar_events WHERE id = ?', [current.id]);
    }

    dbRun(
        `INSERT INTO calendar_events
         (user_id, plan_id, target_year, target_month, target_week, week_start_date, week_end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            planId,
            target.year,
            target.month,
            target.week,
            target.weekStart,
            target.weekEnd
        ]
    );

    const payload = {
        ok: true,
        ...target,
        weekStartDate: target.weekStart,
        weekEndDate: target.weekEnd
    };

    if (current) {
        return {
            ...payload,
            action: 'moved',
            message: 'Planın yeri değiştirildi.',
            previousSlot: {
                year: current.target_year,
                month: current.target_month,
                week: current.target_week,
                weekStart: current.week_start_date,
                weekEnd: current.week_end_date,
                weekRangeLabel: target.weekRangeLabel
            }
        };
    }

    return {
        ...payload,
        action: 'assigned',
        message: 'Plan takvime eklendi.'
    };
}
