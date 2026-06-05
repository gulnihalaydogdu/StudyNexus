import { dbGet, dbRun } from './db.js';

function slotsEqual(a, b) {
    return (
        Number(a.year ?? a.target_year) === Number(b.year ?? b.target_year) &&
        (a.month ?? a.target_month) === (b.month ?? b.target_month) &&
        Number(a.week ?? a.target_week) === Number(b.week ?? b.target_week)
    );
}

export function getPlanCalendarSlot(userId, planId) {
    return dbGet(
        `SELECT id, plan_id, target_year, target_month, target_week
         FROM calendar_events WHERE user_id = ? AND plan_id = ?`,
        [userId, planId]
    );
}

export function getSlotAssignment(userId, year, month, week) {
    return dbGet(
        `SELECT id, plan_id, target_year, target_month, target_week
         FROM calendar_events
         WHERE user_id = ? AND target_year = ? AND target_month = ? AND target_week = ?`,
        [userId, year, month, week]
    );
}

/**
 * Plan tek bir haftada kalır; boş slota taşınırsa eski atama silinir.
 * Hedef slot başka bir plana ayrılmışsa hata döner.
 */
export function assignPlanToCalendarSlot({ userId, planId, year, month, week }) {
    const target = { year: Number(year), month, week: Number(week) };
    const current = getPlanCalendarSlot(userId, planId);
    const occupant = getSlotAssignment(userId, target.year, target.month, target.week);

    if (current && slotsEqual(current, target)) {
        return {
            ok: true,
            action: 'unchanged',
            message: 'Plan zaten bu haftada.',
            year: target.year,
            month: target.month,
            week: target.week
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
        `INSERT INTO calendar_events (user_id, plan_id, target_year, target_month, target_week)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, planId, target.year, target.month, target.week]
    );

    if (current) {
        return {
            ok: true,
            action: 'moved',
            message: 'Planın yeri değiştirildi.',
            year: target.year,
            month: target.month,
            week: target.week,
            previousSlot: {
                year: current.target_year,
                month: current.target_month,
                week: current.target_week
            }
        };
    }

    return {
        ok: true,
        action: 'assigned',
        message: 'Plan takvime eklendi.',
        year: target.year,
        month: target.month,
        week: target.week
    };
}
