---
title: GigPilot Autonomous Freelance Engine
emoji: 🚀
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# 🚀 GigPilot - Autonomous AI Freelance Engine

Production-ready Full-Stack application (React + Express + Node.js) with Docker deployment support for Hugging Face Spaces, autonomous freelance project scraping, AI proposal generation with Google Gemini, and real-time dashboard telemetry.

---

## 🌟 Features

- **Autonomous Bid Proposal Generator**: Powered by Google Gemini 2.5/Flash AI.
- **Freelance Platform Aggregator**: Scrapes and tracks projects from RemoteOK, Freelancer, and multi-source APIs.
- **Interactive Analytics Dashboard**: Real-time win rate, earnings, pipeline status, and performance telemetry.
- **Telegram & Webhook Alerts**: Instant notification dispatcher for newly discovered high-match leads.
- **Secure Persistence**: PostgreSQL with Prisma ORM and resilient in-memory caching.

---

## 📡 API Endpoints Spec

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health probe: `{"status": "healthy"}` |
| `GET` | `/api/bids/stats` | Aggregated metrics: `{ total, active, won, earned, win_rate, package_counts }` |
| `GET` | `/api/bids?limit=50` | Array of placed bids: `[{ id, job_title, company, package, bid_amount, status, submitted_at }, ...]` |
| `GET` | `/api/leads?limit=20` | Scored leads stream: `[{ job_title, company, source, matched_package, created_at }, ...]` |
| `GET` | `/api/cron/find-and-bid` | Automated cron to search Freelancer, generate Gemini cover letters & bid |
| `GET` | `/api/cron/sync-bids` | Automated cron to sync statuses of active bids |
| `GET` | `/dashboard` | Password-protected admin view (HTTP Basic Auth) |

---

## 🐳 Hugging Face Spaces Deployment (Docker)

This repository includes a native multi-stage `Dockerfile` configured specifically for Hugging Face Spaces (running as non-root UID 1000 and listening on port `7860`).

### Space Configuration Settings:
- **SDK**: `Docker`
- **Port**: `7860` (configured automatically via `app_port: 7860`)
- **Environment Secrets** (Set in Space *Settings* -> *Variables and secrets*):
  - `GEMINI_API_KEY`: Your Google Gemini API Key
  - `DATABASE_URL`: PostgreSQL connection string (e.g. Neon, Supabase, or Render PostgreSQL)
  - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token (Optional)
  - `TELEGRAM_CHAT_ID`: Your Telegram chat ID (Optional)
  - `DASHBOARD_USERNAME`: `admin`
  - `DASHBOARD_PASSWORD`: Your chosen admin password

---

## 🛠️ Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start development server (Port 3000)
npm run dev

# 3. Build for production
npm run build

# 4. Start production server
npm start
```
