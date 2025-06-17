// utils/responseHelpers.js

const sendHtmlResponse = (res, statusCode, title, h1Class, h1Text, message, includeAutoCloseScript = false) => {
    res.setHeader('Content-Type', 'text/html');
    res.status(statusCode).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-title" content="My Nudgr">
            <meta name="apple-mobile-web-app-status-bar-style" content="default">
            <title>My Nudgr - ${title}</title>
            <link rel="stylesheet" href="/css/style.css">
            <link rel="icon" href="/assets/logo.png" type="image/png">
            <link rel="apple-touch-icon" href="/assets/logo.png">
            <link rel="manifest" href="/manifest.json">
        </head>
        <body class="auto-close-page">
            <div class="container">
                <h1 class="${h1Class}">${h1Text}</h1>
                <p class="message">${message}</p>
                ${includeAutoCloseScript ?
                    '<p class="footer-note">This window will attempt to close shortly. You can close it manually.</p>' :
                    '<p class="return-link-container"><a href="/">Go back to the main page</a></p>'
                }
            </div>
            ${includeAutoCloseScript ? '<script src="/js/auto-close.js"></script>' : ''}
        </body>
        </html>
    `);
};

module.exports = {
    sendHtmlResponse
};