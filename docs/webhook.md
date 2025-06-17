
### Webhook Request Structure

To create a reminder, you send an HTTP `POST` request to your server's API endpoint. The request must include a specific header for authentication and a JSON body containing the reminder details.

Endpoint:

POST /api/reminders

#### **Required Header**

This header is required if `API_KEY_REQUIRED_FOR_WEBHOOK_RECEIVE` is set to `true` in your `.env` file.

<div _ngcontent-ng-c3017587935="" class="markdown markdown-main-panel tutor-markdown-rendering stronger enable-updated-hr-color" dir="ltr">
<table data-sourcepos="18:1-20:107">
<tbody>
<tr data-sourcepos="18:1-18:112">
<td><strong>Header</strong></td>
<td><strong>Description</strong></td>
<td><strong>Example Value</strong></td>
</tr>
<tr data-sourcepos="20:1-20:107">
<td align="left" data-sourcepos="20:1-20:13"><code>X-API-Key</code></td>
<td align="left" data-sourcepos="20:15-20:64">Your secret API key to authenticate the request.</td>
<td align="left" data-sourcepos="20:66-20:105"><code>e9b42s0f-c09f-4692-b9b1-060dfc349354</code></td>
</tr>
</tbody>
</table>
</div>

#### **Comprehensive JSON Body Example**

This example shows every possible field. Only `text` and `due_datetime` are strictly required. All other fields are optional and will use system defaults if not provided.


```
// This is an example of a JSON payload with every possible field explained.
{
    // The main text content of the reminder.
    "text": "Submit Monthly Expense Report",

    // The priority level, which can change notification behavior in Home Assistant.
    // 1: High, 2: Medium (Default), 3: Low
    "priority": 1,

    // The date and time the reminder is due. Must be in ISO 8601 format.
    // Examples: "2025-12-31T23:59:59Z" (UTC) or "2025-06-14T17:00:00-04:00" (with timezone offset).
    "due_datetime": "2025-06-30T17:00:00-04:00",

    // A short code or name to target notifications (e.g., 'P1', 'P2').
    // This is interpreted by your Home Assistant script.
    "recipient": "Person1",

    // How long before the 'due_datetime' the FIRST alert should be sent.
    // Format: "VALUE_UNIT". Examples: "15_minutes", "1_hours", "2_days". Default is "0_minutes".
    "alert_lead_time": "2_hours",

    // How many EXTRA times to send the alert after the first one. A value of 2 means 3 total alerts.
    // Default is 0 (meaning only one alert will be sent).
    "alert_repeat_additional_count": 1,

    // The number of minutes to wait between the repeated alerts defined above.
    "alert_repeat_interval_minutes": 30,

    // Defines the recurring schedule using the iCalendar (RFC 5545) RRULE format.
    // It's complex, so using an online generator is highly recommended: https://jakubroztocil.github.io/rrule-generator/
    //
    // --- Common RRULE Examples ---
    // "FREQ=DAILY;COUNT=5"                  -> Every day for 5 days.
    // "FREQ=WEEKLY;BYDAY=MO,FR"             -> Every Monday and Friday.
    // "FREQ=MONTHLY;BYMONTHDAY=15"          -> Every 15th of the month.
    // "FREQ=MONTHLY;BYDAY=SU;BYSETPOS=1"    -> The first Sunday of every month.
    // "FREQ=YEARLY;BYMONTH=10;BYDAY=2SU"    -> The second Sunday in October.
    // The example below means "The last weekday of every month".
    "recurrence_rule": "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",

    // Optional. An ISO Date "YYYY-MM-DD" after which the recurrence will stop.
    "recurrence_end_date": "2026-12-31",

    // Set to true to enable "Relentless Nudge" mode.
    // This will send alerts every 10 minutes until explicitly confirmed via its unique URL.
    "is_relentless": true,

    // Optional. Override the global .env URL for Home Assistant for this specific reminder.
    "notify_home_assistant_url": "http://homeassistant.local:8123/api/webhook/override-webhook-id",
    
    // Optional. Override the global .env URL for Ntfy for this specific reminder.
    "notify_ntfy_url": "https://ntfy.sh/your-work-topic",
    
    // Optional. Override the global .env URL for Gotify for this specific reminder.
    "notify_gotify_url": "https://gotify.example.com"
}

```
