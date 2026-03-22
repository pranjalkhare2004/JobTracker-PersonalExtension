# JobTrackr — Chrome Extension

Track job applications across LinkedIn, Wellfound, Indeed, Naukri, and more with one click. All data stays local in Chrome's storage — no backend, no servers, no subscriptions.

## Features

- **One-Click Logging** — Open the popup on any job listing page and log instantly
- **Auto-Detection** — Scrapes role, company, and platform from LinkedIn, Wellfound, Indeed, Naukri
- **Duplicate Detection** — Three-tier dedup (Job ID → URL → Fuzzy match) prevents double-logging
- **Dual Email Tracking** — Track applications sent from two different email addresses
- **Referral Tracking** — Toggle referral mode, record referral contacts, copy referral messages
- **Status Pipeline** — Applied → Referral Pending → Re-applied → Interviewing → Rejected → Offer → Withdrawn
- **Full Dashboard** — Search, filter, sort, and export all your applications
- **CSV Export** — Download your data anytime
- **Weekly Goals** — Set targets and track progress with badge counts
- **Dark Mode** — Automatic light/dark theme via `prefers-color-scheme`
- **Keyboard Shortcut** — `Ctrl+Shift+J` (or `Cmd+Shift+J` on Mac) opens the popup
- **Context Menu** — Right-click → "Log this job with JobTrackr"

## File Structure

```
jobtrackr/
├── manifest.json      — Manifest V3 configuration
├── background.js      — Service worker (badge, alarms, context menu)
├── content.js         — Message bridge (content script)
├── scraper.js         — Per-platform DOM extractors
├── storage.js         — Shared read/write/dedup helpers
├── popup.html         — Popup UI structure
├── popup.js           — Popup logic
├── popup.css          — Popup styles
├── dashboard.html     — Full-page dashboard
├── dashboard.js       — Dashboard logic
├── dashboard.css      — Dashboard styles
├── generate_icons.js  — Icon generator script (run once)
├── icons/
│   ├── icon16.png     — Toolbar icon
│   ├── icon48.png     — Extensions page icon
│   └── icon128.png    — Chrome Web Store icon
└── README.md          — This file
```

## Installation

1. **Download or clone** this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Select the `jobtrackr/` folder
6. The JobTrackr icon should appear in your toolbar

> **Tip:** Pin the extension to your toolbar for easy access (click the puzzle icon → pin JobTrackr).

## First Run Setup

Before logging your first application, configure your email addresses:

1. Click the **JobTrackr** icon in the toolbar
2. Click the **⚙ gear icon** in the top-right corner
3. Enter your **Email A** label and address (e.g., "Primary" — john@gmail.com)
4. Enter your **Email B** label and address (e.g., "Referral" — john@outlook.com)
5. Set your **default email** (A or B)
6. Set your **default application status** (usually "Applied")
7. Set your **weekly application goal**
8. Click **Save Settings**

## Usage

### Logging a Job Application

1. Navigate to a job listing on LinkedIn, Indeed, Wellfound, Naukri, or any site
2. Click the **JobTrackr icon** or press `Ctrl+Shift+J`
3. The popup auto-fills the role, company, platform, and URL
4. Select your email (A or B)
5. Choose the application status
6. Optionally toggle referral and add notes
7. Click **"Log Application"**

### Re-applying with a Referral

If you revisit a job you've already logged:
1. The popup shows a duplicate warning with the existing entry
2. Click **"Log as new"** to create a re-application
3. Status auto-sets to "Re-applied (Referral)" and email switches to your referral email

### Using the Dashboard

1. Click the **grid icon** in the popup header (or navigate to the extension's dashboard)
2. View stats: total applications, weekly progress, active pipeline, referrals
3. Search, filter by platform/email/status, and sort entries
4. Click any row to expand notes and job URL
5. Edit or delete entries inline

### Exporting Data

- From the **popup settings** or **dashboard**, click **"Export CSV"**
- File downloads as `jobtrackr_export_YYYY-MM-DD.csv`

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+J` | Open JobTrackr popup |
| Right-click → "Log this job with JobTrackr" | Open popup via context menu |

## Data Storage

All data is stored in `chrome.storage.sync`:
- **`jt_apps`** — Array of all application entries
- **`jt_apps_archive`** — Archived entries (older than 6 months)
- **`jt_settings`** — User settings (emails, defaults, goal)

> **Note:** Chrome sync storage has a 100KB total limit. If storage approaches 90KB, you'll be warned to export and archive old entries.

## Supported Platforms

| Platform | Auto-Detect | Job ID Extraction |
|---|---|---|
| LinkedIn | ✅ Role, Company | ✅ `/jobs/view/{id}` |
| Wellfound | ✅ Role, Company | ✅ `/jobs/{id}` |
| Indeed | ✅ Role, Company | ✅ `?jk={id}` |
| Naukri | ✅ Role, Company | ✅ `-{id}.html` |
| Other sites | ⚠️ Best-effort (og:title, h1) | ❌ Manual entry |

## Privacy

- **No data leaves your browser.** Everything is stored locally in Chrome's sync storage.
- **No analytics, no tracking, no external requests.**
- **No backend, no accounts, no subscriptions.**

## License

For personal use. Built with ❤️ and vanilla JavaScript.
