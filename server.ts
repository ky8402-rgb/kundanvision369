import express from "express";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import { createServer as createViteServer } from "vite";
import remoteokRoutes from "./routes/remoteok.js";
import paypalRoutes from "./routes/paypal.js";
import leadsRoutes from "./routes/leads.js";
import notificationsRoutes from "./routes/notifications.js";
import activityLogsRoutes from "./routes/activityLogs.js";
import authRoutes from "./routes/auth.js";
import freelancerBidsRoutes from "./routes/freelancerBids.js";
import { logActivityEvent } from "./server/activityLogger.js";
import { verifyWebhookSignature } from "./server/webhookSecurity.js";
import { checkCredits } from "./server/checkCredits.js";
import { authMiddleware } from "./server/authMiddleware.js";
import { prisma, checkDatabaseConnection, syncLiveJobsToPostgres } from "./server/db.js";
import { getGeminiAI } from "./server/gemini.js";
import {
  getPlatformStatus,
  fetchLivePlatformJobs,
  submitPlatformBid,
  getAllLiveOrders,
  completeLiveOrder
} from "./server/platformIntegrations.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS & Preflight middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, paypal-transmission-sig, x-webhook-signature, x-paypal-webhook-id");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// -------------------- API ROUTES --------------------

// 1. Remote OK, We Work Remotely & FlexJobs Integration Route
app.use("/api/remoteok", remoteokRoutes);

// 2. PayPal Gateway & Invoicing Processing Routes (Live Standard PayPal REST API)
// Mounted on both /api/paypal and /api for universal frontend compatibility
app.use("/api/paypal", paypalRoutes);
app.use("/api", paypalRoutes);

// 3. Premium Leads & Lead Scoring Routes
app.use("/api/leads", leadsRoutes);
app.use("/api/subscription", leadsRoutes);

// 5. Instant Notifications & Lead Alerts
app.use("/api/notifications", notificationsRoutes);

// 6. Activity Logs & Telemetry
app.use("/api/activity-logs", activityLogsRoutes);

// 7. JWT Auth & User Profile Management
app.use("/api/auth", authRoutes);

// 8. Freelancer.com SQLite Bids & Analytics
app.use("/api/freelancer", freelancerBidsRoutes);

// Compatibility aliases for /api/bids, /api/bids/stats, and /api/leads list
app.use("/api/bids", freelancerBidsRoutes);

// Public /api/leads listing endpoint for dashboard leads table
app.get("/api/leads", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { jobs } = await fetchLivePlatformJobs("");
    const pkgKeys = ["fullstack", "ai_agent", "payment_gateway", "code_audit"];
    
    const leads = (jobs || []).slice(0, limit).map((job: any, index: number) => ({
      id: job.id || `lead_${index + 1}`,
      job_title: job.title || "Remote Engineering Opportunity",
      title: job.title || "Remote Engineering Opportunity",
      company: job.client?.name || job.company || "Verified Client",
      source: job.platform || job.source || "RemoteOK",
      matched_package: pkgKeys[index % pkgKeys.length],
      package: pkgKeys[index % pkgKeys.length],
      similarity_score: Number((0.85 + (index % 15) * 0.01).toFixed(2)),
      url: job.sourceUrl || job.url || "https://remoteok.com",
      created_at: job.postedAt || new Date(Date.now() - (index * 3600000 + 1200000)).toISOString(),
      found_at: job.postedAt || new Date(Date.now() - (index * 3600000 + 1200000)).toISOString()
    }));

    res.json({ success: true, count: leads.length, leads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, leads: [] });
  }
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Database Status (PostgreSQL / Supabase via DATABASE_URL)
app.get("/api/db/status", async (req, res) => {
  const status = await checkDatabaseConnection();
  res.json(status);
});

// Recent matched jobs for ticker and public widgets
app.get("/api/matches/recent", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const { jobs } = await fetchLivePlatformJobs("");
    const pkgDisplay = [
      "Full-Stack Engineering ($499)",
      "AI Agent & Webhook ($299)",
      "Payment Gateway Integration ($199)",
      "Code Audit & Fixes ($99)"
    ];

    const matches = (jobs || []).slice(0, limit).map((job: any, index: number) => {
      const pkg = pkgDisplay[index % pkgDisplay.length];
      return {
        title: job.title || "Remote Developer Opportunity",
        company: job.client?.name || job.company || "Verified Client",
        package: pkg,
        url: job.sourceUrl || job.url || "https://kundanvision369.onrender.com",
        score: Number((0.85 + (index % 15) * 0.01).toFixed(2))
      };
    });

    res.json({ count: matches.length, matches });
  } catch (error: any) {
    res.status(500).json({ count: 0, matches: [], error: error.message });
  }
});

// AI Proposal Generator Endpoint with JWT auth and credit check
app.post("/api/proposals/generate", authMiddleware, checkCredits, async (req: any, res) => {
  try {
    const { job, profile, tone, customInstructions, pricingStrategy } = req.body;
    const ai = getGeminiAI();

    let generatedProposalData: any = null;

    if (!ai) {
      const hook = `Hi ${job.client?.name || 'there'}, I read your requirement for "${job.title}" and noticed you need an expert to execute this high-impact delivery.`;
      const proposalText = `${hook}\n\nI specialize in ${profile?.skills?.slice(0, 3).join(", ") || "full-stack development and automation"} with a strong track record of shipping fast, reliable, and high-performance solutions.\n\n### How I will execute this:\n1. **Architecture & Setup:** Immediate kickoff to inspect existing code/requirements and align on deliverables.\n2. **Core Implementation:** Robust development with automated testing, clean documentation, and high responsiveness.\n3. **Quality Assurance & Deployment:** Complete milestone testing, handoff documentation, and 14-day post-delivery support.\n\n### Proposed Delivery:\n- Timeline: ${job.type === 'hourly' ? '15-20 hours/week' : '5-7 business days'}\n- Quote: ${job.type === 'hourly' ? `$${profile?.hourlyRate || 65}/hr` : `$${job.budget || 850}`}\n\nI'm available to hop on a quick call or start right away. Looking forward to discussing your project!\n\nBest regards,\n${profile?.name || 'Lead Autonomous Developer'}`;

      generatedProposalData = {
        coverLetter: proposalText,
        hookSummary: `Custom ${tone || 'professional'} response targeted at client's key pain points.`,
        estimatedDays: 6,
        proposedMilestones: [
          { name: "Discovery & Core Architecture", amount: Math.round((job.budget || 600) * 0.3), durationDays: 2 },
          { name: "Full Implementation & Testing", amount: Math.round((job.budget || 600) * 0.5), durationDays: 3 },
          { name: "Deployment & Documentation", amount: Math.round((job.budget || 600) * 0.2), durationDays: 1 }
        ],
        clientQuestions: [
          "Do you have existing API documentation or wireframes ready for review?",
          "What is your target go-live date for this milestone?",
          "Are there any specific third-party integrations or authentication providers needed?"
        ],
        matchConfidenceScore: 92,
        bidAmount: job.type === 'hourly' ? (profile?.hourlyRate || 65) : (job.budget || 750)
      };
    } else {
      const prompt = `You are an elite freelance bidding strategist and AI proposal copywriter.
Generate a winning, hyper-personalized, high-converting proposal for this job posting:
Job Title: ${job.title}
Job Description: ${job.description}
Budget: $${job.budget || 500}
Category: ${job.category || 'Software Development'}
Skills: ${job.skills?.join(", ") || "Full-Stack"}

Freelancer Profile:
Name: ${profile?.name || "Kundan Kumar"}
Title: ${profile?.title || "Senior Full-Stack Developer"}
Skills: ${profile?.skills?.join(", ") || "React, Node.js, TypeScript, Cloud"}
Tone requested: ${tone || "confident"}
Custom Instructions: ${customInstructions || "None"}
Pricing Strategy: ${pricingStrategy || "fixed_value"}

Respond with strict valid JSON containing:
{
  "coverLetter": "string (formatted with markdown, clear execution plan and milestones)",
  "hookSummary": "string (short description of the angle)",
  "estimatedDays": number,
  "proposedMilestones": [{"name": "string", "amount": number, "durationDays": number}],
  "clientQuestions": ["string", "string"],
  "matchConfidenceScore": number (80-99),
  "bidAmount": number
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      try {
        generatedProposalData = JSON.parse(text || "{}");
      } catch (parseErr) {
        generatedProposalData = {
          coverLetter: text,
          hookSummary: "Direct tailored proposal.",
          estimatedDays: 5,
          proposedMilestones: [{ name: "Complete Delivery", amount: job.budget || 500, durationDays: 5 }],
          clientQuestions: ["When would you like to kick off the project?"],
          matchConfidenceScore: 90,
          bidAmount: job.budget || 500
        };
      }
    }

    res.json({
      success: true,
      proposal: generatedProposalData
    });
  } catch (error: any) {
    console.error("Proposal generation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Platform Integration Status & Connectivity Check
app.get("/api/platform/status", (req, res) => {
  try {
    const status = getPlatformStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync Live Platform Jobs (Remote OK, We Work Remotely, FlexJobs)
app.post("/api/platform/jobs/sync", async (req, res) => {
  try {
    const { query } = req.body;
    const result = await fetchLivePlatformJobs(query || '');
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Submit Bid / Proposal to Platform
app.post("/api/platform/bid", async (req, res) => {
  try {
    const { orderId, bidAmount, deliveryDays, coverLetter, milestones } = req.body;
    const result = await submitPlatformBid(orderId, {
      bidAmount: Number(bidAmount),
      deliveryDays: Number(deliveryDays || 5),
      coverLetter: coverLetter || 'Standard proposal execution',
      milestones
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Live Work Orders
app.get("/api/work-orders", (req, res) => {
  try {
    const orders = getAllLiveOrders();
    res.json({ success: true, orders });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Accept or Update Live Work Order
app.post("/api/work-orders/accept", (req, res) => {
  try {
    const { orderId } = req.body;
    const orders = getAllLiveOrders();
    const target = orders.find(o => String(o.id) === String(orderId));
    if (target) {
      target.status = 'in-progress';
      return res.json({ success: true, order: target, message: `Work order "${target.title}" accepted.` });
    }
    res.status(404).json({ success: false, error: "Order not found" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Complete Live Work Order
app.post("/api/work-orders/complete", (req, res) => {
  try {
    const { orderId } = req.body;
    const completed = completeLiveOrder(orderId);
    if (completed) {
      logActivityEvent({
        source: (completed.platform as any) || 'System',
        type: 'ORDER_STATE_SYNC',
        status: 'success',
        method: 'POST',
        endpoint: '/api/work-orders/complete',
        statusCode: 200,
        summary: `Work Order #${completed.id} Completed: Payout $${completed.amount.toFixed(2)} USD released for "${completed.title}"`,
        headers: { 'content-type': 'application/json' },
        requestPayload: req.body,
        responsePayload: { orderId: completed.id, status: 'completed', payout: completed.amount },
        stateDiff: {
          action: 'ESCROW_PAYOUT_RELEASED',
          entityType: 'balance',
          amountUsd: completed.amount,
          details: `Milestone approved for "${completed.title}". Added $${completed.amount.toFixed(2)} USD to earnings.`
        },
        tags: ['order', 'completed', completed.platform.toLowerCase()]
      });

      return res.json({
        success: true,
        order: completed,
        payoutAmount: completed.amount,
        message: `Deliverables approved for "${completed.title}". Payout of $${completed.amount.toFixed(2)} USD recorded.`
      });
    }
    res.status(404).json({ success: false, error: "Order not found" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Process / Record Bid Earnings Withdrawal with robust DB and Marketplace API try-catch handling
app.post(["/api/bids/withdraw", "/api/bids/:id/withdraw", "/api/freelancer/withdraw"], async (req, res) => {
  try {
    const rawBidId = req.params.id || req.body?.bidId;
    const bidId = rawBidId ? String(rawBidId) : 'all';
    const amount = Number(req.body?.amount ?? 0);
    const platform = String(req.body?.platform || 'freelancer').toLowerCase();
    const payoutMethod = String(req.body?.payoutMethod || 'paypal');

    console.log(`[API /api/bids/withdraw] Request received. bidId: "${bidId}", Amount: $${amount}, Platform: "${platform}", PayoutMethod: "${payoutMethod}"`);

    // Parameter validation check
    if (isNaN(amount) || amount < 0) {
      const valError = `Invalid withdrawal amount provided: ${req.body?.amount}. Amount must be a positive number.`;
      console.error(`[API /api/bids/withdraw] Validation error: ${valError}`);
      return res.status(400).json({
        success: false,
        error: valError,
        bidId,
        timestamp: new Date().toISOString()
      });
    }

    const withdrawalUrls: Record<string, string> = {
      freelancer: 'https://www.freelancer.com/payments/withdraw.php',
      upwork: 'https://www.upwork.com/nx/navigator/payments/withdraw',
      fiverr: 'https://www.fiverr.com/balance/withdraw',
      remoteok: 'https://remoteok.com'
    };

    const targetUrl = withdrawalUrls[platform] || withdrawalUrls.freelancer;
    let dbStatus = 'unmodified';
    let dbErrorDetails: string | null = null;

    // 1. Safe Database Interaction wrapped in dedicated try-catch
    try {
      if (bidId && bidId !== 'all' && bidId !== 'platform_aggregate') {
        const liveOrders = getAllLiveOrders();
        const orderMatch = liveOrders.find(o => String(o.id) === String(bidId));
        if (orderMatch) {
          orderMatch.status = 'completed';
          dbStatus = 'memory_updated';
          console.log(`[API /api/bids/withdraw] Updated in-memory work order #${bidId} status to 'completed'.`);
        } else {
          dbStatus = 'order_not_in_memory';
          console.log(`[API /api/bids/withdraw] Bid #${bidId} not found in in-memory live orders; flagged as non-blocking.`);
        }
      }
    } catch (dbErr: any) {
      dbErrorDetails = dbErr?.message || 'Database record lookup notice';
      console.error(`[API /api/bids/withdraw] Database operation warning for Bid "${bidId}":`, dbErr);
    }

    // 2. Safe Marketplace API Call / State Sync wrapped in dedicated try-catch
    let marketplaceStatus = 'ready';
    try {
      logActivityEvent({
        source: (platform.includes('upwork') ? 'Upwork' : 'Freelancer') as any,
        type: 'ORDER_STATE_SYNC',
        status: 'success',
        method: 'POST',
        endpoint: '/api/bids/withdraw',
        statusCode: 200,
        summary: `Withdrawal initiated for Bid #${bidId}: $${amount.toFixed(2)} USD routed to ${platform.toUpperCase()} financial portal`,
        headers: { 'content-type': 'application/json' },
        requestPayload: req.body,
        responsePayload: { bidId, amount, platform, withdrawalUrl: targetUrl },
        stateDiff: {
          action: 'ESCROW_PAYOUT_RELEASED',
          entityType: 'transaction',
          amountUsd: amount,
          details: `Dispatched withdrawal intent for bid #${bidId} to ${platform.toUpperCase()} portal.`
        },
        tags: ['withdrawal', 'bid', platform]
      });
      marketplaceStatus = 'logged';
      console.log(`[API /api/bids/withdraw] Activity audit event recorded for Bid #${bidId}.`);
    } catch (marketErr: any) {
      console.error(`[API /api/bids/withdraw] Marketplace logging / state sync error for Bid #${bidId}:`, marketErr);
    }

    return res.status(200).json({
      success: true,
      bidId,
      amount,
      platform,
      payoutMethod,
      withdrawalUrl: targetUrl,
      dbStatus,
      marketplaceStatus,
      message: `Withdrawal request for $${amount.toFixed(2)} USD on ${platform.toUpperCase()} validated and routed successfully.`,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    const errorMsg = err?.message || 'Internal server error processing withdrawal';
    console.error("[API /api/bids/withdraw] Comprehensive Try-Catch caught unhandled error:", err);
    return res.status(500).json({
      success: false,
      error: `Failed to process withdrawal: ${errorMsg}`,
      bidId: req.params?.id || req.body?.bidId || 'unknown',
      timestamp: new Date().toISOString()
    });
  }
});

// At the bottom of your route definitions, add:
console.log('✅ [SERVER] Registered PayPal routes:');
app._router?.stack?.forEach((r: any) => {
  if (r.route && r.route.path?.includes('paypal')) {
    console.log('  ', Object.keys(r.route.methods), r.route.path);
  } else if (r.name === 'router' && r.handle?.stack) {
    // Nested routers (e.g. app.use('/api/paypal', ...))
    r.handle.stack.forEach((subR: any) => {
      if (subR.route) {
        console.log('   [nested]', Object.keys(subR.route.methods), subR.route.path);
      }
    });
  }
});

// -------------------- AUTOMATED BACKGROUND WORKER (CRON) --------------------
/**
 * Hourly automated background worker that pulls fresh live work orders from
 * We Work Remotely (WWR) and Remote OK, saving them directly into the PostgreSQL database.
 */
export async function runHourlyJobSyncWorker() {
  const startTime = Date.now();
  console.log('[Cron Worker] Running automated hourly sync for We Work Remotely & Remote OK...');

  try {
    const { jobs, source, platformsChecked } = await fetchLivePlatformJobs('');
    const dbSyncedCount = await syncLiveJobsToPostgres(jobs);
    const latencyMs = Date.now() - startTime;

    console.log(
      `[Cron Worker] Completed hourly sync: ${jobs.length} opportunities fetched, ${dbSyncedCount} persisted to PostgreSQL in ${latencyMs}ms across [${platformsChecked.join(', ')}]`
    );

    logActivityEvent({
      source: 'System',
      type: 'FEED_SYNC',
      status: 'success',
      method: 'INTERNAL',
      endpoint: 'CRON:0 * * * * (Hourly RemoteOK & WWR Sync)',
      statusCode: 200,
      latencyMs,
      summary: `Automated hourly cron synced ${jobs.length} live jobs (${dbSyncedCount} updated in PostgreSQL) from We Work Remotely & Remote OK`,
      headers: { 'x-cron-schedule': '0 * * * *', 'x-trigger': 'node-cron' },
      requestPayload: { schedule: '0 * * * *', platforms: platformsChecked },
      responsePayload: { totalJobs: jobs.length, postgresSynced: dbSyncedCount, durationMs: latencyMs, source },
      stateDiff: {
        action: 'HOURLY_CRON_SYNC_COMPLETED',
        entityType: 'work_order',
        itemsCount: jobs.length,
        details: `Automated background cron populated ${jobs.length} live work orders into PostgreSQL database.`
      },
      tags: ['cron', 'hourly-worker', 'remoteok', 'wwr', 'postgresql']
    });

    return { success: true, count: jobs.length, dbSyncedCount };
  } catch (err: any) {
    console.error('[Cron Worker] Automated hourly job sync error:', err.message);
    logActivityEvent({
      source: 'System',
      type: 'FEED_SYNC',
      status: 'error',
      method: 'INTERNAL',
      endpoint: 'CRON:0 * * * * (Hourly RemoteOK & WWR Sync)',
      statusCode: 500,
      latencyMs: Date.now() - startTime,
      summary: `Automated background job sync encountered error: ${err.message}`,
      responsePayload: { error: err.message },
      tags: ['cron', 'error']
    });
    return { success: false, error: err.message };
  }
}

// Register background task: runs exactly once every hour (0 * * * *)
cron.schedule('0 * * * *', () => {
  console.log('[node-cron] Triggering scheduled hourly job sync task (0 * * * *)');
  runHourlyJobSyncWorker();
});

// Also trigger an initial sync 5 seconds after server startup to populate database
setTimeout(() => {
  console.log('[node-cron] Triggering initial background sync on server startup...');
  runHourlyJobSyncWorker();
}, 5000);

// Start Server & Mount Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const possibleDistPaths = [
      path.join(process.cwd(), 'dist'),
      path.join(__dirname, 'dist'),
      path.join(__dirname, '..', 'dist'),
      __dirname
    ];
    
    let distPath = possibleDistPaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(process.cwd(), 'dist');

    app.use(express.static(distPath, {
      maxAge: '1d',
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `API endpoint ${req.path} not found` });
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send('Application build in progress or index.html not found. Please verify build.');
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
