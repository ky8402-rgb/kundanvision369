# 🚀 GigPilot Autonomous Freelance FastAPI Backend

Production-ready FastAPI backend for autonomous freelance project scraping, AI proposal generation with Gemini, Freelancer.com auto-bidding, and real-time dashboard telemetry.

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

## 🛠️ Local Development

1. **Clone repository and create virtualenv:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Add your FREELANCER_ACCESS_TOKEN and GEMINI_API_KEY
   ```

3. **Start FastAPI development server:**
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Verify endpoints:**
   - Swagger UI: `http://localhost:8000/docs`
   - Stats API: `http://localhost:8000/api/bids/stats`
   - Bids API: `http://localhost:8000/api/bids`
   - Leads API: `http://localhost:8000/api/leads`

---

## ☁️ Deploying on Render

1. Create a **New Web Service** on [Render](https://render.com).
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. In **Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `FREELANCER_ACCESS_TOKEN`: (Optional) Your Freelancer.com OAuth token
   - `TELEGRAM_BOT_TOKEN`: (Optional) Telegram bot token for instant push notifications
   - `TELEGRAM_CHAT_ID`: (Optional) Telegram chat ID
   - `DASHBOARD_USERNAME`: `admin`
   - `DASHBOARD_PASSWORD`: `your_password`
   - `SQLITE_DB_PATH`: `bids.db`
5. Click **Create Web Service**.

---

## ⏰ Setting Up Cron Triggers (Render Cron / GitHub Actions / EasyCron)
To run autonomous bidding cycles every 10–30 minutes, set a GET request to:
- `https://your-backend-url.onrender.com/api/cron/find-and-bid`
- `https://your-backend-url.onrender.com/api/cron/sync-bids`
