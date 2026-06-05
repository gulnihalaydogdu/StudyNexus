// middleware/authMiddleware.js

export const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
        return;
    }

    const wantsJson =
        req.path.startsWith('/api/') ||
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

    if (wantsJson) {
        return res.status(401).json({ success: false, message: 'Oturum gerekli.' });
    }

    res.redirect('/login');
};