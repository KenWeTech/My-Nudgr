const cron = require('node-cron');
const axios = require('axios');
const { formatISO, parseISO, isPast, addMinutes, subMonths, subYears } = require('date-fns');
const { RRule } = require('rrule');
const db = require('./database');

const sendWebhook = async (url, payload, serviceName) => {
    if (!url) return;
    try {
        await axios.post(url, payload, { timeout: 10000 });
        console.log(`Webhook sent to ${serviceName} for reminder: "${payload.text}"`);
    } catch (error) {
        console.error(`Error sending ${serviceName} webhook to ${url}:`, error.message);
    }
};

const handleReminderCompletion = async (reminder) => {
    const { id, recurrence_rule, due_datetime, recurrence_dtstart, recurrence_end_date } = reminder;
    if (!recurrence_rule || recurrence_rule === 'none') {
        console.log(`Archiving non-recurring reminder ID: ${id}`);
        await db.archiveReminder(id, true);
        return;
    }
    try {
        const ruleOptions = RRule.parseString(recurrence_rule);
        ruleOptions.dtstart = parseISO(recurrence_dtstart);
        if (recurrence_end_date) ruleOptions.until = parseISO(recurrence_end_date);
        
        const rule = new RRule(ruleOptions);
        const nextDueDate = rule.after(parseISO(due_datetime), false);

        if (nextDueDate) {
            const nextDueDateISO = formatISO(nextDueDate);
            const newNextAlertDatetime = db.calculateNextAlert({ ...reminder, due_datetime: nextDueDateISO });
            console.log(`Rescheduling reminder ID: ${id} for its next occurrence on ${nextDueDateISO}`);
            await db.rescheduleRecurringReminder(id, nextDueDateISO, newNextAlertDatetime);
        } else {
            console.log(`Archiving recurring reminder ID: ${id}. Its series has ended.`);
            await db.archiveReminder(id, true);
        }
    } catch (error) {
        console.error(`Error processing recurrence for reminder ID ${id}:`, error.message);
        await db.archiveReminder(id, true);
    }
};

const processReminderAlert = async (reminder) => {
    console.log(`Processing alert for reminder ID: ${reminder.id} - "${reminder.text}"`);
    let tokenForThisRun = reminder.relentless_confirm_token;
    let nudgeTokenForThisRun = reminder.nudge_token;

    if (reminder.is_relentless) {
        if (tokenForThisRun && reminder.priority > 1 && reminder.alerts_sent_count >= 2) {
            await db.escalateRelentlessPriority(reminder.id);
            reminder.priority = 1;
        }
        if (!tokenForThisRun) {
            tokenForThisRun = await db.setRelentlessToken(reminder.id);
        }
    }

    if (reminder.snooze_count === 0 && !nudgeTokenForThisRun) {
        nudgeTokenForThisRun = await db.setNudgeToken(reminder.id);
    }

    const confirmationUrl = reminder.is_relentless ? `${process.env.BASE_URL}/api/reminders/${tokenForThisRun}/confirm` : null;
    const nudgeUrl = reminder.snooze_count === 0 ? `${process.env.BASE_URL}/api/reminders/${nudgeTokenForThisRun}/nudge` : null;

    const payload = {
        id: reminder.id, text: reminder.text, priority: reminder.priority,
        due_datetime: reminder.due_datetime, recipient: reminder.recipient,
        is_relentless: reminder.is_relentless,
        actions: { nudge: nudgeUrl, confirm: confirmationUrl }
    };
    
    await sendWebhook(reminder.notify_home_assistant_url || process.env.HOME_ASSISTANT_WEBHOOK_URL, payload, 'Home Assistant');
    
    const newAlertsSentCount = reminder.alerts_sent_count + 1;

    if (reminder.is_relentless) {
        const nextRelentlessAlert = formatISO(addMinutes(new Date(), 10));
        await db.updateReminderAfterSendingAlert(reminder.id, nextRelentlessAlert, newAlertsSentCount);
        return;
    }
    
    const totalAlertsRequired = (reminder.alert_repeat_additional_count || 0) + 1;
    if (newAlertsSentCount >= totalAlertsRequired) {
        await handleReminderCompletion(reminder);
    } else {
        const newNextAlertDatetime = formatISO(addMinutes(parseISO(reminder.next_alert_datetime), reminder.alert_repeat_interval_minutes));
        await db.updateReminderAfterSendingAlert(reminder.id, newNextAlertDatetime, newAlertsSentCount);
    }
};

const checkAndSendReminders = async () => {
    try {
        const dueReminders = await db.getDueRemindersForAlerting();
        for (const reminder of dueReminders) {
            if (reminder.is_relentless && reminder.relentless_confirm_token === null && reminder.alerts_sent_count > 0) {
                await handleReminderCompletion(reminder);
            } else {
                await processReminderAlert(reminder);
            }
        }
    } catch (error) {
        console.error('Scheduler: Error checking/sending reminders:', error);
    }
};

const autoArchiveOldReminders = async () => {
    try {
        const remindersToArchive = await db.getRemindersToAutoArchive();
        if (remindersToArchive.length > 0) {
            console.log(`Scheduler: Found ${remindersToArchive.length} finished reminders to auto-archive.`);
            for (const reminder of remindersToArchive) {
                console.log(`Auto-archiving reminder ID: ${reminder.id} ("${reminder.text}")`);
                await db.archiveReminder(reminder.id, true);
            }
        }
    } catch (error) {
        console.error('Scheduler: Error auto-archiving reminders:', error);
    }
};

const cleanupOldHistory = async () => {
    try {
        const intervalSetting = await db.getSetting('history_cleanup_interval');
        const interval = intervalSetting || process.env.HISTORY_CLEANUP_INTERVAL || '6m';
        if (interval === 'off') return;

        const now = new Date();
        const num = parseInt(interval.slice(0, -1));
        const unit = interval.slice(-1);
        let threshold;

        if (isNaN(num)) return;

        if (unit === 'm') threshold = subMonths(now, num);
        else if (unit === 'y') threshold = subYears(now, num);
        else return;

        const deletedCount = await db.deleteOldArchivedReminders(formatISO(threshold));
        if (deletedCount > 0) {
            console.log(`Successfully deleted ${deletedCount} archived reminders older than ${interval}.`);
        }
    } catch (error) {
        console.error('Scheduler: Error cleaning up old history:', error);
    }
};

const startScheduler = () => {
    console.log('Scheduler starting...');
    
    cron.schedule('* * * * *', checkAndSendReminders);
    console.log('Reminder checking job scheduled to run every minute.');

    cron.schedule('0 * * * *', autoArchiveOldReminders);
    console.log('Auto-archiving job scheduled to run every hour.');

    cron.schedule('0 3 * * *', cleanupOldHistory);
    console.log('Automated history cleanup job scheduled to run daily at 3:00 AM.');

    setTimeout(() => {
        console.log('Performing initial checks on startup...');
        checkAndSendReminders();
        autoArchiveOldReminders();
    }, 5000); // 5 seconds delay
};

module.exports = { startScheduler };