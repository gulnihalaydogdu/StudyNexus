import express from 'express';
import session from 'express-session';
import { createRequire } from 'module';
import { config, isMailConfigured, requireMail, autoVerifyWhenNoMail, isProduction } from './config.js';
import { db, dbReady } from './database.js';
import indexRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import coachingRoutes from './routes/coaching.js';
import notificationRoutes from './routes/notifications.js';
import messageRoutes from './routes/messages.js';
import profileRoutes from './routes/profile.js';
import { startDailyReminderScheduler } from './lib/reminders.js';
import {
    helmetMiddleware,
    globalLimiter,
    ensureCsrfToken,
    csrfProtection
} from './middleware/security.js';

const require = createRequire(import.meta.url);
const SqliteStore = require('better-sqlite3-session-store')(session);

const app = express();

app.set('view engine', 'ejs');
app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(globalLimiter);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

app.use(
    session({
        store: new SqliteStore({
            client: db,
            expired: { clear: true, intervalMs: 900000 }
        }),
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        name: 'snx.sid',
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

app.use(ensureCsrfToken);
app.use(csrfProtection);

app.use('/', authRoutes);
app.use('/', coachingRoutes);
app.use('/', notificationRoutes);
app.use('/', messageRoutes);
app.use('/', profileRoutes);
app.use('/', indexRoutes);

dbReady
    .then(() => {
        app.listen(config.port, () => {
            console.log(
                `Sunucu ${config.appUrl.replace(/\/$/, '')} (port ${config.port}) üzerinde çalışıyor...`
            );
            if (requireMail && !isMailConfigured() && !autoVerifyWhenNoMail) {
                console.warn(
                    '⚠️  MAIL_USER / MAIL_PASS .env içinde tanımlı değil — kayıt ve şifre sıfırlama e-postası çalışmaz.'
                );
            } else if (isMailConfigured()) {
                console.log('✉️  E-posta gönderimi aktif:', config.mail.user);
            }
            startDailyReminderScheduler();
        });
    })
    .catch(() => {
        process.exit(1);
    });
