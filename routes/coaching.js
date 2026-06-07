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
import { parseMonthSlot } from '../lib/calendarSlot.js';
import { createNotification } from '../lib/notifications.js';

function displayName(user) {
    return user?.full_name || user?.username || 'Bilinmeyen kullanıcı';
}

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
        const student = dbGet('SELECT full_name, username FROM users WHERE id = ?', [
            req.session.userId
        ]);
        createNotification(teacher.id, {
            type: 'student_joined',
            title: 'Yeni öğrenci bağlandı',
            body: `${displayName(student)} koç kodunuzla size bağlandı.`,
            link: '/'
        });
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

router.get('/api/coaching/feedback', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ success: false });
    }

    const feedback = dbAll(
        `SELECT pf.id, pf.message, pf.created_at, u.full_name, u.username
         FROM plan_feedback pf
         JOIN users u ON u.id = pf.teacher_id
         WHERE pf.student_id = ?
         ORDER BY pf.created_at DESC
         LIMIT 10`,
        [req.session.userId]
    );

    res.json({ success: true, feedback });
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
    const feedback = dbAll(
        `SELECT pf.*, u.full_name as teacher_name, u.username as teacher_username
         FROM plan_feedback pf
         JOIN users u ON u.id = pf.teacher_id
         WHERE pf.student_id = ?
         ORDER BY pf.created_at DESC
         LIMIT 8`,
        [studentId]
    );

    res.render('teacher-student', {
        student,
        weeklyPlans,
        calendarEvents,
        dynamicMonths: getDynamicMonths(5),
        courses,
        topics,
        stats,
        feedback,
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

router.get('/api/coaching/analytics', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }

    const students = dbAll(
        `SELECT u.id, u.username, u.full_name, u.grade
         FROM teacher_student_links tsl
         JOIN users u ON u.id = tsl.student_id
         WHERE tsl.teacher_id = ?`,
        [req.session.userId]
    ).map((s) => ({ ...s, stats: getStudentStats(s.id) }));

    const count = students.length;
    const avgProgress = count
        ? Math.round(students.reduce((sum, s) => sum + s.stats.percent, 0) / count)
        : 0;
    const needsAttention = students.filter((s) => s.stats.totalTopics > 0 && s.stats.percent < 40);
    const topStudent = students.slice().sort((a, b) => b.stats.percent - a.stats.percent)[0] || null;

    res.json({
        success: true,
        analytics: {
            count,
            avgProgress,
            needsAttention,
            topStudent
        }
    });
});

router.post('/api/coaching/students/:id/feedback', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Yetkisiz.' });
    }

    const studentId = Number(req.params.id);
    const message = String(req.body.message || '').trim();
    const planId = req.body.planId ? Number(req.body.planId) : null;

    if (!Number.isFinite(studentId) || !message || message.length > 600) {
        return res.status(400).json({ success: false, message: 'Geri bildirim 1-600 karakter olmalı.' });
    }

    const link = getTeacherStudentLink(req.session.userId, studentId);
    if (!link) return res.status(403).json({ success: false, message: 'Bu öğrenciye erişim yok.' });

    dbRun(
        `INSERT INTO plan_feedback (teacher_id, student_id, plan_id, message)
         VALUES (?, ?, ?, ?)`,
        [req.session.userId, studentId, Number.isFinite(planId) ? planId : null, message]
    );

    const teacher = dbGet('SELECT full_name, username FROM users WHERE id = ?', [
        req.session.userId
    ]);
    createNotification(studentId, {
        type: 'feedback',
        title: `${displayName(teacher)} geri bildirim gönderdi`,
        body: message,
        link: '/'
    });

    res.json({ success: true, message: 'Geri bildirim kaydedildi.' });
});

router.get('/api/coaching/students/:id/plan/:planId', requireAuth, (req, res) => {
    try {
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: 'Yetkisiz.' });
        }

        const studentId = Number(req.params.id);
        const planId = Number(req.params.planId);
        if (!Number.isFinite(studentId) || !Number.isFinite(planId)) {
            return res.status(400).json({ success: false, message: 'Geçersiz istek.' });
        }

        const link = getTeacherStudentLink(req.session.userId, studentId);
        if (!link) {
            return res.status(403).json({ success: false, message: 'Bu öğrenciye erişim yok.' });
        }

        const plan = dbGet('SELECT * FROM weekly_plans WHERE id = ? AND user_id = ?', [
            planId,
            studentId
        ]);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan bulunamadı.' });
        }

        const items = getPlanItemsWithNames(planId, studentId);
        res.json({ success: true, plan, items, readOnly: true });
    } catch (err) {
        console.error('Öğrenci planı yüklenemedi:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

router.post('/api/coaching/assign-plan', requireAuth, (req, res) => {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false });
    }

    const { studentId, planId, month, week, year, weekStart, weekStartDate } = req.body;
    const slot = parseMonthSlot(month);
    const result = assignPlanToStudent({
        teacherId: req.session.userId,
        studentId: Number(studentId),
        planId: Number(planId),
        weekStart: weekStart || weekStartDate,
        year: year ?? slot.year,
        month: slot.month,
        week: Number(week)
    });

    if (!result.ok) {
        return res.status(400).json({ success: false, message: result.error });
    }

    const teacher = dbGet('SELECT full_name, username FROM users WHERE id = ?', [
        req.session.userId
    ]);
    const sourcePlan = dbGet('SELECT title FROM weekly_plans WHERE id = ?', [Number(planId)]);
    const planTitle = sourcePlan?.title ? `"${sourcePlan.title}"` : 'bir';
    createNotification(Number(studentId), {
        type: 'assignment',
        title: 'Yeni plan atandı',
        body: `${displayName(teacher)} sana ${planTitle} çalışma planı atadı.`,
        link: '/'
    });

    res.json({ success: true, studentPlanId: result.studentPlanId });
});

export default router;
