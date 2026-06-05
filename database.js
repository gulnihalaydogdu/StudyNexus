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
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('student', 'teacher')) NOT NULL,
            full_name TEXT,
            email TEXT,
            birth_date TEXT,
            location TEXT,
            grade TEXT,
            age INTEGER,
            branch TEXT,
            is_verified INTEGER DEFAULT 0,
            verification_token TEXT,
            reset_token TEXT,
            reset_expires INTEGER
        );

        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER,
            user_id INTEGER,
            name TEXT NOT NULL,
            is_completed INTEGER DEFAULT 0,
            FOREIGN KEY(course_id) REFERENCES courses(id)
        );

        CREATE TABLE IF NOT EXISTS weekly_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            date_range TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS weekly_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER,
            day_name TEXT NOT NULL,
            topic_id INTEGER,
            description TEXT,
            FOREIGN KEY (plan_id) REFERENCES weekly_plans(id),
            FOREIGN KEY (topic_id) REFERENCES topics(id)
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            plan_id INTEGER,
            target_month TEXT NOT NULL,
            target_week INTEGER NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES weekly_plans(id)
        );
    `);
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
