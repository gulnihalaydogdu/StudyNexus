import express from 'express';
import session from 'express-session';
import { config, isMailConfigured, requireMail, autoVerifyWhenNoMail } from './config.js';
import { dbReady } from './database.js';
import indexRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import coachingRoutes from './routes/coaching.js';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false
    })
);

app.use('/', authRoutes);
app.use('/', coachingRoutes);
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
        });
    })
    .catch(() => {
        process.exit(1);
    });
