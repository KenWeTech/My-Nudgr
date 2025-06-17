const express = require('express');
const router = express.Router();
const db = require('../database');
const auth = require('../auth');
const { formatISO, parseISO, addMinutes } = require('date-fns');
const { createEvents } = require('ics');
const { RRule, RRuleSet, rrulestr } = require('rrule');
const { sendHtmlResponse } = require('../utils/responseHelpers');

const parseLeadTime = (leadTimeString) => {
    if (!leadTimeString) return { value: 0, unit: 'minutes' };
    const [val, unit] = leadTimeString.split('_');
    return { value: parseInt(val, 10), unit };
};

const toICSFormat = (date) => {
    return date.getUTCFullYear() +
        ('0' + (date.getUTCMonth() + 1)).slice(-2) +
        ('0' + date.getUTCDate()).slice(-2) + 'T' +
        ('0' + date.getUTCHours()).slice(-2) +
        ('0' + date.getUTCMinutes()).slice(-2) +
        ('0' + date.getUTCSeconds()).slice(-2) + 'Z';
};

router.post('/reminders', auth.verifyApiKey, async (req, res) => {
    try {
        const {
            text, priority, due_datetime, recipient, alert_lead_time,
            alert_repeat_additional_count, alert_repeat_interval_minutes,
            recurrence_rule, recurrence_end_date, is_relentless,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url,
        } = req.body;

        if (!text || !due_datetime) {
            return res.status(400).json({ error: 'Missing required fields: text and due_datetime' });
        }
        
        await db.addReminder({
            text,
            priority: parseInt(priority, 10) || 3,
            due_datetime,
            recipient,
            alert_lead_time_value: parseLeadTime(alert_lead_time).value,
            alert_lead_time_unit: parseLeadTime(alert_lead_time).unit,
            alert_repeat_additional_count: parseInt(alert_repeat_additional_count, 10) || 0,
            alert_repeat_interval_minutes: parseInt(alert_repeat_interval_minutes, 10) || 5,
            recurrence_rule,
            recurrence_end_date: recurrence_end_date || null,
            is_relentless: is_relentless ? 1 : 0,
            notify_home_assistant_url, notify_ntfy_url, notify_gotify_url,
            api_key_identifier: req.headers['x-api-key'] ? 'KeyUsed' : 'NoKey'
        });
        res.status(201).json({ message: 'Reminder added successfully' });
    } catch (error) {
        console.error('API Error adding reminder:', error);
        sendHtmlResponse(
            res,
            500,
            'API Error',
            'error',
            'API Error',
            `Failed to add reminder: ${error.message}`,
            false
        );
    }
});

router.get('/reminders', auth.verifyApiKey, async (req, res) => {
    try {
        const showArchived = req.query.archived === 'true';
        const sortBy = req.query.sort_by || 'due_datetime';
        const sortOrder = req.query.sort_order || 'ASC';
        const reminders = await db.getReminders(showArchived, sortBy, sortOrder);
        res.json(reminders);
    } catch (error) {
        console.error('API Error fetching reminders:', error);
        sendHtmlResponse(
            res,
            500,
            'API Error',
            'error',
            'API Error',
            'Failed to fetch reminders.',
            false
        );
    }
});

router.get('/reminders/:id', auth.verifyApiKey, async (req, res) => {
    try {
        const reminder = await db.getReminderById(req.params.id);
        if (reminder) {
            res.json(reminder);
        } else {
            sendHtmlResponse(
                res,
                404,
                'Reminder Not Found',
                'error',
                'Reminder Not Found',
                'The requested reminder could not be found.',
                false
            );
        }
    } catch (error) {
        console.error(`API Error fetching reminder ${req.params.id}:`, error);
        sendHtmlResponse(
            res,
            500,
            'Server Error',
            'error',
            'Server Error',
            `Failed to fetch reminder: ${error.message}`,
            false
        );
    }
});


router.get('/reminders/:token/nudge', async (req, res) => {
    try {
        const reminder = await db.getReminderByNudgeToken(req.params.token);
        
        if (!reminder) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Invalid or Expired Action</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body class="auto-close-page">
                    <div class="container">
                        <h1 class="error">Invalid or Expired Action</h1>
                        <p class="message">This nudge link may have already been used or the reminder was updated.</p>
                        <p class="footer-note">This window will attempt to close shortly. You can close it manually.</p>
                    </div>
                    <script src="/js/auto-close.js"></script>
                </body>
                </html>
            `);
        }
      
        if (reminder.snooze_count > 0) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Action Already Taken</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body class="auto-close-page">
                    <div class="container">
                        <h1 class="error">Action Already Taken</h1>
                        <p class="message">This reminder has already been nudged.</p>
                        <p class="footer-note">This window will attempt to close shortly. You can close it manually.</p>
                    </div>
                    <script src="/js/auto-close.js"></script>
                </body>
                </html>
            `);
        }

        const baseDueDate = (reminder.due_datetime && typeof reminder.due_datetime === 'string')
            ? parseISO(reminder.due_datetime)
            : new Date();

        const baseNextAlert = (reminder.next_alert_datetime && typeof reminder.next_alert_datetime === 'string')
            ? parseISO(reminder.next_alert_datetime)
            : new Date();
            
        const newDueDate = addMinutes(baseDueDate, 15);
        const newNextAlert = addMinutes(baseNextAlert, 15);

        await db.snoozeReminder(reminder.id, formatISO(newDueDate), formatISO(newNextAlert));
        
        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Nudge Again Later!</title>
                <link rel="stylesheet" href="/css/style.css">
            </head>
            <body class="auto-close-page">
                <div class="container">
                    <h1>Reminder Rescheduled!</h1>
                    <p class="message">The reminder has been rescheduled for 15 minutes from now (or its last active time). This window will close automatically.</p>
                    <p class="footer-note">You can close this window manually if it doesn't close automatically.</p>
                </div>
                <script src="/js/auto-close.js"></script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error(`Error nudging with token ${req.params.token}:`, error);
        sendHtmlResponse(
            res,
            500,
            'Server Error',
            'error',
            'Server Error',
            'Could not process your request.'
        );
    }
});

router.get('/reminders/:token/confirm', async (req, res) => {
    try {
        const changes = await db.confirmRelentlessReminder(req.params.token);
        
        if (changes > 0) {
            res.setHeader('Content-Type', 'text/html');
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>End Relentless Nudge!</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body class="auto-close-page">
                    <div class="container">
                        <h1>Reminder Confirmed!</h1>
                        <p class="message">The relentless nudge has been stopped. This window will close automatically.</p>
                        <p class="footer-note">You can close this window manually if it doesn't close automatically.</p>
                    </div>
                    <script src="/js/auto-close.js"></script>
                </body>
                </html>
            `);
        } else {
            res.status(404).setHeader('Content-Type', 'text/html');
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Invalid or Expired Confirmation</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body class="auto-close-page">
                    <div class="container">
                        <h1 class="error">Invalid or Expired Confirmation</h1>
                        <p class="message">This reminder may have already been confirmed or archived.</p>
                        <p class="footer-note">This window will attempt to close shortly. You can close it manually.</p>
                    </div>
                    <script src="/js/auto-close.js"></script>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error(`Error confirming token ${req.params.token}:`, error);
        sendHtmlResponse(
            res,
            500,
            'Server Error',
            'error',
            'Server Error',
            'Could not process confirmation.'
        );
    }
});

router.get('/reminders.ics', async (req, res) => {
    try {
        const reminders = await db.getReminders(false);
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

        let icsString = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//My Nudgr//NONSGML v1.0//EN',
            'CALSCALE:GREGORIAN'
        ].join('\r\n') + '\r\n';

        reminders.forEach(r => {
            const startDate = parseISO(r.due_datetime);
            const endDate = new Date(startDate.getTime() + (60 * 60 * 1000));
            const createdDate = r.created_at ? parseISO(r.created_at) : new Date();

            let icsPriority;
            switch (r.priority) {
                case 1: icsPriority = 1; break;
                case 2: icsPriority = 5; break;
                case 3: icsPriority = 9; break;
                default: icsPriority = 5;
            }

            let descriptionParts = [];
            if (r.recipient) {
                descriptionParts.push(`Recipient: ${r.recipient}`);
            }
            if (r.is_relentless) {
                descriptionParts.push('Mode: Relentless');
            }
            const icsDescriptionContent = descriptionParts.join('\\n')
                .replace(/,/g, '\\,')
                .replace(/;/g, '\\;')
                .replace(/\n/g, '\\n');

            const event = [
                'BEGIN:VEVENT',
                `UID:${r.id}@${baseUrl.replace(/https?:\/\//, '')}`,
                `DTSTAMP:${toICSFormat(createdDate)}`,
                `DTSTART:${toICSFormat(startDate)}`,
                `DTEND:${toICSFormat(endDate)}`,
                `SUMMARY:${r.text.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')}`,
                `DESCRIPTION:${icsDescriptionContent}`,
            ];

            event.push(`PRIORITY:${icsPriority}`);

            if (r.recurrence_rule && r.recurrence_rule.trim() !== '' && r.recurrence_rule.toLowerCase() !== 'none') {
                const dtstartString = r.recurrence_dtstart
                    ? `DTSTART:${toICSFormat(parseISO(r.recurrence_dtstart))}`
                    : `DTSTART:${toICSFormat(startDate)}`;

                const dtstartIndex = event.findIndex(line => line.startsWith('DTSTART:'));
                if (dtstartIndex > -1) {
                    event[dtstartIndex] = dtstartString;
                } else {
                    event.push(dtstartString);
                }
                
                const cleanedRecurrenceRule = r.recurrence_rule.replace(/\u00A0/g, ' ').trim();
                event.push(`RRULE:${cleanedRecurrenceRule}`);
            }

            event.push('END:VEVENT');
            icsString += event.join('\r\n') + '\r\n';
        });

        icsString += 'END:VCALENDAR';

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="my-nudgr-reminders.ics"');
        res.send(icsString);

    } catch (error) {
        console.error('Error generating ICS file:', error);
        sendHtmlResponse(
            res,
            500,
            'ICS Error',
            'error',
            'ICS Generation Failed',
            'Could not generate ICS file.'
        );
    }
});

module.exports = router;