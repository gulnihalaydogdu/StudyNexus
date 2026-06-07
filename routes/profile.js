import express from 'express';
import bcrypt from 'bcrypt';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/security.js';
import { dbGet, dbRun } from '../lib/db.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { sendMail } from '../lib/mail.js';
import { config, isMailConfigured, autoVerifyWhenNoMail } from '../config.js';
import { changeEmailEmail } from '../lib/emailTemplates.js';
import {
    changePasswordValidators,
    changeEmailValidators,
    deleteAccountValidators
} from '../middleware/validators.js';

const router = express.Router();

function takeProfileFlash(req) {
    const flashMsg = req.session.profileFlash || null;
    const flashType = req.session.profileFlashType || 'success';
    req.session.profileFlash = null;
    req.session.profileFlashType = null;
    return { flashMsg, flashType };
}

function setProfileFlash(req, message, type = 'success') {
    req.session.profileFlash = message;
    req.session.profileFlashType = type;
}

const PROFILE_PAGES = {
    personal: { title: 'Kişisel Bilgiler', subtitle: 'Profil ve iletişim bilgilerinizi düzenleyin' },
    password: { title: 'Şifre Değiştir', subtitle: 'Hesap güvenliğinizi güncelleyin' },
    email: { title: 'E-Posta Değiştir', subtitle: 'E-posta adresinizi güvenle değiştirin' },
    delete: { title: 'Hesabı Sil', subtitle: 'Hesabınızı kalıcı olarak kapatın' }
};

function renderProfilePage(req, res, activeTab) {
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user) return res.status(500).send('Veritabanı hatası.');

    const { flashMsg, flashType } = takeProfileFlash(req);
    const page = PROFILE_PAGES[activeTab] || PROFILE_PAGES.personal;

    res.render('profile', {
        user,
        activeTab,
        pageTitle: page.title,
        pageSubtitle: page.subtitle,
        flashMsg,
        flashType,
        mailConfigured: isMailConfigured(),
        csrfToken: res.locals.csrfToken
    });
}

function findUserByEmailChangeToken(token) {
    if (!token) return null;
    const hashed = hashToken(token);
    let user = dbGet(
        'SELECT * FROM users WHERE verification_token = ? AND pending_email IS NOT NULL',
        [hashed]
    );
    if (!user) {
        user = dbGet(
            'SELECT * FROM users WHERE verification_token = ? AND pending_email IS NOT NULL',
            [token]
        );
    }
    return user;
}

router.get('/profile', requireAuth, (req, res) => renderProfilePage(req, res, 'personal'));
router.get('/profile/password', requireAuth, (req, res) => renderProfilePage(req, res, 'password'));
router.get('/profile/email', requireAuth, (req, res) => renderProfilePage(req, res, 'email'));
router.get('/profile/delete', requireAuth, (req, res) => renderProfilePage(req, res, 'delete'));

router.post('/profile/edit', requireAuth, (req, res) => {
    const { full_name, location, birth_date, grade, age, branch } = req.body;
    const ageValue = age === '' || age == null ? null : Number(age);

    dbRun(
        `UPDATE users SET full_name = ?, location = ?, birth_date = ?, grade = ?, age = ?, branch = ?,
         updated_at = datetime('now')
         WHERE id = ?`,
        [
            full_name,
            location,
            birth_date,
            req.session.role === 'student' ? grade || null : null,
            req.session.role === 'student' ? ageValue : null,
            req.session.role === 'teacher' ? branch || null : null,
            req.session.userId
        ]
    );

    setProfileFlash(req, 'Kişisel bilgileriniz güncellendi.');
    res.redirect('/profile');
});

router.post(
    '/profile/password',
    requireAuth,
    authLimiter,
    (req, _res, next) => {
        req.profileRedirect = '/profile/password';
        next();
    },
    changePasswordValidators,
    async (req, res) => {
        const { currentPassword, password } = req.body;
        const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (!user) return res.status(500).send('Veritabanı hatası.');

        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) {
            setProfileFlash(req, 'Mevcut şifre hatalı.', 'error');
            return res.redirect('/profile/password');
        }

        const hashed = await bcrypt.hash(password, 10);
        dbRun(
            `UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL,
             updated_at = datetime('now') WHERE id = ?`,
            [hashed, user.id]
        );

        setProfileFlash(req, 'Şifreniz başarıyla güncellendi.');
        res.redirect('/profile/password');
    }
);

router.post(
    '/profile/email',
    requireAuth,
    authLimiter,
    (req, _res, next) => {
        req.profileRedirect = '/profile/email';
        next();
    },
    changeEmailValidators,
    async (req, res) => {
        const { email, password } = req.body;
        const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (!user) return res.status(500).send('Veritabanı hatası.');

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            setProfileFlash(req, 'Onay için girdiğiniz şifre hatalı.', 'error');
            return res.redirect('/profile/email');
        }

        if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
            setProfileFlash(req, 'Bu zaten mevcut e-posta adresiniz.', 'error');
            return res.redirect('/profile/email');
        }

        const taken = dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [email, user.id]);
        if (taken) {
            setProfileFlash(req, 'Bu e-posta adresi başka bir hesapta kayıtlı.', 'error');
            return res.redirect('/profile/email');
        }

        if (!isMailConfigured()) {
            if (autoVerifyWhenNoMail) {
                dbRun(
                    `UPDATE users SET email = ?, pending_email = NULL, verification_token = NULL,
                     is_verified = 1, updated_at = datetime('now') WHERE id = ?`,
                    [email, user.id]
                );
                setProfileFlash(req, 'E-posta adresiniz güncellendi.');
                return res.redirect('/profile/email');
            }
            setProfileFlash(
                req,
                'E-posta değişikliği için sunucuda mail ayarları yapılandırılmalı.',
                'error'
            );
            return res.redirect('/profile/email');
        }

        const rawToken = generateToken();
        dbRun(
            `UPDATE users SET pending_email = ?, verification_token = ?,
             updated_at = datetime('now') WHERE id = ?`,
            [email, hashToken(rawToken), user.id]
        );

        const link = `${config.appUrl}/profile/confirm-email?token=${rawToken}`;
        const mailContent = changeEmailEmail({
            name: user.full_name || user.username,
            confirmUrl: link,
            newEmail: email
        });
        const mailResult = await sendMail({
            to: email,
            subject: mailContent.subject,
            html: mailContent.html
        });

        if (mailResult.skipped) {
            dbRun('UPDATE users SET pending_email = NULL, verification_token = NULL WHERE id = ?', [
                user.id
            ]);
            setProfileFlash(req, 'Doğrulama e-postası gönderilemedi. Mail ayarlarını kontrol edin.', 'error');
            return res.redirect('/profile/email');
        }

        setProfileFlash(
            req,
            `${email} adresine doğrulama bağlantısı gönderildi. Onaylayana kadar mevcut e-postanız geçerlidir.`
        );
        res.redirect('/profile/email');
    }
);

router.get('/profile/confirm-email', (req, res) => {
    const { token } = req.query;
    const user = findUserByEmailChangeToken(token);

    if (!user) {
        return res.render('verify-result', {
            success: false,
            message: 'Geçersiz veya süresi dolmuş e-posta doğrulama bağlantısı.'
        });
    }

    const taken = dbGet('SELECT id FROM users WHERE email = ? AND id != ?', [
        user.pending_email,
        user.id
    ]);
    if (taken) {
        dbRun('UPDATE users SET pending_email = NULL, verification_token = NULL WHERE id = ?', [
            user.id
        ]);
        return res.render('verify-result', {
            success: false,
            message: 'Bu e-posta adresi artık başka bir hesapta kayıtlı. Değişiklik iptal edildi.'
        });
    }

    dbRun(
        `UPDATE users SET email = ?, pending_email = NULL, verification_token = NULL,
         is_verified = 1, updated_at = datetime('now') WHERE id = ?`,
        [user.pending_email, user.id]
    );

    res.render('verify-result', {
        success: true,
        message: 'E-posta adresiniz güncellendi. Giriş yaparak devam edebilirsiniz.'
    });
});

router.post(
    '/profile/delete',
    requireAuth,
    authLimiter,
    (req, _res, next) => {
        req.profileRedirect = '/profile/delete';
        next();
    },
    deleteAccountValidators,
    async (req, res) => {
        const { password, confirmUsername } = req.body;
        const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (!user) return res.status(500).send('Veritabanı hatası.');

        if (confirmUsername.trim() !== user.username) {
            setProfileFlash(req, 'Kullanıcı adı eşleşmiyor. Hesap silinmedi.', 'error');
            return res.redirect('/profile/delete');
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            setProfileFlash(req, 'Şifre hatalı. Hesap silinmedi.', 'error');
            return res.redirect('/profile/delete');
        }

        dbRun('DELETE FROM users WHERE id = ?', [user.id]);
        req.session.destroy(() => {
            res.render('verify-result', {
                success: true,
                message: 'Hesabınız ve tüm verileriniz kalıcı olarak silindi.'
            });
        });
    }
);

export default router;
