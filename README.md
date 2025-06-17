<p align="center">
  <img src="https://github.com/KenWeTech/My-Nudgr/blob/main/My-Nudgr/public/assets/logo.png?raw=true" alt="My Nudgr Logo" width="200"/>
</p>

# My Nudgr

My Nudgr is a self-hosted, webhook-driven reminder and notification service designed to integrate seamlessly with home automation platforms like Home Assistant. It provides a simple web interface to manage reminders and a powerful backend to process them, sending alerts based on priority and user-defined schedules.

## Core Features

-   **Web-Based UI**: A clean interface to manually add, edit, view, and archive reminders.
-   **Webhook Integration**: Add reminders from anywhere using a simple JSON payload, perfect for services like iOS Shortcuts, IFTTT, or custom scripts.
-   **Priority Levels**: Assign High, Medium, or Low priority to reminders, triggering different notification behaviors.
-   **Advanced Scheduling**:
    -   Set reminders with precise due dates and times.
    -   Configure alerts to fire a specific lead time before the due date (e.g., 15 minutes before).
    -   Set reminders to repeat alerts multiple times.
-   **Recurring Reminders**: Create reminders that repeat daily, weekly, monthly, etc., using the standard iCalendar (RFC 5545) RRULE format.
-   **"Relentless Nudge" Mode**: For critical reminders, enable a relentless mode that sends repeated notifications every 10 minutes until explicitly confirmed via a unique link.
-   **Actionable Notifications**: Works with Home Assistant to send notifications with secure, token-based "Nudge Me Again Later" and "Confirm" buttons.
-   **Flexible Notifications**: Can be configured to send alerts to multiple notification services simultaneously (e.g., Home Assistant, Ntfy, Gotify).
-   **Data Export**: Download all active reminders to a standard `.ics` calendar file directly from the UI.
-   **Secure**: Optional login and API key protection for all endpoints.

## Setup & Configuration

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/kenwetech/my-nudgr.git](https://github.com/kenwetech/my-nudgr.git)
    cd my-nudgr/my-nudgr
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure the environment:**
    Create a `.env` file in the root of the project. You can copy `example.env` to get started.

    ```bash
    cp example.env .env
    ```

    Edit the `.env` file with your desired settings. Key variables include:

    -   `PORT_HTTP`: The port for the HTTP server (e.g., `6000`).
    -   `PORT_HTTPS`: The port for the optional HTTPS server (e.g., `6443`).
    -   `ENABLE_HTTPS`: Set to `true` to enable HTTPS. Requires SSL certificates in the `/ssl` directory.
    -   `REVERSE_PROXY_ENABLED`: Set to `true` if your app is running behind a reverse proxy like Nginx or Traefik, or if you're using HTTPS. This helps the app correctly identify the original protocol (HTTP/HTTPS) and client IP. Enabling this **will break direct HTTP access** if not behind a proxy.
    -   `BASE_URL`: **Crucial for notification actions.** This must be the full, public-facing URL of your server (e.g., `http://192.168.0.55:6000`).
    -   `LOGIN_REQUIRED`: Set to `true` to enable a username/password login for the web UI.
    -   `ADMIN_USERNAME`: The username for the web UI login.
    -   `ADMIN_PASSWORD_HASH`: A bcrypt hash of your desired password. You can generate a secure hash using a tool like [bcrypt-generator.com](https://bcrypt-generator.com/) (ensure you trust the site) or use a local tool like the Python script provided in the `extra` folder.
        -   **Important Note for Docker Compose / Dockge users**: If you encounter "variable not set" warnings or issues with the `$` characters in your hash, you must use **double dollar signs (`$$`)** for each literal dollar sign in the hash within your `.env` file (e.g., `$$2a$$12$$yourhash...`).
	-   `API_KEY_REQUIRED_FOR_WEBHOOK_RECEIVE`: Set to `true` to require an API key for creating reminders via webhook.
    -   `GENERATED_API_KEY`: The secret API key.
    -   `DB_PATH`: The file path for the SQLite database (e.g., `./data/reminders.db`).
    -   `SESSION_SECRET`: A long, random string for securing user sessions.
    -   `HOME_ASSISTANT_WEBHOOK_URL`: Your global webhook URL for sending notifications to Home Assistant.
    -   `NTFY_TOPIC_URL`: Your global URL for a Ntfy topic.
    -   `GOTIFY_URL`: Your global base URL for a Gotify server.
    -   `GOTIFY_TOKEN`: The application token for Gotify.
    -   `HISTORY_CLEANUP_INTERVAL`: Sets the automatic deletion period for archived reminders (e.g., `6m`, `1y`, `off`).

4.  **Run the application:**
    ```bash
    node server.js
    ```

## Quick Deployment with Docker Compose

If you prefer to deploy My Nudgr using a Docker image, simply grab the necessary configuration files and use Docker Compose.

1.  Obtain Configuration Files:
    
    You'll need docker-compose.yml from the my-nudgr/extra directory and example.env from the my-nudgr/my-nudgr directory of this repository. Create a new, empty folder on your system, navigate into it, and then download the files there.
    
    For example, using `curl` (adjust URLs if your main branch isn't `main`):
    
    
    ```bash
    mkdir my-nudgr-deploy
    cd my-nudgr-deploy
    curl -o docker-compose.yml https://raw.githubusercontent.com/kenwetech/my-nudgr/main/my-nudgr/extra/docker-compose.yml
    curl -o example.env https://raw.githubusercontent.com/kenwetech/my-nudgr/main/my-nudgr/my-nudgr/example.env
    
    ```
    
2.  Prepare Your Environment File:
    
    Copy example.env to .env in the same directory:
    
    
    ```bash
    cp example.env .env
    
    ```
    
    Now, **edit the newly created `.env` file**. Fill in all required variables, such as `PORT_HTTP`, `PORT_HTTPS`, `ENABLE_HTTPS`, and your crucial `BASE_URL`.
    
    Important for ADMIN_PASSWORD_HASH:
    
    If your bcrypt password hash contains literal dollar signs ($), you must escape them with a second dollar sign ($$) in your .env file. Docker Compose interprets single $ as variable interpolation, which will break your hash.
    
    For example, if your hash is `$2a$12$ABC...`, it should appear in your `.env` like this:
    
    ```
    ADMIN_PASSWORD_HASH=$$2a$$12$$ABC...
    
    ```
    
3.  **Prepare Data and SSL Directories (if applicable):**
    
    -   **For Database Persistence:** My Nudgr uses SQLite, which stores its data in a file. To ensure your data persists even if the Docker container is removed or updated, create a `data` directory in your current deployment folder:
        
        
        ```bash
        mkdir data
        
        ```
        
        The `docker-compose.yml` will map this host directory to the container's `/app/data` directory, where the database file (`reminders.db`) will reside.
        
    -   **For HTTPS (Optional):** If `ENABLE_HTTPS` is set to `true` in your `.env` file, you'll need to provide your SSL certificate and key files. Create an `ssl` directory in your current deployment folder and place your `cert.pem` and `key.pem` files inside it:
        
        
        ```bash
        mkdir ssl
        # Copy your cert.pem and key.pem files into the newly created 'ssl' directory
        
        ```
        
        The `docker-compose.yml` will map this host `ssl` directory to the container's `/app/ssl` directory.
        
4.  Deploy with Docker Compose:
    
    From the directory containing your docker-compose.yml, .env, data, and (optionally) ssl folders, run:
    
    
    ```bash
    docker compose up -d
    
    ```
    
    This command will pull the `my-nudgr` Docker image from its registry, start the My Nudgr service, apply your environment variables from `.env`, and mount the specified data and SSL directories.
    
5.  Access the Application:
    
    Once the container is running, open your web browser to:
    
    -   **HTTP:** `http://localhost:6000` (or your `PORT_HTTP`)
    -   **HTTPS:** `https://localhost:6443` (or your `PORT_HTTPS`, if enabled. You might see a browser security warning for the self-signed certificate if using self-signed certs.)

## Home Assistant Integration

The recommended way to integrate with Home Assistant is by using Blueprints. This makes setup simple and allows for easy configuration through the HA user interface. You will use two blueprints: one for the webhook automation and one for the notification script.

### 1. Home Assistant Webhook Automation Blueprint

This blueprint creates an automation that listens for incoming webhooks from My Nudgr. It will provide you with the unique URL to paste into your `.env` file.

To use this blueprint, simply click the button below to import it directly into your Home Assistant instance:

[![Open your Home Assistant instance and show the blueprint import dialog with a pre-filled URL.](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https://raw.githubusercontent.com/kenwetech/my-nudgr/main/ha/my-nudgr-automation-blueprint.yaml)

**Steps after import:**
1.  In Home Assistant, navigate to **Settings > Automations & Scenes > Blueprints**.
2.  Click **Import Blueprint** and paste in the URL of this file from your GitHub repository (or use the button above).
3.  Click **Create Automation** from the imported blueprint. It will generate a unique webhook ID for you.
4.  Copy the full webhook URL and paste it into the `HOME_ASSISTANT_WEBHOOK_URL` variable in your `.env` file.

### 2. Home Assistant Notification Script Blueprint

This blueprint creates the script that takes the reminder data and sends out notifications and TTS announcements based on priority and recipient.

To use this blueprint, click the button below to import it into your Home Assistant instance:

[![Open your Home Assistant instance and show the blueprint import dialog with a pre-filled URL.](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https://raw.githubusercontent.com/kenwetech/my-nudgr/main/ha/my-nudgr-script-blueprint.yaml)

**Steps after import:**
1.  Import the blueprint from its GitHub URL just like the automation above (or use the button).
2.  Click **Create Script**.
3.  Configure the inputs, selecting the notification services for each person and your TTS entity.

#### Important Note on Critical Alerts:
Home Assistant's "Critical Alert" functionality for high-priority notifications, which can bypass Do Not Disturb and sound even on silent, is currently **exclusive to iOS devices**. Android devices do not support this feature via standard Home Assistant companion app notifications.


## Usage

Once running, you can access the web interface at the IP and port you configured.

To add reminders via webhook, send a `POST` request to `/api/reminders`.

**Required Header:**
`X-API-Key: YOUR_GENERATED_API_KEY`

**Example JSON Body:**
```json
{
    "text": "Submit Monthly Expense Report",
    "priority": 1,
    "due_datetime": "2025-06-30T17:00:00-04:00",
    "recipient": "Person1",
    "alert_lead_time": "2_hours",
    "alert_repeat_additional_count": 1,
    "alert_repeat_interval_minutes": 30,
    "recurrence_rule": "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
    "recurrence_end_date": "2026-12-31",
    "is_relentless": true,
    "notify_home_assistant_url": "http://homeassistant.local:8123/api/webhook/override-webhook-id",
    "notify_ntfy_url": "https://ntfy.sh/your-work-topic",
    "notify_gotify_url": "https://gotify.example.com"
}
```
[More info on webhook structure →](https://github.com/KenWeTech/My-Nudgr/blob/main/docs/webhook.md)


### My Nudgr on Your Devices

#### iOS Shortcut

You can create or use my iOS Shortcut to quickly add reminders from your iPhone or iPad. The shortcut will prompt you for the reminder details and send the data to your My Nudgr server.

-   **[Download iOS Shortcut](https://www.icloud.com/shortcuts/2b07854ffd3c4f1d990babd7d7c79ec9)**

