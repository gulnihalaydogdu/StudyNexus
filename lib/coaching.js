import crypto from 'crypto';
import { dbGet, dbAll, dbRun } from './db.js';
import { assignPlanToCalendarSlot } from './calendarAssign.js';

export function ensureCoachCode(teacherId) {
    const user = dbGet('SELECT coach_code FROM users WHERE id = ? AND role = ?', [
        teacherId,
        'teacher'
    ]);
    if (!user) return null;
    if (user.coach_code) return user.coach_code;

    let code = crypto.randomBytes(4).toString('hex').toUpperCase();
    for (let i = 0; i < 5; i++) {
        try {
            dbRun('UPDATE users SET coach_code = ? WHERE id = ?', [code, teacherId]);
            return code;
        } catch {
            code = crypto.randomBytes(4).toString('hex').toUpperCase();
        }
    }
    return null;
}

export function getTeacherStudentLink(teacherId, studentId) {
    return dbGet(
        'SELECT id FROM teacher_student_links WHERE teacher_id = ? AND student_id = ?',
        [teacherId, studentId]
    );
}

export function getStudentStats(studentId) {
    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [studentId]);
    const topics = dbAll(
        `SELECT t.* FROM topics t JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [studentId]
    );
    const total = topics.length;
    const done = topics.filter((t) => t.is_completed).length;
    return {
        totalTopics: total,
        completedTopics: done,
        percent: total ? Math.round((done / total) * 100) : 0,
        courseCount: courses.length
    };
}

function findStudentTopicId(studentId, topicId) {
    if (!topicId) return null;
    const source = dbGet(
        `SELECT t.name as topic_name, c.name as course_name
         FROM topics t JOIN courses c ON t.course_id = c.id WHERE t.id = ?`,
        [topicId]
    );
    if (!source) return null;

    const match = dbGet(
        `SELECT t.id FROM topics t
         JOIN courses c ON t.course_id = c.id
         WHERE c.user_id = ? AND t.name = ? AND c.name = ?`,
        [studentId, source.topic_name, source.course_name]
    );
    return match?.id || null;
}

export function assignPlanToStudent({ teacherId, studentId, planId, year, month, week, weekStart }) {
    const link = dbGet(
        'SELECT id FROM teacher_student_links WHERE teacher_id = ? AND student_id = ?',
        [teacherId, studentId]
    );
    if (!link) return { ok: false, error: 'Bu öğrenci sizin listenizde değil.' };

    const plan = dbGet('SELECT * FROM weekly_plans WHERE id = ? AND user_id = ?', [
        planId,
        teacherId
    ]);
    if (!plan) return { ok: false, error: 'Plan bulunamadı.' };

    const items = dbAll('SELECT * FROM weekly_plan_items WHERE plan_id = ?', [planId]);
    const enriched = items.map((item) => {
        const names = dbGet(
            `SELECT t.name as topic_name, c.name as course_name
             FROM topics t JOIN courses c ON t.course_id = c.id WHERE t.id = ?`,
            [item.topic_id]
        );
        return {
            ...item,
            topic_label: names?.topic_name || 'Konu',
            course_label: names?.course_name || 'Ders',
            student_topic_id: findStudentTopicId(studentId, item.topic_id)
        };
    });

    const { lastID: studentPlanId } = dbRun(
        'INSERT INTO weekly_plans (user_id, title, date_range) VALUES (?, ?, ?)',
        [studentId, plan.title, plan.date_range]
    );

    for (const item of enriched) {
        dbRun(
            `INSERT INTO weekly_plan_items
            (plan_id, day_name, topic_id, description, topic_label, course_label, is_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                studentPlanId,
                item.day_name,
                item.student_topic_id,
                item.description,
                item.topic_label,
                item.course_label,
                item.is_completed || 0
            ]
        );
    }

    const calendarResult = assignPlanToCalendarSlot({
        userId: studentId,
        planId: studentPlanId,
        weekStart,
        year,
        month,
        week
    });
    if (!calendarResult.ok) {
        dbRun('DELETE FROM weekly_plan_items WHERE plan_id = ?', [studentPlanId]);
        dbRun('DELETE FROM weekly_plans WHERE id = ?', [studentPlanId]);
        return { ok: false, error: calendarResult.message };
    }

    dbRun(
        `INSERT INTO plan_assignments
        (teacher_id, student_id, source_plan_id, student_plan_id, target_year, target_month, target_week, week_start_date, week_end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            teacherId,
            studentId,
            planId,
            studentPlanId,
            calendarResult.year,
            calendarResult.month,
            calendarResult.week,
            calendarResult.weekStartDate,
            calendarResult.weekEndDate
        ]
    );

    return { ok: true, studentPlanId };
}
