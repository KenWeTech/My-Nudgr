require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const helmet = require("helmet");

const webRoutes = require('./routes/webRoutes');
const apiRoutes = require('./routes/apiRoutes');
const { initializeDb } = require('./database');
const { startScheduler } = require('./scheduler');
const auth = require('./auth');

const app = express();

if (process.env.REVERSE_PROXY_ENABLED === 'true') {
    console.log("App configured to run behind a reverse proxy: 'trust proxy' is enabled.");
    app.set('trust proxy', 1);
}

const enableHttps = process.env.ENABLE_HTTPS === 'true';
const reverseProxyEnabled = process.env.REVERSE_PROXY_ENABLED === 'true';

const helmetConfig = {};

if (enableHttps || reverseProxyEnabled) {
    helmetConfig.hsts = true;
    helmetConfig.contentSecurityPolicy = {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"],
            "style-src": ["'self'", "'unsafe-inline'"]
        }
    };
    helmetConfig.crossOriginOpenerPolicy = { policy: 'same-origin' };
} else {
    helmetConfig.hsts = false;
    helmetConfig.contentSecurityPolicy = false;
    helmetConfig.crossOriginOpenerPolicy = false;
}

app.use(helmet(helmetConfig));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

if (process.env.LOGIN_REQUIRED === 'true' || !process.env.LOGIN_REQUIRED) {
    app.use(session({
        secret: process.env.SESSION_SECRET || 'fallback_secret_key_please_change',
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: process.env.ENABLE_HTTPS === 'true',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        }
    }));
}

app.use((req, res, next) => {
    if (process.env.LOGIN_REQUIRED === 'true') {
        res.locals.isAuthenticated = req.session.isAuthenticated;
        res.locals.username = req.session.isAuthenticated ? process.env.ADMIN_USERNAME : null;
    } else {
        res.locals.isAuthenticated = true;
        res.locals.username = "User";
    }
    res.locals.env = process.env;
    next();
});


initializeDb();

app.use('/', webRoutes);
app.use('/api', apiRoutes);

app.use((req, res, next) => {
    res.status(404).render('404', { 
        appName: 'My Nudger',
        url: req.originalUrl,
		req
    });
});

app.use((err, req, res, next) => {
    console.error("Global error handler:", err.stack);
    res.status(err.status || 500).render('error', {
         appName: 'My Nudgr',
         message: err.message,
         error: process.env.NODE_ENV === 'development' ? err : {},
		 req
    });
});


startScheduler();

const portHttp = parseInt(process.env.PORT_HTTP, 10) || 6000;
const portHttps = parseInt(process.env.PORT_HTTPS, 10) || 6443;

const sslDir = path.join(__dirname, 'ssl');
const keyPath = path.join(sslDir, 'key.pem');
const certPath = path.join(sslDir, 'cert.pem');

const httpServer = http.createServer(app);
httpServer.listen(portHttp, () => {
    console.log(`🚀 HTTP Server running on port ${portHttp}`);
});

if (enableHttps) {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        try {
            const httpsOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
            const httpsServer = https.createServer(httpsOptions, app);
            httpsServer.listen(portHttps, () => {
                console.log(`🔒 HTTPS Server running on port ${portHttps}`);
            });
        } catch (e) {
            console.error("Error starting HTTPS server. Check SSL certificate files.", e.message);
            console.warn("Continuing with HTTP server only.");
        }
    } else {
        console.warn("HTTPS is enabled in .env, but SSL certificate (key.pem or cert.pem) not found in /ssl directory.");
        console.warn("HTTPS server will not start. Please provide SSL certificates or set ENABLE_HTTPS=false.");
    }
} else {
    console.log("HTTPS is disabled. Only HTTP server will start.");
}
