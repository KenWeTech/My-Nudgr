require('dotenv').config();

if (process.env.APP_TIMEZONE) {
    process.env.TZ = process.env.APP_TIMEZONE;
    console.log(`Node.js process timezone explicitly set to: ${process.env.TZ}`);
} else {
    if (!process.env.TZ) {
        console.warn("Warning: APP_TIMEZONE or TZ environment variable not set. Node.js will use system default timezone.");
    } else {
        console.log(`Node.js process timezone using existing TZ: ${process.env.TZ}`);
    }
}

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const helmet = require("helmet");
const bonjour = require('bonjour')();

const { parseISO, isValid } = require('date-fns');
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

const useHttps = process.env.ENABLE_HTTPS === 'true'; 
const reverseProxyEnabled = process.env.REVERSE_PROXY_ENABLED === 'true';

const helmetConfig = {};

if (useHttps || reverseProxyEnabled) { 
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

const appTimeZone = process.env.APP_TIMEZONE || 'UTC';
app.locals.APP_TIMEZONE = appTimeZone;
console.log(`Application timezone set to: ${appTimeZone}`);

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

    res.locals.env = {
        BASE_URL: process.env.BASE_URL,
        HOME_ASSISTANT_WEBHOOK_URL: process.env.HOME_ASSISTANT_WEBHOOK_URL,
        NTFY_TOPIC_URL: process.env.NTFY_TOPIC_URL,
        GOTIFY_URL: process.env.GOTIFY_URL,
        LOGIN_REQUIRED: process.env.LOGIN_REQUIRED,
        HISTORY_CLEANUP_INTERVAL: process.env.HISTORY_CLEANUP_INTERVAL,
        API_KEY_REQUIRED_FOR_WEBHOOK_RECEIVE: process.env.API_KEY_REQUIRED_FOR_WEBHOOK_RECEIVE,
        APP_TIMEZONE: app.locals.APP_TIMEZONE
    };

    res.locals.parseISO = parseISO;
    res.locals.isValid = isValid;

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

let serverInstance;

if (useHttps) {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        try {
            const httpsOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
            serverInstance = https.createServer(httpsOptions, app).listen(portHttps, () => {
                console.log(`HTTPS Server running on port ${portHttps}`);
                try {
                    const service = bonjour.publish({
                        name: 'My Nudgr Web Server (HTTPS)',
                        type: 'https',
                        port: portHttps,
                        protocol: 'tcp',
                        host: 'mynudgr.local'
                    });
                    service.on('up', () => {
                        console.log(`[mDNS] HTTPS service 'My Nudgr Web Server (HTTPS)' is up and discoverable at https://mynudgr.local:${portHttps}`);
                    });
                    service.on('error', (err) => {
                        console.error(`[mDNS Error] Failed to publish HTTPS service: ${err.message}`);
                    });
                } catch (e) {
                    console.error(`[mDNS Error] Exception while trying to publish HTTPS service: ${e.message}`);
                }
            });
        } catch (e) {
            console.error("Error starting HTTPS server. Check SSL certificate files.", e.message);
            console.warn("Continuing with HTTP server only.");
            serverInstance = http.createServer(app).listen(portHttp, () => {
                console.log(`HTTP Server running on port ${portHttp} (HTTPS failed to start)`);
                try {
                    const service = bonjour.publish({
                        name: 'My Nudgr Web Server (HTTP)',
                        type: 'http',
                        port: portHttp,
                        protocol: 'tcp',
                        host: 'mynudgr.local'
                    });
                    service.on('up', () => {
                        console.log(`[mDNS] HTTP service 'My Nudgr Web Server (HTTP)' is up and discoverable at http://mynudgr.local:${portHttp}`);
                    });
                    service.on('error', (err) => {
                        console.error(`[mDNS Error] Failed to publish HTTP service (fallback): ${err.message}`);
                    });
                } catch (e) {
                    console.error(`[mDNS Error] Exception while trying to publish HTTP service (fallback): ${e.message}`);
                }
            });
        }
    } else {
        console.warn("HTTPS is enabled in .env, but SSL certificate (key.pem or cert.pem) not found in /ssl directory.");
        console.warn("HTTPS server will not start. Falling back to HTTP.");
        serverInstance = http.createServer(app).listen(portHttp, () => {
            console.log(`HTTP Server running on port ${portHttp} (HTTPS disabled due to missing certs)`);
            try {
                const service = bonjour.publish({
                    name: 'My Nudgr Web Server (HTTP)',
                    type: 'http',
                    port: portHttp,
                    protocol: 'tcp',
                    host: 'mynudgr.local'
                });
                service.on('up', () => {
                    console.log(`[mDNS] HTTP service 'My Nudgr Web Server (HTTP)' is up and discoverable at http://mynudgr.local:${portHttp}`);
                });
                service.on('error', (err) => {
                    console.error(`[mDNS Error] Failed to publish HTTP service (fallback from missing certs): ${err.message}`);
                });
            } catch (e) {
                console.error(`[mDNS Error] Exception while trying to publish HTTP service (fallback from missing certs): ${e.message}`);
            }
        });
    }
} else {
    serverInstance = http.createServer(app).listen(portHttp, () => {
        console.log(`HTTP Server running on port ${portHttp}`);
        try {
            const service = bonjour.publish({
                name: 'My Nudgr Web Server (HTTP)',
                type: 'http',
                port: portHttp,
                protocol: 'tcp',
                host: 'mynudgr.local'
            });
            service.on('up', () => {
                console.log(`[mDNS] HTTP service 'My Nudgr Web Server (HTTP)' is up and discoverable at http://mynudgr.local:${portHttp}`);
            });
            service.on('error', (err) => {
                console.error(`[mDNS Error] Failed to publish HTTP service: ${err.message}`);
            });
        } catch (e) {
            console.error(`[mDNS Error] Exception while trying to publish HTTP service: ${e.message}`);
        }
    });
}

process.on('SIGTERM', () => {
    console.log('[Server Shutdown] Stopping mDNS service...');
    bonjour.unpublishAll();
    bonjour.destroy();
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('[Server Shutdown] Server closed.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('[Server Shutdown] Stopping mDNS service...');
    bonjour.unpublishAll();
    bonjour.destroy();
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('[Server Shutdown] Server closed.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
