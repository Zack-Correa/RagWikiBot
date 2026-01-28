/**
 * Authentication Middleware
 * Simple password-based authentication for admin panel
 */

const config = require('../../config');

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    
    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    
    // For page requests, redirect to login
    res.redirect('/login');
}

/**
 * Validates the admin password
 * @param {string} password - Password to validate
 * @returns {boolean} True if valid
 */
function validatePassword(password) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
        console.warn('ADMIN_PASSWORD not set in environment variables');
        return false;
    }
    
    return password === adminPassword;
}

module.exports = {
    requireAuth,
    validatePassword
};
