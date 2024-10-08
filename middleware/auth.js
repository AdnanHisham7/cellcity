const jwt = require('jsonwebtoken');

exports.authMiddleware = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        if (['/login', '/signup'].includes(req.originalUrl)) {
            return next(); // Allow access to login/signup pages
        }
        return next(); // Proceed for other routes without token (may need to redirect to login if required)
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Admin routes handling
        if (req.user.role === 'admin') {
            if (req.originalUrl === '/admin/login') {
                return res.redirect('/admin');
            }
        } else {
            // Non-admin users redirect logic
            if (req.originalUrl.startsWith('/admin')) {
                return res.redirect('/');
            }
            if (['/login', '/signup'].includes(req.originalUrl)) {
                return res.redirect('/');
            }
        }

        next(); // Proceed to the next middleware/route
    } catch (err) {
        console.error('Token verification failed:', err);
        res.clearCookie('token'); // Clear the invalid token
        return next(); // Proceed to the next middleware/route (e.g., login page)
    }
};
