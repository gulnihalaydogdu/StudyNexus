import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config, isMailConfigured, autoVerifyWhenNoMail, requireMail } from '../config.js';
import { sendMail } from '../lib/mail.js';
import { dbRun, dbGet } from '../lib/db.js';

const router = express.Router();

function mailRequiredMessage() {
    return 'E-posta sunucusu yapılandırılmamış. Proje klasöründe .env dosyası oluşturup MAIL_USER ve MAIL_PASS (Gmail uygulama şifresi) alanlarını doldurun, ardından sunucuyu yeniden başlatın.';
}

router.get('/register', (req, res) => {
    res.render('register', {
        mailConfigured: isMailConfigured(),
        requireMail
    });
});

router.post('/register', async (req, res) => {
    const { username, password, role, full_name, email, birth_date, location, grade, age, branch } =
        req.body;

    if (requireMail && !isMailConfigured() && !autoVerifyWhenNoMail) {
        return res.render('register', {
            mailConfigured: false,
            requireMail: true,
            error: mailRequiredMessage()
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verifyNow = autoVerifyWhenNoMail;
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
                verifyNow ? null : verificationToken,
                verifyNow ? 1 : 0
            ]
        );

        if (verifyNow) {
            return res.render('register-success', {
                mode: 'auto_verified',
                username
            });
        }

        const verificationLink = `${config.appUrl}/verify?token=${verificationToken}`;
        const mailResult = await sendMail({
            to: email,
            subject: 'StudyNexus - Hesabınızı Doğrulayın',
            html: `<h2>StudyNexus'a Hoş Geldin!</h2>
                   <p>Hesabını aktifleştirmek için aşağıdaki linke tıkla:</p>
                   <a href="${verificationLink}">Hesabımı Doğrula</a>`
        });

        if (mailResult.skipped) {
            dbRun('DELETE FROM users WHERE username = ?', [username]);
            const reason =
                mailResult.reason === 'send_failed'
                    ? 'Gmail bağlantısı başarısız. MAIL_USER ve MAIL_PASS değerlerini kontrol edin.'
                    : mailRequiredMessage();
            return res.render('register', {
                mailConfigured: isMailConfigured(),
                requireMail: true,
                error: `Doğrulama e-postası gönderilemedi. ${reason}`
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
                mailConfigured: isMailConfigured(),
                requireMail,
                error: 'Bu kullanıcı adı veya e-posta zaten kayıtlı.'
            });
        }
        console.error('Kayıt hatası:', error);
        return res.render('register', {
            mailConfigured: isMailConfigured(),
            requireMail,
            error: `Kayıt başarısız: ${error.message || 'Bilinmeyen hata'}.`
        });
    }
});

router.get('/verify', async (req, res) => {
    const token = req.query.token;
    const result = dbRun(
        'UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?',
        [token]
    );
    if (result.changes === 0) {
        return res.send('Geçersiz veya süresi dolmuş doğrulama linki.');
    }
    res.send('Hesabınız doğrulandı! <a href="/login">Giriş yapabilirsiniz</a>.');
});

router.get('/login', (req, res) => {
    res.render('login', {
        flash: req.session.flash || null,
        mailConfigured: isMailConfigured()
    });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    let user;
    try {
        user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
    } catch (error) {
        console.error('Giriş veritabanı hatası:', error);
        return res.status(503).send(
            'Veritabanı geçici olarak kullanılamıyor. Sunucuyu yeniden başlatıp tekrar deneyin.'
        );
    }

    if (!user) return res.send('Hatalı kullanıcı adı veya şifre!');

    if (user.is_verified === 0) {
        if (autoVerifyWhenNoMail) {
            dbRun('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', [user.id]);
        } else {
            return res.send(
                'Lütfen önce kayıt sonrası e-postanıza gelen doğrulama linkine tıklayın. Gelen kutusu ve spam klasörünü kontrol edin.'
            );
        }
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Hatalı kullanıcı adı veya şifre!');

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    res.redirect('/');
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { message: null, error: null, mailConfigured: isMailConfigured() });
});

router.post('/forgot-password', async (req, res) => {
    if (requireMail && !isMailConfigured()) {
        return res.render('forgot-password', {
            message: null,
            error: mailRequiredMessage(),
            mailConfigured: false
        });
    }

    const { email } = req.body;
    const user = dbGet('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
        return res.render('forgot-password', {
            message: 'E-posta kayıtlıysa sıfırlama linki gönderildi.',
            error: null,
            mailConfigured: isMailConfigured()
        });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 60 * 60 * 1000;
    dbRun('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);

    const link = `${config.appUrl}/reset-password?token=${token}`;
    const mailResult = await sendMail({
        to: user.email,
        subject: 'StudyNexus - Şifre Sıfırlama',
        html: `<p>Şifrenizi sıfırlamak için (1 saat geçerli):</p><a href="${link}">Şifremi sıfırla</a>`
    });

    if (mailResult.skipped) {
        return res.render('forgot-password', {
            message: null,
            error: 'Sıfırlama e-postası gönderilemedi. .env mail ayarlarını kontrol edin.',
            mailConfigured: isMailConfigured()
        });
    }

    res.render('forgot-password', {
        message: 'Sıfırlama linki e-posta adresinize gönderildi.',
        error: null,
        mailConfigured: isMailConfigured()
    });
});

router.get('/reset-password', async (req, res) => {
    const { token } = req.query;
    const user = dbGet('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [
        token,
        Date.now()
    ]);
    if (!user) {
        return res.send('Geçersiz veya süresi dolmuş bağlantı. <a href="/forgot-password">Tekrar dene</a>');
    }
    res.render('reset-password', { token });
});

router.post('/reset-password', async (req, res) => {
    const { token, password, passwordConfirm } = req.body;
    if (password !== passwordConfirm) {
        return res.send('Şifreler eşleşmiyor. <a href="javascript:history.back()">Geri</a>');
    }

    const user = dbGet('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [
        token,
        Date.now()
    ]);
    if (!user) {
        return res.send('Geçersiz veya süresi dolmuş bağlantı.');
    }

    const hashed = await bcrypt.hash(password, 10);
    dbRun('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [
        hashed,
        user.id
    ]);

    res.send('Şifreniz güncellendi. <a href="/login">Giriş yapın</a>');
});

export default router;
