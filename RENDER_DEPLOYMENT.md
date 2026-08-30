# Deploying GigPilot to Render

This project is configured and ready for 1-click or automated Git deployment on [Render](https://render.com).

---

## Method 1: Deploy via GitHub (Recommended)

1. **Push your code to GitHub**:
   - In Google AI Studio, click the **Settings / Export** menu and export to GitHub (or download ZIP and push to a new GitHub repo).

2. **Log into Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com).
   - Click **New +** → **Web Service** (or **Blueprint** to use `render.yaml`).

3. **Connect Repository**:
   - Select your GitHub repository.

4. **Configure Settings** (if creating Web Service manually):
   - **Name**: `gigpilot-freelance-platform` (or any name you choose)
   - **Language**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

5. **Set Environment Variables** (under *Environment Variables* section):
   | Variable | Value / Description |
   |---|---|
   | `NODE_VERSION` | `20` |
   | `NODE_ENV` | `production` |
   | `PAYPAL_RECEIVER_EMAIL` | `ky8402@gmail.com` |
   | `PAYPAL_ME_USERNAME` | `ky8402` |
   | `PAYPAL_MODE` | `live` |
   | `GEMINI_API_KEY` | *(Your Google Gemini API Key from AI Studio)* |
   | `PAYPAL_CLIENT_ID` | *(Optional: PayPal REST API Client ID)* |
   | `PAYPAL_CLIENT_SECRET` | *(Optional: PayPal REST API Secret)* |
   | `UPWORK_CLIENT_ID` | *(Optional: Upwork Developer Client ID)* |
   | `UPWORK_CLIENT_SECRET` | *(Optional: Upwork Developer Secret)* |
   | `FREELANCER_OAUTH` | *(Optional: Freelancer OAuth Token)* |

6. **Click "Create Web Service"**:
   - Render will build the Vite frontend bundle and start the Node Express server.
   - You will receive a live production URL: `https://your-app-name.onrender.com`.

---

## Method 2: Blueprint Deployment (`render.yaml`)

Because this repository contains a `render.yaml` blueprint:
1. In Render Dashboard, click **New +** → **Blueprint**.
2. Select your repository.
3. Render will read `render.yaml` and configure the build command, start command, and environment variable schema automatically.
4. Click **Apply**.
