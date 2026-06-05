import { body, validationResult } from 'express-validator';

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const message = errors.array()[0]?.msg || 'Geçersiz bilgi girdiniz.';
    const wantsJson =
        req.path.startsWith('/api/') ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

    if (wantsJson) {
        return res.status(400).json({ success: false, message });
    }

    const view = req.authView || 'login';
    const base = {
        mailConfigured: req.mailConfigured,
        requireMail: req.requireMail,
        error: message,
        csrfToken: res.locals.csrfToken
    };

    if (view === 'register') return res.render('register', base);
    if (view === 'forgot-password') {
        return res.render('forgot-password', { ...base, message: null });
    }
    if (view === 'reset-password') {
        return res.render('reset-password', { token: req.body.token, error: message });
    }
    return res.render('login', { ...base, flash: null });
}

export const registerValidators = [
    body('role').isIn(['student', 'teacher']).withMessage('Geçerli bir rol seçin.'),
    body('username')
        .trim()
        .isLength({ min: 3, max: 32 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Kullanıcı adı 3–32 karakter, harf/rakam/alt çizgi olmalı.'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Şifre en az 8 karakter olmalı.'),
    body('full_name').trim().isLength({ min: 2, max: 80 }).withMessage('İsim soyisim gerekli.'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Geçerli bir e-posta girin.'),
    body('location').trim().isLength({ min: 2, max: 80 }).withMessage('Şehir bilgisi gerekli.'),
    body('birth_date').isISO8601().withMessage('Geçerli bir doğum tarihi seçin.'),
    handleValidationErrors
];

export const loginValidators = [
    body('username').trim().notEmpty().withMessage('Kullanıcı adı gerekli.'),
    body('password').notEmpty().withMessage('Şifre gerekli.'),
    handleValidationErrors
];

export const forgotPasswordValidators = [
    body('email').trim().isEmail().normalizeEmail().withMessage('Geçerli bir e-posta girin.'),
    handleValidationErrors
];

export const resetPasswordValidators = [
    body('token').notEmpty().withMessage('Geçersiz sıfırlama bağlantısı.'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Şifre en az 8 karakter olmalı.'),
    body('passwordConfirm').custom((val, { req }) => {
        if (val !== req.body.password) throw new Error('Şifreler eşleşmiyor.');
        return true;
    }),
    handleValidationErrors
];
