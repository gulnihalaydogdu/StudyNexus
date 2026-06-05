// middleware/authMiddleware.js

export const requireAuth = (req, res, next) => {
    // Eğer oturumda bir userId varsa (yani kullanıcı giriş yapmışsa)
    if (req.session.userId) {
        next(); // Sonraki aşamaya (rotaya) geçmesine izin ver
    } else {
        // Giriş yapmamışsa login sayfasına geri gönder
        res.redirect('/login');
    }
};