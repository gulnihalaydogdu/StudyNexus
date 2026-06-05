import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { isProduction } from '../config.js';

const cspDirectives = {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"]
};

if (isProduction) {
    cspDirectives.upgradeInsecureRequests = [];
}

export const helmetMiddleware = helmet({
    strictTransportSecurity: isProduction
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives
    },
    crossOriginEmbedderPolicy: false
});

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Çok fazla istek. Lütfen biraz bekleyin.' }
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.'
});

export function ensureCsrfToken(req, res, next) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

export function csrfProtection(req, res, next) {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body?._csrf;
    if (token && req.session.csrfToken && token === req.session.csrfToken) {
        return next();
    }

    const wantsJson =
        req.path.startsWith('/api/') ||
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

    if (wantsJson) {
        return res.status(403).json({ success: false, message: 'Geçersiz güvenlik jetonu.' });
    }
    return res.status(403).send('Geçersiz istek. Sayfayı yenileyip tekrar deneyin.');
}
