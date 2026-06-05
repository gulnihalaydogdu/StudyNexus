import { dbRun, dbGet, dbAll, getDatabase } from './db.js';

const SCHEMA_VERSION = 3;

function tableHasColumn(table, column) {
    const cols = dbAll(`PRAGMA table_info(${table})`);
    return cols.some((c) => c.name === column);
}

function tableSql(name) {
    return dbGet("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [name])?.sql || '';
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
}
