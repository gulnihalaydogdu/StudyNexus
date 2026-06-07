import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { dbAll, dbGet, dbRun } from '../lib/db.js';
import { getWeekPanelForUser } from '../lib/weekPanel.js';
import { getPlanForUser, getPlanItemsWithNames, replacePlanItems } from '../lib/weeklyPlan.js';
import { getDynamicMonths } from '../lib/calendarMonths.js';
import { parseMonthSlot } from '../lib/calendarSlot.js';
import { assignPlanToCalendarSlot } from '../lib/calendarAssign.js';
import { getProgressTrend, localDateKey, recordProgressSnapshot } from '../lib/progress.js';
import { getGamificationSummary } from '../lib/gamification.js';
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

        const stats = buildStats(courses, topics, userId);
        const weekPanel = getWeekPanelForUser(userId, calendarEvents);

        const dynamicMonths = getDynamicMonths(5);

        const viewData = {
            courses,
            topics,
            weeklyPlans: weeklyPlans || [],
            calendarEvents: calendarEvents || [],
            dynamicMonths,
            user: {
                username: req.session.username,
                role: req.session.role,
                id: userId
            },
            flashMsg
        };

        if (req.session.role === 'teacher') {
            return res.render('teacher-dashboard', viewData);
        }

        res.render('dashboard-student', {
            ...viewData,
            stats,
            weekPanel,
            gamification: getGamificationSummary(userId, stats)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Dashboard yüklenemedi.');
    }
});

function buildStats(courses, topics, userId = null) {
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

    return {
        overallPercent,
        completedTopics,
        totalTopics,
        byCourse,
        trend: userId ? getProgressTrend(userId) : []
    };
}

function getStatsForUser(userId) {
    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [userId]);
    const topics = dbAll(
        `SELECT t.* FROM topics t JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [userId]
    );
    return buildStats(courses, topics, userId);
}

function getWeekPanelForResponse(userId) {
    const calendarEvents = dbAll('SELECT * FROM calendar_events WHERE user_id = ?', [userId]);
    return getWeekPanelForUser(userId, calendarEvents);
}

function getGamificationForUser(userId, stats) {
    return getGamificationSummary(userId, stats);
}

router.get('/api/stats', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const courses = dbAll('SELECT * FROM courses WHERE user_id = ?', [userId]);
    const topics = dbAll(
        `SELECT t.* FROM topics t JOIN courses c ON t.course_id = c.id WHERE c.user_id = ?`,
        [userId]
    );
    const stats = buildStats(courses, topics, userId);
    res.json({ success: true, stats, gamification: getGamificationForUser(userId, stats) });
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
        const { lastID } = dbRun('INSERT INTO topics (course_id, name) VALUES (?, ?)', [
            courseId,
            topicName
        ]);
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
        res.json({ success: true, planId: lastID, weekPanel: getWeekPanelForResponse(userId) });
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
        dbRun(
            `UPDATE weekly_plans SET title = ?, date_range = ?, updated_at = datetime('now')
             WHERE id = ? AND user_id = ?`,
            [title, dateRange, planId, userId]
        );
        replacePlanItems(planId, planData);
        res.json({ success: true, planId, weekPanel: getWeekPanelForResponse(userId) });
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

    const items = getPlanItemsWithNames(planId, userId);
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
    const stats = buildStats(courses, topics, req.session.userId);
    recordProgressSnapshot(req.session.userId, stats);
    res.json({ success: true, stats, gamification: getGamificationForUser(req.session.userId, stats) });
});

router.post('/api/pomodoro/complete', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Sadece öğrenciler için.' });
    }

    let minutes = Number(req.body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) minutes = 0;
    minutes = Math.min(Math.round(minutes), 600);

    dbRun(
        'INSERT INTO pomodoro_sessions (user_id, minutes, completed_on) VALUES (?, ?, ?)',
        [req.session.userId, minutes, localDateKey()]
    );

    const stats = getStatsForUser(req.session.userId);
    res.json({
        success: true,
        stats,
        gamification: getGamificationForUser(req.session.userId, stats)
    });
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

    dbRun('UPDATE topics SET is_completed = ?, updated_at = datetime(\'now\') WHERE id = ?', [
        isCompleted,
        topicId
    ]);

    const stats = getStatsForUser(req.session.userId);
    recordProgressSnapshot(req.session.userId, stats);
    res.json({ success: true, stats, gamification: getGamificationForUser(req.session.userId, stats) });
});

router.post('/api/week-item/:id/toggle', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Sadece öğrenciler işaretleyebilir.' });
    }

    const itemId = Number(req.params.id);
    const completed = req.body.completed ? 1 : 0;
    if (!Number.isFinite(itemId)) {
        return res.status(400).json({ success: false, message: 'Geçersiz görev.' });
    }

    const item = dbGet(
        `SELECT wpi.id, wpi.topic_id
         FROM weekly_plan_items wpi
         JOIN weekly_plans wp ON wp.id = wpi.plan_id
         WHERE wpi.id = ? AND wp.user_id = ?`,
        [itemId, req.session.userId]
    );
    if (!item) {
        return res.status(404).json({
            success: false,
            stale: true,
            message: 'Görev listesi güncel değil.'
        });
    }

    const today = localDateKey();
    if (completed) {
        dbRun(
            `INSERT OR IGNORE INTO daily_task_completions (user_id, plan_item_id, completed_on)
             VALUES (?, ?, ?)`,
            [req.session.userId, itemId, today]
        );
    } else {
        dbRun(
            `DELETE FROM daily_task_completions
             WHERE user_id = ? AND plan_item_id = ? AND completed_on = ?`,
            [req.session.userId, itemId, today]
        );
    }

    dbRun('UPDATE weekly_plan_items SET is_completed = ? WHERE id = ?', [completed, itemId]);

    const stats = getStatsForUser(req.session.userId);
    recordProgressSnapshot(req.session.userId, stats);

    res.json({
        success: true,
        completed: Boolean(completed),
        itemId,
        topicId: item.topic_id,
        stats,
        gamification: getGamificationForUser(req.session.userId, stats),
        weekPanel: getWeekPanelForResponse(req.session.userId)
    });
});

router.post('/delete-weekly-plan', requireAuth, (req, res) => {
    const { planId } = req.body;
    const plan = getPlanForUser(planId, req.session.userId);
    if (!plan) return res.status(404).json({ success: false });

    dbRun('DELETE FROM weekly_plans WHERE id = ?', [planId]);
    res.json({ success: true });
});

router.post('/assign-to-calendar', requireAuth, (req, res) => {
    const { planId, month, week, year, weekStart, weekStartDate } = req.body;
    const plan = getPlanForUser(planId, req.session.userId);
    if (!plan) return res.status(404).json({ success: false });

    const slot = parseMonthSlot(month);
    const result = assignPlanToCalendarSlot({
        userId: req.session.userId,
        planId,
        weekStart: weekStart || weekStartDate,
        year: year ?? slot.year,
        month: slot.month,
        week: Number(week)
    });

    if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message });
    }

    res.json({
        success: true,
        action: result.action,
        message: result.message,
        year: result.year,
        month: result.month,
        week: result.week,
        weekStart: result.weekStart,
        weekEnd: result.weekEnd,
        weekRangeLabel: result.weekRangeLabel,
        previousSlot: result.previousSlot || null
    });
});

router.get('/api/calendar/weeks', requireAuth, (req, res) => {
    const slot = parseMonthSlot(req.query.month);
    const months = getDynamicMonths(12);
    const monthData = months.find((m) => m.year === slot.year && m.name === slot.month);
    res.json({ success: true, weeks: monthData?.weeks || [] });
});

export default router;
