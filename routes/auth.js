import express from 'express';
import bcrypt from 'bcrypt';
import { config, isMailConfigured, autoVerifyWhenNoMail, requireMail } from '../config.js';
import { sendMail } from '../lib/mail.js';
import { dbRun, dbGet } from '../lib/db.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { verificationEmail, resetPasswordEmail } from '../lib/emailTemplates.js';
import { authLimiter } from '../middleware/security.js';
import {
    registerValidators,
    loginValidators,
    forgotPasswordValidators,
    resetPasswordValidators
} from '../middleware/validators.js';
import { pickRegisterForm, pickForgotForm, pickLoginForm } from '../lib/formStick.js';

const router = express.Router();

const LOGIN_FAIL_MSG = 'Hatalı kullanıcı adı veya şifre.';

function mailRequiredMessage() {
    return 'E-posta sunucusu yapılandırılmamış. Proje klasöründe .env dosyası oluşturup MAIL_USER ve MAIL_PASS (Gmail uygulama şifresi) alanlarını doldurun, ardından sunucuyu yeniden başlatın.';
}

function authLocals(req, res) {
    return {
        mailConfigured: isMailConfigured(),
        requireMail,
        csrfToken: res.locals.csrfToken
    };
}

function verifyUserByToken(token) {
    if (!token || typeof token !== 'string' || token.length < 32) return 0;
    const hashed = hashToken(token);
    let result = dbRun(
        'UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?',
        [hashed]
    );
    if (result.changes === 0) {
        result = dbRun(
            'UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?',
            [token]
        );
    }
    return result.changes;
}

function findUserByResetToken(token) {
    if (!token) return null;
    const hashed = hashToken(token);
    let user = dbGet('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [
        hashed,
        Date.now()
    ]);
    if (!user) {
        user = dbGet('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [
            token,
            Date.now()
        ]);
    }
    return user;
}

router.get('/register', (req, res) => {
    res.render('register', authLocals(req, res));
});

router.post(
    '/register',
    authLimiter,
    (req, res, next) => {
        req.authView = 'register';
        req.mailConfigured = isMailConfigured();
        req.requireMail = requireMail;
        next();
    },
    registerValidators,
    async (req, res) => {
        const { username, password, role, full_name, email, birth_date, location, grade, age, branch } =
            req.body;

        if (requireMail && !isMailConfigured() && !autoVerifyWhenNoMail) {
            return res.render('register', {
                ...authLocals(req, res),
                error: mailRequiredMessage(),
                form: pickRegisterForm(req.body)
            });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const rawToken = generateToken();
            const verifyNow = autoVerifyWhenNoMail && !isMailConfigured();
            const ageValue = age === '' || age == null ? null : Number(age);

            dbRun(
                `INSERT INTO users
                (username, password, role, full_name, email, birth_date, location, grade, age, branch,
                 verification_token, is_verified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    username,
                    hashedPassword,
                    role,
                    full_name,
                    email,
                    birth_date,
                    location,
                    role === 'student' ? grade || null : null,
                    role === 'student' ? ageValue : null,
                    role === 'teacher' ? branch || null : null,
                    verifyNow ? null : hashToken(rawToken),
                    verifyNow ? 1 : 0
                ]
            );

            if (verifyNow) {
                return res.render('register-success', {
                    mode: 'auto_verified',
                    username
                });
            }

            const verificationLink = `${config.appUrl}/verify?token=${rawToken}`;
            const mailContent = verificationEmail({
                name: full_name || username,
                verifyUrl: verificationLink
            });
            const mailResult = await sendMail({
                to: email,
                subject: mailContent.subject,
                html: mailContent.html
            });

            if (mailResult.skipped) {
                dbRun('DELETE FROM users WHERE username = ?', [username]);
                const reason =
                    mailResult.reason === 'send_failed'
                        ? 'Gmail bağlantısı başarısız. MAIL_USER ve MAIL_PASS değerlerini kontrol edin.'
                        : mailRequiredMessage();
                return res.render('register', {
                    ...authLocals(req, res),
                    error: `Doğrulama e-postası gönderilemedi. ${reason}`,
                    form: pickRegisterForm(req.body)
                });
            }

            res.render('register-success', {
                mode: 'email_sent',
                username,
                email
            });
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE')) {
                return res.render('register', {
                    ...authLocals(req, res),
                    error: 'Kayıt oluşturulamadı. Bilgileri kontrol edip tekrar deneyin.',
                    form: pickRegisterForm(req.body)
                });
            }
            console.error('Kayıt hatası:', error);
            return res.render('register', {
                ...authLocals(req, res),
                error: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.',
                form: pickRegisterForm(req.body)
            });
        }
    }
);

router.get('/verify', (req, res) => {
    const { token } = req.query;
    const ok = verifyUserByToken(token);
    if (!ok) {
        return res.render('verify-result', {
            success: false,
            message: 'Geçersiz veya süresi dolmuş doğrulama bağlantısı.'
        });
    }
    res.render('verify-result', {
        success: true,
        message: 'E-postanız doğrulandı. Artık giriş yapabilirsiniz!'
    });
});

router.get('/login', (req, res) => {
    const flash = req.session.flash || null;
    req.session.flash = null;
    res.render('login', {
        ...authLocals(req, res),
        flash,
        error: null
    });
});

router.post(
    '/login',
    authLimiter,
    (req, res, next) => {
        req.authView = 'login';
        next();
    },
    loginValidators,
    async (req, res) => {
        const { username, password } = req.body;

        let user;
        try {
            user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
        } catch (error) {
            console.error('Giriş veritabanı hatası:', error);
            return res.status(503).render('login', {
                ...authLocals(req, res),
                flash: null,
                error: 'Sunucu geçici olarak kullanılamıyor. Lütfen tekrar deneyin.',
                form: pickLoginForm(req.body)
            });
        }

        if (!user) {
            return res.render('login', {
                ...authLocals(req, res),
                flash: null,
                error: LOGIN_FAIL_MSG,
                form: pickLoginForm(req.body)
            });
        }

        if (user.is_verified === 0) {
            if (autoVerifyWhenNoMail && !isMailConfigured()) {
                dbRun('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', [
                    user.id
                ]);
            } else {
                return res.render('login', {
                    ...authLocals(req, res),
                    flash: null,
                    error: LOGIN_FAIL_MSG,
                    form: pickLoginForm(req.body)
                });
            }
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render('login', {
                ...authLocals(req, res),
                flash: null,
                error: LOGIN_FAIL_MSG,
                form: pickLoginForm(req.body),
                fieldError: 'password'
            });
        }

        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.username = user.username;
        res.redirect('/');
    }
);

router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', {
        ...authLocals(req, res),
        message: null,
        error: null
    });
});

router.post(
    '/forgot-password',
    authLimiter,
    (req, res, next) => {
        req.authView = 'forgot-password';
        next();
    },
    forgotPasswordValidators,
    async (req, res) => {
        if (requireMail && !isMailConfigured()) {
            return res.render('forgot-password', {
                ...authLocals(req, res),
                message: null,
                error: mailRequiredMessage(),
                form: pickForgotForm(req.body)
            });
        }

        const { email } = req.body;
        const user = dbGet('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.render('forgot-password', {
                ...authLocals(req, res),
                message: 'E-posta kayıtlıysa sıfırlama linki gönderildi.',
                error: null
            });
        }

        const rawToken = generateToken();
        const expires = Date.now() + 60 * 60 * 1000;
        dbRun('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [
            hashToken(rawToken),
            expires,
            user.id
        ]);

        const link = `${config.appUrl}/reset-password?token=${rawToken}`;
        const mailContent = resetPasswordEmail({
            name: user.full_name || user.username,
            resetUrl: link
        });
        const mailResult = await sendMail({
            to: user.email,
            subject: mailContent.subject,
            html: mailContent.html
        });

        if (mailResult.skipped) {
            return res.render('forgot-password', {
                ...authLocals(req, res),
                message: null,
                error: 'Sıfırlama e-postası gönderilemedi. Mail ayarlarını kontrol edin.',
                form: pickForgotForm(req.body)
            });
        }

        res.render('forgot-password', {
            ...authLocals(req, res),
            message: 'Sıfırlama linki e-posta adresinize gönderildi.',
            error: null
        });
    }
);

router.get('/reset-password', (req, res) => {
    const { token } = req.query;
    const user = findUserByResetToken(token);
    if (!user) {
        return res.render('verify-result', {
            success: false,
            message: 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı.'
        });
    }
    res.render('reset-password', { token, error: null, ...authLocals(req, res) });
});

router.post(
    '/reset-password',
    authLimiter,
    (req, res, next) => {
        req.authView = 'reset-password';
        next();
    },
    resetPasswordValidators,
    async (req, res) => {
        const { token, password } = req.body;
        const user = findUserByResetToken(token);
        if (!user) {
            return res.render('verify-result', {
                success: false,
                message: 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı.'
            });
        }

        const hashed = await bcrypt.hash(password, 10);
        dbRun('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [
            hashed,
            user.id
        ]);

        req.session.flash = 'Şifreniz güncellendi. Giriş yapabilirsiniz.';
        res.redirect('/login');
    }
);

export default router;
