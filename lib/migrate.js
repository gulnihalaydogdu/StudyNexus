import { dbRun, dbGet, dbAll, getDatabase } from './db.js';
import { legacySlotToWeekStart, getWeekEndFromStart, resolveWeekSlot } from './calendarDates.js';

const SCHEMA_VERSION = 12;

function tableHasColumn(table, column) {
    const cols = dbAll(`PRAGMA table_info(${table})`);
    return cols.some((c) => c.name === column);
}

function tableSql(name) {
    return dbGet("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [name])?.sql || '';
}

function tableExists(name) {
    return Boolean(dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]));
}

function hasCascadeOn(table, column) {
    const sql = tableSql(table);
    const re = new RegExp(`FOREIGN KEY\\s*\\([^)]*${column}[^)]*\\)[^)]*ON DELETE CASCADE`, 'i');
    return re.test(sql);
}

function dropLegacyTables() {
    for (const table of [
        'class_shared_plans',
        'class_enrollments',
        'classes',
        'study_plans',
        'reminder_log'
    ]) {
        dbRun(`DROP TABLE IF EXISTS ${table}`);
    }
}

function ensureIndexes() {
    dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
    dbRun('CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_topics_course ON topics(course_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_weekly_plans_user ON weekly_plans(user_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON weekly_plan_items(plan_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id)');
    dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_plan_unique ON calendar_events(plan_id)');
    if (tableExists('daily_task_completions')) {
        dbRun('CREATE INDEX IF NOT EXISTS idx_daily_task_user_date ON daily_task_completions(user_id, completed_on)');
    }
    if (tableExists('progress_snapshots')) {
        dbRun('CREATE INDEX IF NOT EXISTS idx_progress_user_date ON progress_snapshots(user_id, snapshot_date)');
    }
    if (tableExists('study_reminder_log')) {
        dbRun('CREATE INDEX IF NOT EXISTS idx_reminder_user_date ON study_reminder_log(user_id, reminder_date)');
    }
    if (tableExists('plan_feedback')) {
        dbRun('CREATE INDEX IF NOT EXISTS idx_feedback_student ON plan_feedback(student_id, created_at)');
        dbRun('CREATE INDEX IF NOT EXISTS idx_feedback_teacher ON plan_feedback(teacher_id, created_at)');
    }
    dbRun('CREATE INDEX IF NOT EXISTS idx_tsl_teacher ON teacher_student_links(teacher_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_tsl_student ON teacher_student_links(student_id)');
}

function dedupeCalendarPlanAssignments() {
    dbRun(`DELETE FROM calendar_events
           WHERE id NOT IN (
               SELECT MAX(id) FROM calendar_events GROUP BY plan_id
           )`);
}

function migrateToV3() {
    dedupeCalendarPlanAssignments();
    ensureIndexes();
}

function ensureValueFeatureTables() {
    dbRun(`CREATE TABLE IF NOT EXISTS daily_task_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan_item_id INTEGER NOT NULL,
        completed_on TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, plan_item_id, completed_on),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_item_id) REFERENCES weekly_plan_items(id) ON DELETE CASCADE
    )`);

    dbRun(`CREATE TABLE IF NOT EXISTS progress_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        total_topics INTEGER NOT NULL DEFAULT 0,
        completed_topics INTEGER NOT NULL DEFAULT 0,
        overall_percent INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, snapshot_date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    dbRun(`CREATE TABLE IF NOT EXISTS study_reminder_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        reminder_date TEXT NOT NULL,
        reminder_type TEXT NOT NULL DEFAULT 'daily_plan',
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, reminder_date, reminder_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
}

function migrateToV4() {
    ensureValueFeatureTables();
    ensureIndexes();
}

function migrateToV5() {
    if (!tableHasColumn('weekly_plan_items', 'is_completed')) {
        dbRun('ALTER TABLE weekly_plan_items ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0');
    }
    dbRun(`UPDATE weekly_plan_items
           SET is_completed = 1
           WHERE id IN (SELECT DISTINCT plan_item_id FROM daily_task_completions)`);
}

function ensureGrowthTables() {
    if (!tableHasColumn('weekly_plans', 'is_template')) {
        dbRun('ALTER TABLE weekly_plans ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0');
    }

    dbRun(`CREATE TABLE IF NOT EXISTS plan_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        plan_id INTEGER,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES weekly_plans(id) ON DELETE SET NULL
    )`);
}

function migrateToV6() {
    ensureGrowthTables();
    ensureIndexes();
}

function ensureTopicMetaColumns() {
    if (!tableHasColumn('topics', 'estimated_minutes')) {
        dbRun('ALTER TABLE topics ADD COLUMN estimated_minutes INTEGER NOT NULL DEFAULT 0');
    }
    if (!tableHasColumn('topics', 'notes')) {
        dbRun("ALTER TABLE topics ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
    }
}

function migrateToV7() {
    ensureTopicMetaColumns();
}

function ensurePomodoroTable() {
    dbRun(`CREATE TABLE IF NOT EXISTS pomodoro_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        minutes INTEGER NOT NULL DEFAULT 0,
        completed_on TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    dbRun('CREATE INDEX IF NOT EXISTS idx_pomodoro_user_date ON pomodoro_sessions(user_id, completed_on)');
}

function migrateToV8() {
    ensurePomodoroTable();
}

function ensureNotificationsTable() {
    dbRun(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    dbRun('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at)');
}

function migrateToV9() {
    ensureNotificationsTable();
}

function ensureMessagingTables() {
    dbRun(`CREATE TABLE IF NOT EXISTS message_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(teacher_id, student_id)
    )`);
    dbRun(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        read_at TEXT,
        FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    dbRun('CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_threads_teacher ON message_threads(teacher_id, updated_at)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_threads_student ON message_threads(student_id, updated_at)');
}

function migrateToV10() {
    ensureMessagingTables();
}

function rebuildCalendarEventsRealDates() {
    if (
        tableHasColumn('calendar_events', 'week_start_date') &&
        tableSql('calendar_events').includes('UNIQUE (user_id, week_start_date)')
    ) {
        return;
    }

    if (!tableHasColumn('calendar_events', 'week_start_date')) {
        dbRun('ALTER TABLE calendar_events ADD COLUMN week_start_date TEXT');
        dbRun('ALTER TABLE calendar_events ADD COLUMN week_end_date TEXT');
    }

    const rows = dbAll('SELECT * FROM calendar_events');
    for (const row of rows) {
        if (row.week_start_date) continue;
        const start = legacySlotToWeekStart(row.target_year, row.target_month, row.target_week);
        const end = getWeekEndFromStart(start);
        dbRun('UPDATE calendar_events SET week_start_date = ?, week_end_date = ? WHERE id = ?', [
            start,
            end,
            row.id
        ]);
    }

    dropStagingTable('calendar_events_new');
    dbRun(`CREATE TABLE calendar_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan_id INTEGER NOT NULL,
        target_year INTEGER NOT NULL,
        target_month TEXT NOT NULL,
        target_week INTEGER NOT NULL CHECK(target_week BETWEEN 1 AND 6),
        week_start_date TEXT NOT NULL,
        week_end_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES weekly_plans(id) ON DELETE CASCADE,
        UNIQUE (user_id, week_start_date)
    )`);

    const createdExpr = tableHasColumn('calendar_events', 'created_at')
        ? "COALESCE(created_at, datetime('now'))"
        : "datetime('now')";

    dbRun(`INSERT OR REPLACE INTO calendar_events_new
           (id, user_id, plan_id, target_year, target_month, target_week, week_start_date, week_end_date, created_at)
           SELECT id, user_id, plan_id, target_year, target_month, target_week,
                  week_start_date, week_end_date, ${createdExpr}
           FROM calendar_events
           WHERE week_start_date IS NOT NULL`);

    dbRun('DROP TABLE calendar_events');
    dbRun('ALTER TABLE calendar_events_new RENAME TO calendar_events');
    dbRun('CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id)');
    dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_plan_unique ON calendar_events(plan_id)');
}

function rebuildPlanAssignmentsRealDates() {
    if (!tableExists('plan_assignments')) return;

    if (!tableHasColumn('plan_assignments', 'week_start_date')) {
        dbRun('ALTER TABLE plan_assignments ADD COLUMN week_start_date TEXT');
        dbRun('ALTER TABLE plan_assignments ADD COLUMN week_end_date TEXT');
    }

    const rows = dbAll('SELECT * FROM plan_assignments WHERE week_start_date IS NULL');
    for (const row of rows) {
        const resolved = resolveWeekSlot({
            year: row.target_year,
            month: row.target_month,
            week: row.target_week
        });
        if (!resolved) continue;
        dbRun('UPDATE plan_assignments SET week_start_date = ?, week_end_date = ? WHERE id = ?', [
            resolved.weekStart,
            resolved.weekEnd,
            row.id
        ]);
    }
}

function migrateToV11() {
    rebuildCalendarEventsRealDates();
    rebuildPlanAssignmentsRealDates();
}

function migrateToV12() {
    if (!tableHasColumn('users', 'pending_email')) {
        dbRun('ALTER TABLE users ADD COLUMN pending_email TEXT');
    }
}

function ensureUserTimestamps() {
    if (!tableHasColumn('users', 'created_at')) {
        dbRun('ALTER TABLE users ADD COLUMN created_at TEXT');
        dbRun("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL");
    }
    if (!tableHasColumn('users', 'updated_at')) {
        dbRun('ALTER TABLE users ADD COLUMN updated_at TEXT');
        dbRun("UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL");
    }
}

function dropStagingTable(name) {
    dbRun(`DROP TABLE IF EXISTS ${name}`);
}

function rebuildTopicsTable() {
    if (!tableHasColumn('topics', 'user_id') && !tableHasColumn('topics', 'estimated_minutes')) {
        return;
    }

    dropStagingTable('topics_new');
    dbRun(`CREATE TABLE topics_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        UNIQUE (course_id, name)
    )`);
    dbRun(`INSERT OR IGNORE INTO topics_new (id, course_id, name, is_completed)
           SELECT id, course_id, name, COALESCE(is_completed, 0)
           FROM topics WHERE course_id IS NOT NULL`);
    dbRun('DROP TABLE topics');
    dbRun('ALTER TABLE topics_new RENAME TO topics');
}

function rebuildCoursesTable() {
    if (
        tableHasColumn('courses', 'created_at') &&
        tableHasColumn('courses', 'updated_at') &&
        hasCascadeOn('courses', 'user_id')
    ) {
        return;
    }

    dropStagingTable('courses_new');
    dbRun(`CREATE TABLE courses_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, name)
    )`);
    dbRun(`INSERT OR IGNORE INTO courses_new (id, user_id, name)
           SELECT id, COALESCE(user_id, (SELECT id FROM users ORDER BY id LIMIT 1)), name
           FROM courses`);
    dbRun('DROP TABLE courses');
    dbRun('ALTER TABLE courses_new RENAME TO courses');
}

function rebuildWeeklyPlans() {
    if (hasCascadeOn('weekly_plan_items', 'plan_id') && tableHasColumn('weekly_plans', 'updated_at')) {
        return;
    }

    dropStagingTable('weekly_plans_new');
    dropStagingTable('weekly_plan_items_new');

    dbRun(`CREATE TABLE weekly_plans_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        date_range TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    dbRun(`INSERT INTO weekly_plans_new (id, user_id, title, date_range, created_at, updated_at)
           SELECT id, user_id, title, date_range,
                  COALESCE(created_at, datetime('now')),
                  COALESCE(created_at, datetime('now'))
           FROM weekly_plans`);
    dbRun('DROP TABLE weekly_plans');
    dbRun('ALTER TABLE weekly_plans_new RENAME TO weekly_plans');

    dbRun(`CREATE TABLE weekly_plan_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        day_name TEXT NOT NULL,
        topic_id INTEGER,
        description TEXT NOT NULL DEFAULT '',
        topic_label TEXT NOT NULL DEFAULT '',
        course_label TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (plan_id) REFERENCES weekly_plans(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
    )`);
    dbRun(`INSERT INTO weekly_plan_items_new
           (id, plan_id, day_name, topic_id, description, topic_label, course_label)
           SELECT id, plan_id, day_name, topic_id,
                  COALESCE(description, ''),
                  COALESCE(topic_label, ''),
                  COALESCE(course_label, '')
           FROM weekly_plan_items`);
    dbRun('DROP TABLE weekly_plan_items');
    dbRun('ALTER TABLE weekly_plan_items_new RENAME TO weekly_plan_items');
}

function rebuildCalendarEvents() {
    if (
        tableHasColumn('calendar_events', 'target_year') &&
        hasCascadeOn('calendar_events', 'plan_id') &&
        tableSql('calendar_events').includes('UNIQUE (user_id, target_year')
    ) {
        return;
    }

    const year = new Date().getFullYear();

    if (!tableHasColumn('calendar_events', 'target_year')) {
        dbRun(`ALTER TABLE calendar_events ADD COLUMN target_year INTEGER NOT NULL DEFAULT ${year}`);
    }
    dbRun(`UPDATE calendar_events SET target_year = ${year} WHERE target_year IS NULL`);

    dropStagingTable('calendar_events_new');
    dbRun(`CREATE TABLE calendar_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan_id INTEGER NOT NULL,
        target_year INTEGER NOT NULL,
        target_month TEXT NOT NULL,
        target_week INTEGER NOT NULL CHECK(target_week BETWEEN 1 AND 4),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES weekly_plans(id) ON DELETE CASCADE,
        UNIQUE (user_id, target_year, target_month, target_week)
    )`);
    const createdExpr = tableHasColumn('calendar_events', 'created_at')
        ? "COALESCE(created_at, datetime('now'))"
        : "datetime('now')";
    dbRun(`INSERT OR REPLACE INTO calendar_events_new
           (id, user_id, plan_id, target_year, target_month, target_week, created_at)
           SELECT id, user_id, plan_id, target_year, target_month, target_week, ${createdExpr}
           FROM calendar_events`);
    dbRun('DROP TABLE calendar_events');
    dbRun('ALTER TABLE calendar_events_new RENAME TO calendar_events');
}

function rebuildPlanAssignments() {
    if (tableHasColumn('plan_assignments', 'target_year') && hasCascadeOn('plan_assignments', 'student_plan_id')) {
        return;
    }

    const year = new Date().getFullYear();

    if (!tableHasColumn('plan_assignments', 'target_year')) {
        dbRun(`ALTER TABLE plan_assignments ADD COLUMN target_year INTEGER NOT NULL DEFAULT ${year}`);
    }
    dbRun(`UPDATE plan_assignments SET target_year = ${year} WHERE target_year IS NULL`);

    dropStagingTable('plan_assignments_new');
    dbRun(`CREATE TABLE plan_assignments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        source_plan_id INTEGER,
        student_plan_id INTEGER NOT NULL,
        target_year INTEGER NOT NULL,
        target_month TEXT NOT NULL,
        target_week INTEGER NOT NULL CHECK(target_week BETWEEN 1 AND 4),
        assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (source_plan_id) REFERENCES weekly_plans(id) ON DELETE SET NULL,
        FOREIGN KEY (student_plan_id) REFERENCES weekly_plans(id) ON DELETE CASCADE
    )`);
    dbRun(`INSERT INTO plan_assignments_new
           (id, teacher_id, student_id, source_plan_id, student_plan_id,
            target_year, target_month, target_week, assigned_at)
           SELECT id, teacher_id, student_id, source_plan_id, student_plan_id,
                  target_year, target_month, target_week,
                  COALESCE(assigned_at, datetime('now'))
           FROM plan_assignments`);
    dbRun('DROP TABLE plan_assignments');
    dbRun('ALTER TABLE plan_assignments_new RENAME TO plan_assignments');
}

function ensureCoachingTables() {
    dbRun(`CREATE TABLE IF NOT EXISTS teacher_student_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (teacher_id, student_id),
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    dbRun(`CREATE TABLE IF NOT EXISTS plan_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        source_plan_id INTEGER,
        student_plan_id INTEGER NOT NULL,
        target_year INTEGER NOT NULL,
        target_month TEXT NOT NULL,
        target_week INTEGER NOT NULL CHECK(target_week BETWEEN 1 AND 4),
        assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (source_plan_id) REFERENCES weekly_plans(id) ON DELETE SET NULL,
        FOREIGN KEY (student_plan_id) REFERENCES weekly_plans(id) ON DELETE CASCADE
    )`);

    if (!tableHasColumn('users', 'coach_code')) {
        dbRun('ALTER TABLE users ADD COLUMN coach_code TEXT');
    }
    if (!tableHasColumn('weekly_plan_items', 'topic_label')) {
        dbRun('ALTER TABLE weekly_plan_items ADD COLUMN topic_label TEXT NOT NULL DEFAULT ""');
    }
    if (!tableHasColumn('weekly_plan_items', 'course_label')) {
        dbRun('ALTER TABLE weekly_plan_items ADD COLUMN course_label TEXT NOT NULL DEFAULT ""');
    }
}

function migrateToV2() {
    dropLegacyTables();
    ensureCoachingTables();
    ensureUserTimestamps();

    const orphanCourses = dbGet('SELECT COUNT(*) as c FROM courses WHERE user_id IS NULL');
    if (orphanCourses?.c > 0) {
        const firstUser = dbGet('SELECT id FROM users ORDER BY id LIMIT 1');
        if (firstUser) {
            dbRun('UPDATE courses SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
        }
    }

    rebuildTopicsTable();
    rebuildCoursesTable();
    rebuildWeeklyPlans();
    rebuildCalendarEvents();
    if (dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name='plan_assignments'")) {
        rebuildPlanAssignments();
    }
    ensureIndexes();
}

export function runMigrations() {
    const db = getDatabase();
    const current = db.pragma('user_version', { simple: true });

    if (current < 2) {
        db.pragma('foreign_keys = OFF');
        dbRun('BEGIN');
        try {
            migrateToV2();
            db.pragma('user_version = 2');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v2 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        } finally {
            db.pragma('foreign_keys = ON');
        }
    }

    const afterV2 = db.pragma('user_version', { simple: true });
    if (afterV2 < 3) {
        dbRun('BEGIN');
        try {
            migrateToV3();
            db.pragma('user_version = 3');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v3 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV3 = db.pragma('user_version', { simple: true });
    if (afterV3 < 4) {
        dbRun('BEGIN');
        try {
            migrateToV4();
            db.pragma('user_version = 4');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v4 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV4 = db.pragma('user_version', { simple: true });
    if (afterV4 < 5) {
        dbRun('BEGIN');
        try {
            migrateToV5();
            db.pragma('user_version = 5');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v5 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV5 = db.pragma('user_version', { simple: true });
    if (afterV5 < 6) {
        dbRun('BEGIN');
        try {
            migrateToV6();
            db.pragma('user_version = 6');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v6 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV6 = db.pragma('user_version', { simple: true });
    if (afterV6 < 7) {
        dbRun('BEGIN');
        try {
            migrateToV7();
            db.pragma('user_version = 7');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v7 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV7 = db.pragma('user_version', { simple: true });
    if (afterV7 < 8) {
        dbRun('BEGIN');
        try {
            migrateToV8();
            db.pragma('user_version = 8');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v8 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV8 = db.pragma('user_version', { simple: true });
    if (afterV8 < 9) {
        dbRun('BEGIN');
        try {
            migrateToV9();
            db.pragma('user_version = 9');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v9 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV9 = db.pragma('user_version', { simple: true });
    if (afterV9 < 10) {
        dbRun('BEGIN');
        try {
            migrateToV10();
            db.pragma('user_version = 10');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v10 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV10 = db.pragma('user_version', { simple: true });
    if (afterV10 < 11) {
        dbRun('BEGIN');
        try {
            migrateToV11();
            db.pragma('user_version = 11');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v11 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }

    const afterV11 = db.pragma('user_version', { simple: true });
    if (afterV11 < 12) {
        dbRun('BEGIN');
        try {
            migrateToV12();
            db.pragma('user_version = 12');
            dbRun('COMMIT');
            console.log('Veritabanı şeması v12 güncellendi.');
        } catch (err) {
            dbRun('ROLLBACK');
            throw err;
        }
    }
}
