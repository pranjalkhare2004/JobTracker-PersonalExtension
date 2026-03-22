<p align="center">
  <img src="icons/icon128.png" alt="JobTrackr Logo" width="100" />
</p>

<h1 align="center">🚀 JobTrackr</h1>

<p align="center">
  <strong>Your personal job application command center — right inside your browser.</strong><br/>
  One click. Zero friction. Never lose track of an application again.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/100%25-Free_Forever-brightgreen?style=flat-square" alt="Free Forever" />
  <img src="https://img.shields.io/badge/No_Backend-Offline_Ready-orange?style=flat-square" alt="No Backend" />
  <img src="https://img.shields.io/badge/PRs-Welcome-ff69b4?style=flat-square" alt="PRs Welcome" />
  <img src="https://img.shields.io/github/license/pranjalkhare2004/JobTracker-PersonalExtension?style=flat-square" alt="License" />
</p>

---

## ✨ What is JobTrackr?

**JobTrackr** is a Chrome Extension that lives in your browser and lets you **log any job application in one click** — while you're on the job listing page. No spreadsheets. No copy-pasting. No forgetting which email you used.

It works on **25+ job platforms** out of the box — LinkedIn, Indeed, Naukri, Glassdoor, Workday, Greenhouse, Lever, Internshala, Unstop, and many more. It even works on company career pages.

> 🎯 **Built for job seekers who apply to multiple jobs daily and are tired of messy spreadsheets.**

---

##  💡 Why JobTrackr?

| 😤 The Problem | 🎉 The Solution |
|---|---|
| "Which email did I use for Google?" | One-click logging with email tracking |
| "Did I already apply here?" | Smart duplicate detection |
| "I forgot to follow up with Amazon" | Built-in follow-up reminders |
| "My spreadsheet is a mess" | Beautiful searchable dashboard |
| "I need a referral message NOW" | AI-ready prompt generator |

---

## 🔥 Features at a Glance

### 🖱️ One-Click Logging
Open a job listing → click the JobTrackr icon → **done**. It auto-fills the company, role, location, platform, and job ID for you. Just hit save.

### 🤖 Smart Auto-Detection
JobTrackr reads the page and automatically scrapes:
- 🏢 Company name & role
- 📍 Location
- 🔗 Job ID (even from Workday URLs!)
- 💼 Job type (Full-time / Internship / Contract)
- 🏠 Work mode (Remote / Hybrid / On-site)
- 📊 Required skills from the JD

### 🧠 JD Keyword Extraction
It pulls out the **must-have** and **nice-to-have** skills from job descriptions and matches them against your skill set — so you instantly know your match score before applying.

### 👀 JD Preview & Save
Toggle **"Save JD"** to store the full job description locally. Preview it, edit it, or paste one manually. See a quality indicator and how much storage it costs.

### 🔁 Duplicate Detection
Already applied? JobTrackr tells you — **before** you waste time:
- **Exact match** — same Job ID? Blocked.
- **URL match** — same link? Warning.
- **Fuzzy match** — same company + role? Gentle nudge.
- **Re-post detection** — company re-posted after 60 days? Log as new.

### 🤖 AI Prompt Generator
Generate ready-to-paste prompts for ChatGPT with one click:
- 📝 **Cover Letter** — tailored to the role + your skills
- 📋 **Resume Tips** — what to highlight for this JD
- 🎤 **Interview Prep** — likely questions for this role
- 💌 **Referral Message** — professional ask with your details filled in

All prompts use **customizable templates** — edit them in the Settings Hub.

### 📅 Follow-up Reminders
Set a follow-up date when you log an application. JobTrackr shows:
- ⚠️ **Overdue** badge when you miss a follow-up
- 📅 **Today** badge for same-day reminders
- 🔔 Red badge icon on the extension when follow-ups are due

### 📊 Full Dashboard
A beautiful, filterable table of every application you've ever logged:
- 🔍 Search by company, role, or keyword
- 🎛️ Filter by platform, status, job type, work mode, email, source
- 📝 Inline status editing — change status right from the table
- ✅ Bulk actions — select multiple, change status, export, or delete
- 🔗 Re-post grouping — see previous applications for the same role
- 📋 Click any row to expand and view JD, keywords, and notes

### ⚙️ Settings Hub (The Control Center)
Everything is customizable. Nothing is hardcoded. The Settings Hub has **8 panels**:

| Panel | What You Can Do |
|-------|----------------|
| 👤 **My Profile** | Name, college, degree, CGPA, resume link, LinkedIn — fills your templates |
| ⚙️ **General** | Email labels, defaults, weekly goal, follow-up days |
| 📝 **Templates** | Edit referral messages, AI prompts, cover letter templates |
| 💬 **Snippets** | Quick-add notes like "Rejected — no response" with one click |
| 📚 **Skill Dictionary** | Skills used for JD parsing, organized by category |
| 🌐 **Platforms** | Enable/disable job boards, add your own custom platforms |
| 📦 **Import/Export** | CSV export, Google Sheets copy, full JSON backup/restore |
| 💾 **Storage** | See how much Chrome storage you're using with a visual chart |

### 📋 Quick Notes with Snippet Pills
Tiny clickable pills in the popup — tap to instantly add common notes:
> "Applied via careers page" · "Referral sent" · "Resume tailored" · "Cold emailed recruiter"

### 📊 Weekly Recap
Every Monday, get a banner showing last week's stats — how many you applied to, how many are interviewing, and how many follow-ups you owe.

### 🌗 Dark Mode
Automatically matches your system preference. Looks stunning in both light and dark.

---

## 🛠️ Getting Started

### Install Locally

1. **Download** this repo (or clone it):
   ```
   git clone https://github.com/pranjalkhare2004/JobTracker-PersonalExtension.git
   ```

2. Open **Chrome** → navigate to `chrome://extensions`

3. Enable **Developer Mode** (top-right toggle)

4. Click **"Load unpacked"** → select the `jobtrackr/` folder

5. 📌 **Pin** the JobTrackr icon to your toolbar

6. Open any job listing → click the icon → you're tracking!

### First Steps After Install

1. Click the ⚙️ gear in the popup → **Open Settings Hub**
2. Go to **My Profile** → fill in your name, college, resume link
3. Go to **General** → set your two email addresses
4. Start applying! 🎉

---

## 🌐 Supported Platforms

<table>
  <tr>
    <td>🔵 LinkedIn</td>
    <td>🟠 Indeed</td>
    <td>🔵 Naukri</td>
    <td>🟢 Glassdoor</td>
  </tr>
  <tr>
    <td>🟢 Greenhouse</td>
    <td>🟣 Lever</td>
    <td>🔵 Workday</td>
    <td>🔵 SmartRecruiters</td>
  </tr>
  <tr>
    <td>🟣 Ashby</td>
    <td>🔴 Taleo</td>
    <td>⚫ Wellfound</td>
    <td>🔵 Internshala</td>
  </tr>
  <tr>
    <td>🔵 Unstop</td>
    <td>🔴 Cutshort</td>
    <td>🟢 Hirist</td>
    <td>🔴 Instahyre</td>
  </tr>
  <tr>
    <td>🟣 Foundit</td>
    <td>🟣 SimplyHired</td>
    <td>🟠 WorkAtStartup</td>
    <td>🔵 Rippling</td>
  </tr>
  <tr>
    <td>🔵 iCIMS</td>
    <td>🟢 BambooHR</td>
    <td>🟣 Jobvite</td>
    <td>🔵 Workable</td>
  </tr>
  <tr>
    <td>🟢 Breezy</td>
    <td>🟠 Uplers</td>
    <td colspan="2">🏢 <em>+ Any career page</em></td>
  </tr>
</table>

> 💡 **Don't see your platform?** Add it yourself in Settings Hub → Platforms!

---

## 🔒 Privacy & Data

- **100% local** — all data lives in `chrome.storage.sync`
- **No backend, no server, no tracking, no analytics**
- **No paid APIs** — works completely offline
- **Your data never leaves your browser**
- Syncs across Chrome instances via your Google account (Chrome's built-in sync)

---

## 🤝 Contributing

We love contributions! Whether you're fixing a bug, adding a new platform, or just improving the docs — **you're welcome here**.

### How to Contribute

1. **Fork** this repository
2. Create a feature branch: `git checkout -b feature/awesome-thing`
3. Make your changes
4. **Test** by loading the extension locally
5. Commit: `git commit -m "add awesome thing"`
6. Push: `git push origin feature/awesome-thing`
7. Open a **Pull Request** 🚀

### Ideas for Contributions

- 🌐 Add support for more job platforms
- 🎨 UI improvements and animations
- 🌍 Internationalization (i18n)
- 📱 Better mobile-responsive dashboard
- 🧪 Unit tests for scraper and templates
- 📖 Better documentation
- 🐛 Bug fixes (check Issues tab)

### Code of Conduct

Be kind. Be respectful. We're all here because we know the job search grind. Let's help each other out. 💪

---

## ⭐ Show Your Support

If JobTrackr helped you stay organized during your job search, **give it a star** ⭐

It takes 1 second and means the world. 🌍

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=18&duration=4000&pause=1000&color=6366F1&center=true&vCenter=true&multiline=true&repeat=true&width=600&height=80&lines=%22Every+application+you+track+is+one+step;closer+to+the+offer+that+changes+everything.%22" alt="Typing SVG" />
</p>

<p align="center">
  <em>"The best developers don't just write code — they build tools that make the grind a little less painful. Keep shipping. Keep applying. Your <code>200 OK</code> is coming."</em>
</p>

<p align="center">Made with ❤️, caffeine, and the refusal to use another spreadsheet.</p>
