const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const API_KEY_FILE_PATH = path.join(__dirname, 'data', 'api_key.txt');

const checkLogin = (req, res, next) => {
    if (process.env.LOGIN_REQUIRED === 'true') {
        if (req.session && req.session.isAuthenticated) {
            return next();
        }
        return res.redirect('/login');
    }
    return next();
};

const authenticateUser = (username, password) => {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminUsername || !adminPasswordHash) {
        console.warn("Warning: Admin username or password hash not set in .env. Login will fail.");
        return false;
    }
    if (username === adminUsername && bcrypt.compareSync(password, adminPasswordHash)) {
        return true;
    }
    return false;
};

const loadApiKey = () => {
    if (fs.existsSync(API_KEY_FILE_PATH)) {
        return fs.readFileSync(API_KEY_FILE_PATH, 'utf-8').trim();
    }
    let key = process.env.GENERATED_API_KEY;
    if (!key || key === 'your-default-secret-api-key') {
        key = generateNewApiKey();
    }
    return key;
};

const saveApiKey = (key) => {
    fs.writeFileSync(API_KEY_FILE_PATH, key, 'utf-8');
    process.env.GENERATED_API_KEY = key;
    console.log("API Key saved to api_key.txt and updated in runtime process.env");
};

const generateNewApiKey = () => {
    const newKey = uuidv4();
    saveApiKey(newKey);
    return newKey;
};

let currentApiKey = loadApiKey();

const getApiKey = () => currentApiKey;

const regenerateApiKey = () => {
    currentApiKey = generateNewApiKey();
    return currentApiKey;
};

const verifyApiKey = (req, res, next) => {
    if (process.env.API_KEY_REQUIRED_FOR_WEBHOOK_RECEIVE === 'true') {
        const providedKey = req.headers['x-api-key'];
        if (!providedKey || providedKey !== getApiKey()) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
        }
    }
    next();
};


module.exports = {
    checkLogin,
    authenticateUser,
    verifyApiKey,
    getApiKey,
    regenerateApiKey
};
