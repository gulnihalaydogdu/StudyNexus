import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { setDatabase, dbRun } from './lib/db.js';
import { runMigrations } from './lib/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'studynexus.db');

export const db = new Database(dbPath);

setDatabase(db);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 10000');

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'teacher')),
            full_name TEXT,
            email TEXT,
            birth_date TEXT,
            location TEXT,
            grade TEXT,
            age INTEGER,
            branch TEXT,
            coach_code TEXT UNIQUE,
            is_verified INTEGER NOT NULL DEFAULT 0,
            verification_token TEXT,
            reset_token TEXT,
            reset_expires INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, name)
        );

        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            is_completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE (course_id, name)
        );

        CREATE TABLE IF NOT EXISTS weekly_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            date_range TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS weekly_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_name TEXT NOT NULL,
            topic_id INTEGER,
            description TEXT NOT NULL DEFAULT '',
            topic_label TEXT NOT NULL DEFAULT '',
            course_label TEXT NOT NULL DEFAULT '',
            is_completed INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (plan_id) REFERENCES weekly_plans(id) ON DELETE CASCADE,
            FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
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
        );

        CREATE TABLE IF NOT EXISTS teacher_student_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            joined_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (teacher_id, student_id),
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS plan_assignments (
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
        );

        CREATE TABLE IF NOT EXISTS daily_task_completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_item_id INTEGER NOT NULL,
            completed_on TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, plan_item_id, completed_on),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (plan_item_id) REFERENCES weekly_plan_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS progress_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            snapshot_date TEXT NOT NULL,
            total_topics INTEGER NOT NULL DEFAULT 0,
            completed_topics INTEGER NOT NULL DEFAULT 0,
            overall_percent INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, snapshot_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS study_reminder_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            reminder_date TEXT NOT NULL,
            reminder_type TEXT NOT NULL DEFAULT 'daily_plan',
            sent_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, reminder_date, reminder_type),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
    dbRun('CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_topics_course ON topics(course_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_weekly_plans_user ON weekly_plans(user_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON weekly_plan_items(plan_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_calendar_user ON calendar_events(user_id)');
    dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_plan_unique ON calendar_events(plan_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_daily_task_user_date ON daily_task_completions(user_id, completed_on)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_progress_user_date ON progress_snapshots(user_id, snapshot_date)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_reminder_user_date ON study_reminder_log(user_id, reminder_date)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_tsl_teacher ON teacher_student_links(teacher_id)');
    dbRun('CREATE INDEX IF NOT EXISTS idx_tsl_student ON teacher_student_links(student_id)');
}

try {
    initSchema();
    runMigrations();
    console.log('SQLite veritabanı hazır:', dbPath);
} catch (err) {
    console.error('Veritabanı başlatılamadı:', err);
    throw err;
}

export const dbReady = Promise.resolve();

export function closeDatabase() {
    db.close();
}

function shutdown(signal) {
    try {
        closeDatabase();
    } catch {
        /* ignore */
    }
    if (signal === 'SIGUSR2') {
        process.kill(process.pid, 'SIGUSR2');
    } else {
        process.exit(0);
    }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGUSR2', () => shutdown('SIGUSR2'));

export default db;
