import 'dotenv/config';

export const config = {
    port: Number(process.env.PORT) || 3000,
    sessionSecret: process.env.SESSION_SECRET || 'studynexus_dev_secret_change_me',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    mail: {
        user: (process.env.MAIL_USER || '').trim(),
        pass: (process.env.MAIL_PASS || '').replace(/\s/g, ''),
        from: (process.env.MAIL_FROM || process.env.MAIL_USER || '').trim()
    },
    reminders: {
        initialDelayMs: Number(process.env.REMINDER_INITIAL_DELAY_MS) || 15000,
        intervalMs: Number(process.env.REMINDER_INTERVAL_MS) || 60 * 60 * 1000
    }
};

export const isMailConfigured = () => Boolean(config.mail.user && config.mail.pass);

/** Yalnızca bilinçli geliştirme için: AUTO_VERIFY_WHEN_NO_MAIL=true */
export const autoVerifyWhenNoMail = process.env.AUTO_VERIFY_WHEN_NO_MAIL === 'true';

export const requireMail = process.env.REQUIRE_MAIL !== 'false';
export const isProduction = process.env.NODE_ENV === 'production';
