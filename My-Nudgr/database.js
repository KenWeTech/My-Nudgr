const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { formatISO, parseISO } = require('date-fns');
const { addMinutes, subMinutes, subHours, subDays } = require('date-fns');
const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'reminders.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDb();
    }
});

const initializeDb = () => {
    const createTableSql = `
    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        priority INTEGER DEFAULT 2, -- 1:High, 2:Medium, 3:Low
        due_datetime TEXT NOT NULL, -- ISO8601 format
        recipient TEXT,
        alert_lead_time_value INTEGER DEFAULT 0,
        alert_lead_time_unit TEXT DEFAULT 'minutes', -- 'minutes', 'hours', 'days'
        alert_repeat_additional_count INTEGER DEFAULT 0,
        alert_repeat_interval_minutes INTEGER DEFAULT 5,
        recurrence_rule TEXT,
        recurrence_dtstart TEXT,
        recurrence_end_date TEXT, -- Optional ISO 8601 Date
	is_relentless INTEGER DEFAULT 0,  
        snooze_count INTEGER DEFAULT 0, 
        relentless_confirm_token TEXT,
        nudge_token TEXT,
	notify_home_assistant_url TEXT,
        notify_ntfy_url TEXT,
        notify_gotify_url TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        next_alert_datetime TEXT, -- ISO8601 format, when the next alert is due
        alerts_sent_count INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0, -- 0 for active, 1 for history
        api_key_identifier TEXT r
    );`;
    db.run(createTableSql, (err) => {
        if (err) console.error("Error creating reminders table", err.message);
    });

    const createSettingsTableSql = `
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );`;
    db.run(createSettingsTableSql, (err) => {
        if (err) console.error("Error creating settings table", err.message);
    });

    const columnsToAdd = [
        { name: 'recipient', type: 'TEXT' },
        { name: 'alert_lead_time_value', type: 'INTEGER DEFAULT 0' },
        { name: 'alert_lead_time_unit', type: 'TEXT DEFAULT \'minutes\'' },
        { name: 'alert_repeat_additional_count', type: 'INTEGER DEFAULT 0' },
        { name: 'alert_repeat_interval_minutes', type: 'INTEGER DEFAULT 5' },
        { name: 'recurrence_rule', type: 'TEXT DEFAULT \'none\'' },
	{ name: 'recurrence_dtstart', type: 'TEXT' },
        { name: 'recurrence_end_date', type: 'TEXT' },
        { name: 'is_relentless', type: 'INTEGER DEFAULT 0' },
        { name: 'snooze_count', type: 'INTEGER DEFAULT 0' },
        { name: 'relentless_confirm_token', type: 'TEXT' },
        { name: 'nudge_token', type: 'TEXT' },
	{ name: 'notify_home_assistant_url', type: 'TEXT' },
        { name: 'notify_ntfy_url', type: 'TEXT' },
        { name: 'notify_gotify_url', type: 'TEXT' },
        { name: 'next_alert_datetime', type: 'TEXT' },
        { name: 'alerts_sent_count', type: 'INTEGER DEFAULT 0' },
        { name: 'is_archived', type: 'INTEGER DEFAULT 0' },
        { name: 'api_key_identifier', type: 'TEXT' },
        { name: 'updated_at', type: 'TEXT DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\'))' }
    ];

    db.all("PRAGMA table_info(reminders)", (err, rows) => {
        if (err) {
            console.error("Error fetching table info for reminders:", err.message);
            return;
        }
        const existingColumns = rows.map(row => row.name);
        columnsToAdd.forEach(col => {
            if (!existingColumns.includes(col.name)) {
                db.run(`ALTER TABLE reminders ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
                    if (alterErr) console.warn(`Warning: Could not add column ${col.name}: ${alterErr.message}`);
                    else console.log(`Column ${col.name} added to reminders table.`);
                });
            }
        });
    });
};

function calculateNextAlert(reminder) {
    const dueDateTime = parseISO(reminder.due_datetime);
    let firstAlertDateTime;

    let leadValue = parseInt(reminder.alert_lead_time_value, 10) || 0;
    switch (reminder.alert_lead_time_unit) {
        case 'minutes': firstAlertDateTime = subMinutes(dueDateTime, leadValue); break;
        case 'hours': firstAlertDateTime = subHours(dueDateTime, leadValue); break;
        case 'days': firstAlertDateTime = subDays(dueDateTime, leadValue); break;
        default: firstAlertDateTime = dueDateTime;
    }
    return formatISO(firstAlertDateTime);
}

const addReminder = (reminderData) => {
    return new Promise((resolve, reject) => {
        const {
            text, priority, due_datetime, recipient,
            alert_lead_time_value, alert_lead_time_unit,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_end_date,
            is_relentless,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url,
            api_key_identifier
        } = reminderData;

        const recurrence_dtstart = (recurrence_rule && recurrence_rule !== 'none') ? due_datetime : null;
        const initialNextAlertDatetime = calculateNextAlert({ due_datetime, alert_lead_time_value, alert_lead_time_unit });

        const sql = `INSERT INTO reminders (
            text, priority, due_datetime, recipient,
            alert_lead_time_value, alert_lead_time_unit,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_dtstart, recurrence_end_date,
            is_relentless, snooze_count,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url,
            next_alert_datetime, alerts_sent_count, is_archived, api_key_identifier,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

        db.run(sql, [
            text, priority, due_datetime, recipient,
            alert_lead_time_value, alert_lead_time_unit,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_dtstart, recurrence_end_date,
            is_relentless, 0, // is_relentless, snooze_count
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url,
            initialNextAlertDatetime, 0, 0, api_key_identifier
        ], function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, ...reminderData });
        });
    });
};

const updateReminder = (id, reminderData) => {
    return new Promise((resolve, reject) => {
        const {
            text, priority, due_datetime, recipient,
            alert_lead_time_value, alert_lead_time_unit,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_end_date,
            is_relentless,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url
        } = reminderData;

        const recurrence_dtstart = (recurrence_rule && recurrence_rule !== 'none') ? due_datetime : null;
        const nextAlertDatetime = calculateNextAlert({ due_datetime, alert_lead_time_value, alert_lead_time_unit });

        const sql = `UPDATE reminders SET
            text = ?, priority = ?, due_datetime = ?, recipient = ?,
            alert_lead_time_value = ?, alert_lead_time_unit = ?,
            alert_repeat_additional_count = ?, alert_repeat_interval_minutes = ?,
            recurrence_rule = ?, recurrence_dtstart = ?, recurrence_end_date = ?,
            is_relentless = ?,
            notify_home_assistant_url = ?, notify_ntfy_url = ?, notify_gotify_url = ?,
            next_alert_datetime = ?, alerts_sent_count = 0, is_archived = 0, snooze_count = 0,
			relentless_confirm_token = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`;

        db.run(sql, [
            text, priority, due_datetime, recipient,
            alert_lead_time_value, alert_lead_time_unit,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_dtstart, recurrence_end_date,
            is_relentless,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url,
            nextAlertDatetime,
            id
        ], function(err) {
            if (err) reject(err);
            else resolve({ id, ...reminderData });
        });
    });
};

const getReminderByNudgeToken = (token) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM reminders WHERE nudge_token = ?', [token], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
};

const setNudgeToken = (id) => {
    return new Promise((resolve, reject) => {
        const token = uuidv4();
        db.run('UPDATE reminders SET nudge_token = ? WHERE id = ?', [token, id], function(err) {
            if (err) reject(err); else resolve(token);
        });
    });
};

const snoozeReminder = (id, new_due_datetime, new_next_alert_datetime) => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE reminders SET
            due_datetime = ?,
            next_alert_datetime = ?,
            priority = 1,
            snooze_count = snooze_count + 1,
            nudge_token = NULL, -- Clear the token after use
			is_archived = 0,
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`;
        db.run(sql, [new_due_datetime, new_next_alert_datetime, id], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const setRelentlessToken = (id) => {
    return new Promise((resolve, reject) => {
        const token = uuidv4();
        const sql = `UPDATE reminders SET relentless_confirm_token = ? WHERE id = ?`;
        db.run(sql, [token, id], function(err) {
            if (err) reject(err); else resolve(token);
        });
    });
};

const confirmRelentlessReminder = (token) => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE reminders SET relentless_confirm_token = NULL WHERE relentless_confirm_token = ?`;
        db.run(sql, [token], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const escalateRelentlessPriority = (id) => {
    const sql = `UPDATE reminders SET priority = 1 WHERE id = ? AND priority > 1`;
    db.run(sql, (err) => {
        if (err) console.error(`Error escalating priority for reminder ${id}:`, err);
    });
};

const deleteOldArchivedReminders = (isoDateThreshold) => {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM reminders WHERE is_archived = 1 AND updated_at < ?`;
        db.run(sql, [isoDateThreshold], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const getSetting = (key) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
};

const setSetting = (key, value) => {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const rescheduleRecurringReminder = (id, new_due_datetime, new_next_alert_datetime) => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE reminders SET
            due_datetime = ?,
            next_alert_datetime = ?,
            alerts_sent_count = 0,
            snooze_count = 0,
            relentless_confirm_token = NULL,
            nudge_token = NULL, -- Clear the token after use
			is_archived = 0,
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`;
        db.run(sql, [new_due_datetime, new_next_alert_datetime, id], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const archiveReminder = (id, archive = true) => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE reminders SET
            is_archived = ?,
            snooze_count = 0,
            relentless_confirm_token = NULL,
			next_alert_datetime = CASE WHEN ? THEN NULL ELSE next_alert_datetime END,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`;
        db.run(sql, [archive ? 1 : 0, archive ? 1 : 0, id], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const getReminders = (showArchived = false, sortBy = 'due_datetime', sortOrder = 'ASC') => {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM reminders WHERE is_archived = ? ORDER BY ${sortBy} ${sortOrder}`;
        db.all(sql, [showArchived ? 1 : 0], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
};

const getReminderById = (id) => {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM reminders WHERE id = ?`;
        db.get(sql, [id], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
};

const updateReminderAfterSendingAlert = (id, newNextAlertDatetime, newAlertsSentCount) => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE reminders SET
            next_alert_datetime = ?,
            alerts_sent_count = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`;
        db.run(sql, [newNextAlertDatetime, newAlertsSentCount, id], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const deleteReminder = (id) => {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM reminders WHERE id = ?`;
        db.run(sql, [id], function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const clearAllArchivedReminders = () => {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM reminders WHERE is_archived = 1`;
        db.run(sql, function(err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
};

const getDueRemindersForAlerting = () => {
    return new Promise((resolve, reject) => {
        const nowISO = formatISO(new Date());
        const sql = `SELECT * FROM reminders WHERE is_archived = 0 AND next_alert_datetime IS NOT NULL AND next_alert_datetime <= ?`;
        db.all(sql, [nowISO], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
};

const bulkDeleteReminders = (ids) => {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(ids) || ids.length === 0) {
            return resolve(0); // No IDs to delete
        }
        const placeholders = ids.map(() => '?').join(', ');
        const sql = `DELETE FROM reminders WHERE id IN (${placeholders})`;

        db.run(sql, ids, function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

const getRemindersToAutoArchive = () => {
    return new Promise((resolve, reject) => {
        const nowISO = formatISO(new Date());
        const sql = `
            SELECT * FROM reminders
            WHERE is_archived = 0 AND due_datetime < ? AND recurrence_rule IS NULL OR recurrence_rule = 'none'
            AND (
                alerts_sent_count > alert_repeat_additional_count OR
                (next_alert_datetime IS NULL AND alerts_sent_count > 0) OR
                (next_alert_datetime < ? AND alerts_sent_count > alert_repeat_additional_count)
            )
        `;
        db.all(sql, [nowISO, nowISO], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
};

module.exports = {
    db,
    initializeDb,
    addReminder,
    updateReminder,
    rescheduleRecurringReminder,
    archiveReminder,
    snoozeReminder,
    setRelentlessToken,
    confirmRelentlessReminder,
    escalateRelentlessPriority,
    deleteOldArchivedReminders,
    getSetting,
    setSetting,
    calculateNextAlert,
    getReminders,
    getReminderById,
    deleteReminder,
    clearAllArchivedReminders,
    getDueRemindersForAlerting,
    updateReminderAfterSendingAlert,
	bulkDeleteReminders,
    getRemindersToAutoArchive,
	getReminderByNudgeToken,
    setNudgeToken
};
