const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../auth');
const { formatISO, parseISO, isValid } = require('date-fns');
const multer = require('multer');
const ical = require('node-ical');
const fs = require('fs');
const { sendHtmlResponse } = require('../utils/responseHelpers');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const alertLeadOptions = [
    { value: "0_minutes", label: "At time of event (0 minutes before)" },
    { value: "5_minutes", label: "5 minutes before" },
    { value: "15_minutes", label: "15 minutes before" },
    { value: "30_minutes", label: "30 minutes before" },
    { value: "1_hours", label: "1 hour before" },
    { value: "2_hours", label: "2 hours before" },
    { value: "1_days", label: "1 day before" }
];

const parseLeadTime = (leadTimeString) => {
    if (!leadTimeString) return { value: 0, unit: 'minutes' };
    const [val, unit] = leadTimeString.split('_');
    return { value: parseInt(val, 10), unit };
};

if (process.env.LOGIN_REQUIRED === 'true') {
    router.get('/login', (req, res) => {
        if (req.session.isAuthenticated) {
            return res.redirect('/');
        }
        res.render('login', { error: null, appName: 'My Nudgr' });
    });

    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (auth.authenticateUser(username, password)) {
            req.session.isAuthenticated = true;
            res.redirect('/');
        } else {
            res.render('login', { error: 'Invalid username or password', appName: 'My Nudgr' });
        }
    });

    router.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.error("Session destruction error:", err);
                return res.redirect('/');
            }
            res.redirect('/login');
        });
    });
}

router.get('/', auth.checkLogin, async (req, res, next) => {
    try {
        const sortBy = req.query.sort_by || 'due_datetime';
        const sortOrder = req.query.sort_order || 'ASC';

        const [activeReminders, historyReminders, currentApiKey, historyCleanupInterval] = await Promise.all([
            db.getReminders(false, sortBy, sortOrder),
            db.getReminders(true, 'due_datetime', 'DESC'),
            auth.getApiKey(),
            db.getSetting('history_cleanup_interval')
        ]);
        
        res.render('main', {
            appName: 'My Nudgr',
            reminders: activeReminders,
            history: historyReminders,
            editingReminder: null,
            currentApiKey,
            alertLeadOptions,
            historyCleanupInterval,
            env: process.env,
            queryParams: req.query,
            message: req.query.message,
            error: req.query.error,
            formatISO, parseISO, isValid,
            req: req
        });
    } catch (error) {
        console.error("Error fetching reminders for main page:", error);
        next(error);
    }
});

router.post('/add-reminder', auth.checkLogin, async (req, res) => {
    try {
        const {
            text, priority, due_datetime_local, recipient, alert_lead_time,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_end_date,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url
        } = req.body;
        
        const is_relentless = (req.body.is_relentless === '1') ? 1 : 0;

        if (!text || !due_datetime_local) {
            return res.redirect('/?error=Reminder text and due date/time are required.');
        }

        await db.addReminder({
            text,
            priority: parseInt(priority, 10) || 2,
            due_datetime: formatISO(parseISO(due_datetime_local)),
            recipient,
            alert_lead_time_value: parseLeadTime(alert_lead_time).value,
            alert_lead_time_unit: parseLeadTime(alert_lead_time).unit,
            alert_repeat_additional_count: parseInt(alert_repeat_additional_count, 10) || 0,
            alert_repeat_interval_minutes: parseInt(alert_repeat_interval_minutes, 10) || 5,
            recurrence_rule,
            recurrence_end_date: recurrence_end_date || null,
            is_relentless,
            notify_home_assistant_url,
            notify_ntfy_url,
            notify_gotify_url
        });
        res.redirect('/?message=Reminder added successfully!');
    } catch (error) {
        console.error("Error adding reminder:", error);
        res.redirect(`/?error=Failed to add reminder: ${error.message}`);
    }
});

router.get('/edit-reminder/:id', auth.checkLogin, async (req, res, next) => {
    try {
        const reminder = await db.getReminderById(req.params.id);
        if (!reminder) {
            return res.redirect('/?error=Reminder not found.');
        }

        const [activeReminders, historyReminders, currentApiKey, historyCleanupInterval] = await Promise.all([
             db.getReminders(false),
             db.getReminders(true),
             auth.getApiKey(),
             db.getSetting('history_cleanup_interval')
        ]);
       
        res.render('main', {
            appName: 'My Nudgr',
            reminders: activeReminders,
            history: historyReminders,
            editingReminder: reminder,
            currentApiKey,
            alertLeadOptions,
            historyCleanupInterval,
            env: process.env,
            queryParams: {},
            message: null, error: null,
            formatISO, parseISO, isValid,
            req: req
        });
    } catch (error) {
        console.error("Error fetching reminder for edit:", error);
        next(error);
    }
});

router.post('/update-reminder/:id', auth.checkLogin, async (req, res) => {
    try {
        const id = req.params.id;
        const {
            text, priority, due_datetime_local, recipient, alert_lead_time,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_end_date,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url
        } = req.body;

        const is_relentless = (req.body.is_relentless === '1') ? 1 : 0;

        if (!text || !due_datetime_local) {
            return res.redirect(`/edit-reminder/${id}?error=Reminder text and due date/time are required.`);
        }

        await db.updateReminder(id, {
            text,
            priority: parseInt(priority, 10) || 2,
            due_datetime: formatISO(parseISO(due_datetime_local)),
            recipient,
            alert_lead_time_value: parseLeadTime(alert_lead_time).value,
            alert_lead_time_unit: parseLeadTime(alert_lead_time).unit,
            alert_repeat_additional_count: parseInt(alert_repeat_additional_count, 10) || 0,
            alert_repeat_interval_minutes: parseInt(alert_repeat_interval_minutes, 10) || 5,
            recurrence_rule,
            recurrence_end_date: recurrence_end_date || null,
            is_relentless,
            notify_home_assistant_url,
            notify_ntfy_url,
            notify_gotify_url
        });
        res.redirect('/?message=Reminder updated successfully!');
    } catch (error) {
        console.error("Error updating reminder:", error);
        res.redirect(`/edit-reminder/${req.params.id}?error=Failed to update reminder: ${error.message}`);
    }
});

router.post('/save-settings', auth.checkLogin, async (req, res) => {
    try {
        const { history_cleanup_interval } = req.body;
        await db.setSetting('history_cleanup_interval', history_cleanup_interval);
        res.redirect('/?message=Settings saved successfully!');
    } catch (error) {
        console.error("Error saving settings:", error);
        res.redirect(`/?error=Failed to save settings: ${error.message}`);
    }
});


router.post('/delete-reminder/:id', auth.checkLogin, async (req, res) => {
    try {
        const id = req.params.id;
        const reminder = await db.getReminderById(id);
        if (!reminder) return res.redirect('/?error=Reminder not found to delete.');

        if (reminder.is_archived) {
            await db.deleteReminder(id);
        } else {
            await db.deleteReminder(id);
        }
        res.redirect('/?message=Reminder deleted successfully!');
    } catch (error) {
        console.error("Error deleting reminder:", error);
        res.redirect(`/?error=Failed to delete reminder: ${error.message}`);
    }
});

router.post('/reminders/bulk-delete', auth.checkLogin, async (req, res) => {
    let { reminderIds } = req.body;

    if (!reminderIds) {
        return res.redirect(req.get('Referrer') || '/');
    }

    if (!Array.isArray(reminderIds)) {
        reminderIds = [reminderIds];
    }

    try {
        const uniqueReminderIds = [...new Set(reminderIds)];
        const idsAsNumbers = uniqueReminderIds.map(id => parseInt(id, 10));
        
		const bDeleteCount = await db.bulkDeleteReminders(idsAsNumbers);
		
        if (bDeleteCount > 0) {
			res.redirect(`${req.get('Referrer') || '/'}?message=${bDeleteCount} reminder(s) deleted successfully.`);
		} else {
            res.redirect(`${req.get('Referrer') || '/'}?info=No reminders were selected or found to deleted.`);
        }
		
    } catch (error) {
        console.error('Error during bulk delete:', error);
        res.redirect(`${req.get('Referrer') || '/'}?error=Failed to delete reminders: ${error.message}`);
    }
});

router.post('/reminders/bulk-archive', auth.checkLogin, async (req, res) => {
    let { reminderIds } = req.body;

    if (!reminderIds) {
        return res.redirect(req.get('Referrer') || '/');
    }

    if (!Array.isArray(reminderIds)) {
        reminderIds = [reminderIds];
    }

    try {
        const uniqueReminderIds = [...new Set(reminderIds)];
        const idsAsNumbers = uniqueReminderIds.map(id => parseInt(id, 10));
        
        const archivedCount = await db.bulkArchiveReminders(idsAsNumbers); 

        if (archivedCount > 0) {
            res.redirect(`${req.get('Referrer') || '/'}?message=${archivedCount} reminder(s) archived successfully.`);
        } else {
            res.redirect(`${req.get('Referrer') || '/'}?info=No active reminders were selected or found to archive.`);
        }
        
    } catch (error) {
        console.error('Error during bulk archiving:', error);
        res.redirect(`${req.get('Referrer') || '/'}?error=Failed to archive reminders: ${error.message}`);
    }
});

router.post('/archive-reminder/:id', auth.checkLogin, async (req, res) => {
    try {
        await db.archiveReminder(req.params.id, true);
        res.redirect('/?message=Reminder archived!');
    } catch (error) {
        console.error("Error archiving reminder:", error);
        res.redirect(`/?error=Failed to archive reminder: ${error.message}`);
    }
});

router.post('/unarchive-reminder/:id', auth.checkLogin, async (req, res) => {
    try {
        const reminder = await db.getReminderById(req.params.id);
        if (!reminder) return res.redirect('/?error=Reminder not found.');

        await db.archiveReminder(req.params.id, false);

        const nextAlert = db.calculateNextAlert({
            ...reminder,
        });

        if (nextAlert && reminder.alerts_sent_count <= reminder.alert_repeat_additional_count) {
             await db.updateReminderAfterSendingAlert(req.params.id, nextAlert, reminder.alerts_sent_count);
        } else if (reminder.alerts_sent_count > reminder.alert_repeat_additional_count) {
            await db.updateReminderAfterSendingAlert(req.params.id, null, reminder.alerts_sent_count);
        }

        res.redirect('/?message=Reminder unarchived and reactivated (if applicable).');
    } catch (error) {
        console.error("Error unarchiving reminder:", error);
        res.redirect(`/?error=Failed to unarchive reminder: ${error.message}`);
    }
});


router.post('/clear-all-history', auth.checkLogin, async (req, res) => {
    try {
        await db.clearAllArchivedReminders();
        res.redirect('/?message=All history reminders cleared!');
    } catch (error) {
        console.error("Error clearing history:", error);
        res.redirect(`/?error=Failed to clear history: ${error.message}`);
    }
});

router.post('/generate-api-key', auth.checkLogin, (req, res) => {
    const newKey = auth.regenerateApiKey();
    res.redirect(`/?message=New API Key Generated: ${newKey}`);
});

router.post('/import-ics', upload.single('icsfile'), async (req, res) => {
    if (!req.file) {
        return sendHtmlResponse(
            res,
            400,
            'Import Error',
            'error',
            'File Upload Failed',
            'No file was uploaded. Please select an ICS file to import.'
        );
    }

    try {
        const events = ical.parseICS(req.file.buffer.toString());
        let importCount = 0;

        for (const key in events) {
            if (events.hasOwnProperty(key)) {
                const event = events[key];
                if (event.type === 'VEVENT') {
                    const icsSummary = event.summary && typeof event.summary === 'string'
                                             ? event.summary.trim()
                                             : '';
                    let icsDescription = event.description && typeof event.description === 'string'
                                                  ? event.description.replace(/\\n/g, '\n').trim()
                                                  : '';
                    
                    let extractedRecipient = null;
                    let extractedIsRelentless = false;
                    let primaryDescriptionText = icsDescription;

                    const recipientMatch = primaryDescriptionText.match(/Recipient:\s*([^\n\r]+)/i);
                    if (recipientMatch && recipientMatch[1]) {
                        extractedRecipient = recipientMatch[1].trim();
                        primaryDescriptionText = primaryDescriptionText.replace(recipientMatch[0], '').trim();
                    }

                    if (primaryDescriptionText.match(/Mode:\s*Relentless/i)) {
                        extractedIsRelentless = true;
                        primaryDescriptionText = primaryDescriptionText.replace(/Mode:\s*Relentless/i, '').trim();
                    }

                    primaryDescriptionText = primaryDescriptionText.replace(/[\r\n]{2,}/g, '\n').trim();

                    let reminderText = '';
                    if (icsSummary && primaryDescriptionText) {
                        reminderText = `${icsSummary}: ${primaryDescriptionText}`;
                    } else if (icsSummary) {
                        reminderText = icsSummary;
                    } else if (primaryDescriptionText) {
                        reminderText = primaryDescriptionText;
                    } else {
                        reminderText = 'ICS Event Imported - No Title or Description Provided. Please edit.';
                    }
                    
                    let recurrenceRule = null;
                    if (event.rrule) {
                        const rruleString = event.rrule.toString();
                        const rruleMatch = rruleString.match(/RRULE:(.*)/);
                        if (rruleMatch && rruleMatch[1]) {
                            recurrenceRule = rruleMatch[1].trim();
                        } else {
                            recurrenceRule = rruleString.trim();
                        }
                    }

                    const reminderData = {
                        text: reminderText,
                        due_datetime: event.start ? event.start.toISOString() : new Date().toISOString(),
                        priority: mapIcsPriorityToDb(event.priority),
                        recipient: extractedRecipient,
                        recurrence_rule: recurrenceRule,
                        recurrence_dtstart: event.start ? event.start.toISOString() : null,
                        recurrence_end_date: event.rrule && event.rrule.options.until ? event.rrule.options.until.toISOString() : null,
                        is_relentless: extractedIsRelentless ? 1 : 0,
                    };
                    
                    await db.addReminder(reminderData);
                    importCount++;
                }
            }
        }
        console.log(`Successfully imported ${importCount} reminders.`);

        if (importCount > 0) {
            res.redirect(`/?message=Successfully imported ${importCount} reminders!`);
        } else {
            sendHtmlResponse(
                res,
                200,
                'Import Info',
                'info',
                'No Reminders Found',
                'The uploaded ICS file did not contain any valid events to import.'
            );
        }

    } catch (error) {
        console.error('Error importing ICS file:', error);
        sendHtmlResponse(
            res,
            500,
            'Import Error',
            'error',
            'ICS Import Failed',
            `Failed to import reminders from file: ${error.message}`
        );
    }
});

function extractRecipientName(attendee) {
    if (!attendee) {
        return null;
    }

    if (typeof attendee === 'object' && attendee.params && attendee.params.CN) {
        return attendee.params.CN.trim();
    }

    if (typeof attendee === 'string') {
        const cnMatch = attendee.match(/CN=([^;:,]*)/i);
        if (cnMatch && cnMatch[1]) {
            return decodeURIComponent(cnMatch[1]).trim();
        }
    }

    return null;
}

function mapIcsPriorityToDb(icsPriority) {
    if (icsPriority === undefined || icsPriority === null) {
        return 2;
    }
    if (icsPriority <= 4) {
        return 1;
    } else if (icsPriority === 5) {
        return 2;
    } else if (icsPriority >= 6) {
        return 3;
    }
    return 2;
}


module.exports = router;
