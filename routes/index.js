import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { dbAll, dbGet, dbRun } from '../lib/db.js';
import { getWeekPanelForUser } from '../lib/weekPanel.js';
import { getPlanForUser, getPlanItemsWithNames, replacePlanItems } from '../lib/weeklyPlan.js';
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const flashMsg = req.session.flashMsg;
    req.session.flashMsg = null;

    try {
        const courses = dbAll('SELECT * FROM courses WHERE user_id = ? ORDER BY name', [userId]);
        const topics = dbAll(
            `SELECT t.* FROM topics t
             JOIN courses c ON t.course_id = c.id
             WHERE c.user_id = ?
             ORDER BY t.name`,
            [userId]
        );

        const weeklyPlans = dbAll(
            'SELECT * FROM weekly_plans WHERE user_id = ? ORDER BY id DESC',
            [userId]
        );

        const calendarEvents = dbAll(
            'SELECT * FROM calendar_events WHERE user_id = ?',
            [userId]
        );

        const stats = buildStats(courses, topics);
        const weekPanel = getWeekPanelForUser(userId, calendarEvents);

        res.render('dashboard', {
            courses,
            topics,
            weeklyPlans: weeklyPlans || [],
            calendarEvents: calendarEvents || [],
            stats,
            weekPanel,
            user: {
                username: req.session.username,
                role: req.session.role,
                id: userId
            },
            flashMsg
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Dashboard yüklenemedi.');
    }
});

function buildStats(courses, topics) {
    const totalTopics = topics.length;
    const completedTopics = topics.filter((t) => t.is_completed).length;
    const overallPercent = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;

    const byCourse = courses.map((c) => {
        const courseTopics = topics.filter((t) => t.course_id === c.id);
        const done = courseTopics.filter((t) => t.is_completed).length;
        const total = courseTopics.length;
        return {
            id: c.id,
            name: c.name,
            done,
            total,
            percent: total ? Math.round((done / total) * 100) : 0
        };
    });

    return { overallPercent, completedTopics, totalTopics, byCourse };
}

router.get('/api/stats', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [userId]);
    const topics = dbAll(
        `SELECT t.* FROM topics t JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [userId]
    );
    res.json({ success: true, stats: buildStats(courses, topics) });
});

router.get('/api/week-panel', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const calendarEvents = dbAll('SELECT * FROM calendar_events WHERE user_id = ?', [userId]);
    res.json({ success: true, weekPanel: getWeekPanelForUser(userId, calendarEvents) });
});

router.post('/add-course', requireAuth, (req, res) => {
    const { courseName } = req.body;
    try {
        const { lastID } = dbRun('INSERT INTO courses (name, user_id) VALUES (?, ?)', [
            courseName,
            req.session.userId
        ]);
        res.json({ success: true, id: lastID, name: courseName });
    } catch {
        res.status(500).json({ success: false });
    }
});

router.post('/add-topic', requireAuth, (req, res) => {
    const { courseId, topicName } = req.body;
    const course = dbGet('SELECT id FROM courses WHERE id = ? AND user_id = ?', [
        courseId,
        req.session.userId
    ]);
    if (!course) return res.status(403).json({ success: false });

    try {
        const { lastID } = dbRun(
            'INSERT INTO topics (course_id, name, user_id) VALUES (?, ?, ?)',
            [courseId, topicName, req.session.userId]
        );
        res.json({ success: true, id: lastID, name: topicName, courseId });
    } catch {
        res.status(500).json({ success: false });
    }
});

router.post('/save-weekly-plan', requireAuth, (req, res) => {
    const { title, dateRange, planData } = req.body;
    const userId = req.session.userId;

    if (!title || !dateRange) {
        return res.status(400).json({ success: false, message: 'Başlık ve tarih zorunludur!' });
    }

    try {
        const { lastID } = dbRun(
            'INSERT INTO weekly_plans (user_id, title, date_range) VALUES (?, ?, ?)',
            [userId, title, dateRange]
        );
        replacePlanItems(lastID, planData);
        res.json({ success: true, planId: lastID });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

router.put('/api/plan/:id', requireAuth, (req, res) => {
    const planId = req.params.id;
    const userId = req.session.userId;
    const { title, dateRange, planData } = req.body;

    const plan = getPlanForUser(planId, userId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan bulunamadı.' });

    if (!title || !dateRange) {
        return res.status(400).json({ success: false, message: 'Başlık ve tarih zorunludur.' });
    }

    try {
        dbRun('UPDATE weekly_plans SET title = ?, date_range = ? WHERE id = ? AND user_id = ?', [
            title,
            dateRange,
            planId,
            userId
        ]);
        replacePlanItems(planId, planData);
        res.json({ success: true, planId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

router.get('/api/plan/:id', requireAuth, (req, res) => {
    const planId = req.params.id;
    const userId = req.session.userId;

    const plan = getPlanForUser(planId, userId);
    if (!plan) return res.status(404).json({ success: false });

    const items = getPlanItemsWithNames(planId);
    res.json({ success: true, plan, items });
});

router.post('/delete-course', requireAuth, (req, res) => {
    const { courseId } = req.body;
    const course = dbGet('SELECT id FROM courses WHERE id = ? AND user_id = ?', [
        courseId,
        req.session.userId
    ]);
    if (!course) return res.status(403).json({ success: false });

    dbRun('DELETE FROM topics WHERE course_id = ?', [courseId]);
    dbRun('DELETE FROM courses WHERE id = ?', [courseId]);
    res.json({ success: true });
});

router.post('/delete-topic', requireAuth, (req, res) => {
    const topicId = req.body.topicId;
    const topic = dbGet(
        `SELECT t.id FROM topics t JOIN courses c ON t.course_id = c.id
         WHERE t.id = ? AND c.user_id = ?`,
        [topicId, req.session.userId]
    );
    if (!topic) return res.status(403).json({ success: false });

    dbRun('DELETE FROM topics WHERE id = ?', [topicId]);

    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [req.session.userId]);
    const topics = dbAll(
        `SELECT t.* FROM topics t JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [req.session.userId]
    );
    res.json({ success: true, stats: buildStats(courses, topics) });
});

router.post('/toggle-topic', requireAuth, (req, res) => {
    const topicId = req.body.topicId;
    const isCompleted = req.body.isCompleted ? 1 : 0;
    const topic = dbGet(
        `SELECT t.id FROM topics t JOIN courses c ON t.course_id = c.id
         WHERE t.id = ? AND c.user_id = ?`,
        [topicId, req.session.userId]
    );
    if (!topic) return res.status(403).json({ success: false });

    dbRun('UPDATE topics SET is_completed = ? WHERE id = ?', [isCompleted, topicId]);

    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [req.session.userId]);
    const topics = dbAll(
        `SELECT t.* FROM topics t JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [req.session.userId]
    );
    res.json({ success: true, stats: buildStats(courses, topics) });
});

router.post('/delete-weekly-plan', requireAuth, (req, res) => {
    const { planId } = req.body;
    const plan = getPlanForUser(planId, req.session.userId);
    if (!plan) return res.status(404).json({ success: false });

    dbRun('DELETE FROM calendar_events WHERE plan_id = ?', [planId]);
    dbRun('DELETE FROM plan_assignments WHERE student_plan_id = ?', [planId]);
    dbRun('DELETE FROM weekly_plan_items WHERE plan_id = ?', [planId]);
    dbRun('DELETE FROM weekly_plans WHERE id = ?', [planId]);
    res.json({ success: true });
});

router.post('/assign-to-calendar', requireAuth, (req, res) => {
    const { planId, month, week } = req.body;
    const plan = getPlanForUser(planId, req.session.userId);
    if (!plan) return res.status(404).json({ success: false });

    dbRun(
        'DELETE FROM calendar_events WHERE user_id = ? AND target_month = ? AND target_week = ?',
        [req.session.userId, month, week]
    );
    dbRun(
        'INSERT INTO calendar_events (user_id, plan_id, target_month, target_week) VALUES (?, ?, ?, ?)',
        [req.session.userId, planId, month, week]
    );
    res.json({ success: true });
});

router.get('/profile', requireAuth, (req, res) => {
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user) return res.status(500).send('Veritabanı hatası.');
    res.render('profile', { user });
});

router.post('/profile/edit', requireAuth, (req, res) => {
    const { full_name, location, birth_date, grade, age, branch } = req.body;
    dbRun(
        `UPDATE users SET full_name = ?, location = ?, birth_date = ?, grade = ?, age = ?, branch = ?
         WHERE id = ?`,
        [full_name, location, birth_date, grade, age, branch, req.session.userId]
    );
    res.redirect('/profile');
});

export default router;
