import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { dbAll, dbGet, dbRun } from '../lib/db.js';
import {
    ensureCoachCode,
    getStudentStats,
    assignPlanToStudent,
    getTeacherStudentLink
} from '../lib/coaching.js';
import { getPlanItemsWithNames } from '../lib/weeklyPlan.js';
import { getDynamicMonths } from '../lib/calendarMonths.js';

const router = express.Router();

router.get('/api/coaching/invite-code', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }
    const code = ensureCoachCode(req.session.userId);
    res.json({ success: true, code });
});

router.post('/api/coaching/link-teacher', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Sadece öğrenciler koça bağlanabilir.' });
    }

    const code = (req.body.coachCode || '').trim().toUpperCase();
    const teacher = dbGet('SELECT id, full_name, username FROM users WHERE coach_code = ? AND role = ?', [
        code,
        'teacher'
    ]);

    if (!teacher) {
        return res.status(404).json({ success: false, message: 'Geçersiz koç kodu.' });
    }

    try {
        dbRun('INSERT INTO teacher_student_links (teacher_id, student_id) VALUES (?, ?)', [
            teacher.id,
            req.session.userId
        ]);
        res.json({
            success: true,
            teacherName: teacher.full_name || teacher.username
        });
    } catch (e) {
        if (e.message?.includes('UNIQUE')) {
            return res.json({
                success: true,
                teacherName: teacher.full_name || teacher.username,
                message: 'Zaten bu koça bağlısınız.'
            });
        }
        res.status(500).json({ success: false });
    }
});

router.get('/api/coaching/my-teacher', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ success: false });
    }

    const teachers = dbAll(
        `SELECT u.id, u.full_name, u.username, u.branch, tsl.joined_at
         FROM teacher_student_links tsl
         JOIN users u ON u.id = tsl.teacher_id
         WHERE tsl.student_id = ?`,
        [req.session.userId]
    );

    res.json({ success: true, teachers });
});

router.get('/teacher/student/:studentId', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.redirect('/');
    }

    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId)) {
        return res.status(400).send('Geçersiz öğrenci.');
    }

    const link = getTeacherStudentLink(req.session.userId, studentId);
    if (!link) {
        return res.status(403).send('Bu öğrenciye erişim yetkiniz yok.');
    }

    const student = dbGet(
        'SELECT id, username, full_name, grade FROM users WHERE id = ? AND role = ?',
        [studentId, 'student']
    );
    if (!student) {
        return res.status(404).send('Öğrenci bulunamadı.');
    }

    const weeklyPlans = dbAll(
        'SELECT * FROM weekly_plans WHERE user_id = ? ORDER BY id DESC',
        [studentId]
    );
    const calendarEvents = dbAll('SELECT * FROM calendar_events WHERE user_id = ?', [studentId]);
    const courses = dbAll('SELECT * FROM courses WHERE user_id = ? ORDER BY name', [studentId]);
    const topics = dbAll(
        `SELECT t.*, c.name as course_name FROM topics t
         JOIN courses c ON t.course_id = c.id
         WHERE c.user_id = ?
         ORDER BY c.name, t.name`,
        [studentId]
    );
    const stats = getStudentStats(studentId);

    res.render('teacher-student', {
        student,
        weeklyPlans,
        calendarEvents,
        dynamicMonths: getDynamicMonths(),
        courses,
        topics,
        stats,
        studentViewId: studentId,
        user: {
            id: req.session.userId,
            username: req.session.username,
            role: req.session.role
        }
    });
});

router.get('/api/coaching/students', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }

    ensureCoachCode(req.session.userId);

    const students = dbAll(
        `SELECT u.id, u.username, u.full_name, u.grade, tsl.joined_at
         FROM teacher_student_links tsl
         JOIN users u ON u.id = tsl.student_id
         WHERE tsl.teacher_id = ?
         ORDER BY tsl.joined_at DESC`,
        [req.session.userId]
    ).map((s) => ({ ...s, stats: getStudentStats(s.id) }));

    res.json({ success: true, students });
});

router.get('/api/coaching/students/:id/overview', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }

    const studentId = Number(req.params.id);
    const link = dbGet(
        'SELECT id FROM teacher_student_links WHERE teacher_id = ? AND student_id = ?',
        [req.session.userId, studentId]
    );
    if (!link) return res.status(403).json({ success: false });

    const student = dbGet('SELECT id, username, full_name, grade FROM users WHERE id = ?', [studentId]);
    const stats = getStudentStats(studentId);
    const weeklyPlans = dbAll(
        'SELECT * FROM weekly_plans WHERE user_id = ? ORDER BY id DESC',
        [studentId]
    );
    const calendarEvents = dbAll('SELECT * FROM calendar_events WHERE user_id = ?', [studentId]);
    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [studentId]);
    const topics = dbAll(
        `SELECT t.*, c.name as course_name FROM topics t
         JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [studentId]
    );

    res.json({
        success: true,
        student,
        stats,
        weeklyPlans,
        calendarEvents,
        courses,
        topics
    });
});

router.get('/api/coaching/students/:id/plan/:planId', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }

    const studentId = Number(req.params.id);
    const planId = Number(req.params.planId);

    const link = dbGet(
        'SELECT id FROM teacher_student_links WHERE teacher_id = ? AND student_id = ?',
        [req.session.userId, studentId]
    );
    if (!link) return res.status(403).json({ success: false });

    const plan = dbGet('SELECT * FROM weekly_plans WHERE id = ? AND user_id = ?', [planId, studentId]);
    if (!plan) return res.status(404).json({ success: false });

    const items = getPlanItemsWithNames(planId);
    res.json({ success: true, plan, items, readOnly: true });
});

router.post('/api/coaching/assign-plan', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }

    const { studentId, planId, month, week } = req.body;
    const result = assignPlanToStudent({
        teacherId: req.session.userId,
        studentId: Number(studentId),
        planId: Number(planId),
        month,
        week: Number(week)
    });

    if (!result.ok) {
        return res.status(400).json({ success: false, message: result.error });
    }

    res.json({ success: true, studentPlanId: result.studentPlanId });
});

export default router;
