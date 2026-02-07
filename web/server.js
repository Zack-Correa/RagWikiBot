/**
 * Express Web Server
 * Admin panel for managing market alerts
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const logger = require('../utils/logger');
const { validatePassword } = require('./middleware/auth');

const app = express();

// Store Discord client reference
let discordClient = null;

/**
 * Sets the Discord client for user lookups
 * @param {Client} client - Discord.js client
 */
function setDiscordClient(client) {
    discordClient = client;
}

/**
 * Gets the Discord client
 * @returns {Client|null}
 */
function getDiscordClient() {
    return discordClient;
}

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'ragwiki-admin-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Login page (public)
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login handler
app.post('/login', (req, res) => {
    const { password } = req.body;
    
    if (validatePassword(password)) {
        req.session.authenticated = true;
        logger.info('Admin logged in', { ip: req.ip });
        res.redirect('/');
    } else {
        logger.warn('Failed login attempt', { ip: req.ip });
        res.redirect('/login?error=1');
    }
});

// Logout handler
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session', { error: err.message });
        }
        res.redirect('/login');
    });
});

// Serve static CSS, JS and assets files (public)
app.use('/style.css', express.static(path.join(__dirname, 'public', 'style.css')));
app.use('/app.js', express.static(path.join(__dirname, 'public', 'app.js')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// API routes (protected) - pass Discord client getter
const createApiRoutes = require('./routes/api');
app.use('/api', createApiRoutes(getDiscordClient));

// Main dashboard (requires auth)
app.get('/', (req, res) => {
    if (!req.session || !req.session.authenticated) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Express error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

/**
 * Starts the web server
 * @param {number} port - Port to listen on
 * @param {string} host - Host to bind to (default: 0.0.0.0 for network access)
 * @returns {Promise<Object>} Server instance
 */
function start(port, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            const networkUrl = host === '0.0.0.0' ? 'http://<seu-ip>:' + port : `http://${host}:${port}`;
            logger.info('Admin panel started', { 
                port,
                host,
                localUrl: `http://localhost:${port}`,
                networkUrl
            });
            resolve(server);
        });
        
        server.on('error', (error) => {
            logger.error('Failed to start admin panel', { error: error.message });
            reject(error);
        });
    });
}

module.exports = {
    app,
    start,
    setDiscordClient,
    getDiscordClient
};
