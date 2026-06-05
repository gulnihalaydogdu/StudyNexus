import { dbRun, dbGet, dbAll } from './db.js';

function ensureColumn(table, column, definition) {
    const cols = dbAll(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
        dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

/** Eski sınıf/günlük plan/hatırlatıcı tablolarını kaldırır */
function dropLegacyTables() {
    const legacy = [
        'class_shared_plans',
        'class_enrollments',
        'classes',
        'study_plans',
        'reminder_log'
    ];
    for (const table of legacy) {
        dbRun(`DROP TABLE IF EXISTS ${table}`);
    }
}

export function runMigrations() {
    ensureColumn('users', 'reset_token', 'TEXT');
    ensureColumn('users', 'reset_expires', 'INTEGER');
    ensureColumn('courses', 'user_id', 'INTEGER');
    ensureColumn('topics', 'user_id', 'INTEGER');
    ensureColumn('users', 'coach_code', 'TEXT');
    ensureColumn('weekly_plan_items', 'topic_label', 'TEXT');
    ensureColumn('weekly_plan_items', 'course_label', 'TEXT');

    dbRun(`CREATE TABLE IF NOT EXISTS teacher_student_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, student_id),
        FOREIGN KEY(teacher_id) REFERENCES users(id),
        FOREIGN KEY(student_id) REFERENCES users(id)
    )`);

    dbRun(`CREATE TABLE IF NOT EXISTS plan_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        source_plan_id INTEGER,
        student_plan_id INTEGER NOT NULL,
        target_month TEXT NOT NULL,
        target_week INTEGER NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(teacher_id) REFERENCES users(id),
        FOREIGN KEY(student_id) REFERENCES users(id),
        FOREIGN KEY(student_plan_id) REFERENCES weekly_plans(id)
    )`);

    dropLegacyTables();

    const orphanCourses = dbGet('SELECT COUNT(*) as c FROM courses WHERE user_id IS NULL');
    if (orphanCourses?.c > 0) {
        const firstUser = dbGet('SELECT id FROM users ORDER BY id LIMIT 1');
        if (firstUser) {
            dbRun('UPDATE courses SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
            dbRun('UPDATE topics SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
        }
    }
}
