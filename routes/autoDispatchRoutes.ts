import express from 'express';
import { autoDispatchJob } from '../server/autoDispatch.js';
import { completeWorkOrderAndPayout, checkAndAutoApproveOverdueWorkOrders } from '../server/completionWorker.js';
import { runSelfHealingDiagnostics } from '../server/retryWorker.js';
import { triggerAISupportIncident, queryAISupportChat, activeSupportTickets } from '../server/supportChat.js';
import { getPgPool, memoryStore, User } from '../server/pgDatabase.js';
import { getPayPalConfig, isPayPalConfigured } from '../server/paypal.js';
import { logActivityEvent } from '../server/activityLogger.js';

const router = express.Router();

/**
 * POST /api/jobs
 * 1. Post a new job & automatically trigger auto-dispatch:
 *    - Selects the best worker (rating & workload)
 *    - Automatically creates and accepts bid
 *    - Creates work order with deadline
 */
router.post('/jobs', async (req, res) => {
  try {
    const { title, description, budget, customerId, deadlineHours } = req.body;

    if (!title || !budget) {
      return res.status(400).json({
        success: false,
        error: 'Job title and budget are required.',
      });
    }

    const result = await autoDispatchJob({
      title: title.trim(),
      description: description || '',
      budget: parseFloat(budget),
      customerId,
      deadlineHours: deadlineHours ? parseInt(deadlineHours, 10) : 24,
    });

    return res.status(201).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || String(err),
    });
  }
});

/**
 * GET /api/jobs
 * List all jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const pool = getPgPool();
    if (pool) {
      try {
        const result = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
        return res.json({ success: true, jobs: result.rows });
      } catch (err: any) {
        console.warn('⚠️ [Jobs Route] Postgres read fallback:', err.message);
      }
    }

    const jobs = Array.from(memoryStore.jobs.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return res.json({ success: true, jobs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/work-orders
 * List all work orders with worker and job details
 */
router.get('/work-orders', async (req, res) => {
  try {
    const pool = getPgPool();
    if (pool) {
      try {
        const result = await pool.query(`
          SELECT 
            wo.*,
            j.title as job_title,
            j.budget as job_budget,
            u.email as worker_email,
            u.paypal_email as worker_paypal_email,
            u.rating as worker_rating
          FROM work_orders wo
          LEFT JOIN jobs j ON wo.job_id = j.id
          LEFT JOIN users u ON wo.worker_id = u.id
          ORDER BY wo.completion_deadline ASC
        `);
        return res.json({ success: true, workOrders: result.rows });
      } catch (err: any) {
        console.warn('⚠️ [WorkOrders Route] Postgres query fallback:', err.message);
      }
    }

    const workOrders = Array.from(memoryStore.workOrders.values()).map((wo) => {
      const job = memoryStore.jobs.get(wo.job_id);
      const worker = memoryStore.users.get(wo.worker_id);
      return {
        ...wo,
        job_title: job?.title || 'Unknown Job',
        job_budget: job?.budget || 0,
        worker_email: worker?.email || 'Unknown',
        worker_paypal_email: worker?.paypal_email || null,
        worker_rating: worker?.rating || 0,
      };
    });

    return res.json({ success: true, workOrders });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/work-orders/:id/complete
 * Worker marks work order as complete -> Triggers automated PayPal Payout
 */
router.post('/work-orders/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await completeWorkOrderAndPayout(id, 'worker_action');

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        workOrder: result.workOrder,
        transaction: result.transaction,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message,
        error: result.error,
        workOrder: result.workOrder,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/work-orders/:id/confirm
 * Customer confirms completion -> Triggers automated PayPal Payout
 */
router.post('/work-orders/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await completeWorkOrderAndPayout(id, 'customer_confirmation');

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        workOrder: result.workOrder,
        transaction: result.transaction,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message,
        error: result.error,
        workOrder: result.workOrder,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/transactions
 * List all payout transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    const pool = getPgPool();
    if (pool) {
      try {
        const result = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC');
        return res.json({ success: true, transactions: result.rows });
      } catch (err: any) {
        console.warn('⚠️ [Transactions Route] Postgres read fallback:', err.message);
      }
    }

    const transactions = Array.from(memoryStore.transactions.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return res.json({ success: true, transactions });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/workers
 * List all workers with workload, ratings, and PayPal payout email
 */
router.get('/workers', async (req, res) => {
  try {
    const pool = getPgPool();
    if (pool) {
      try {
        const result = await pool.query('SELECT * FROM users ORDER BY rating DESC');
        return res.json({ success: true, workers: result.rows });
      } catch (err: any) {
        console.warn('⚠️ [Workers Route] Postgres read fallback:', err.message);
      }
    }

    const workers = Array.from(memoryStore.users.values());
    return res.json({ success: true, workers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/workers
 * Register or update a worker with paypal_email
 */
router.post('/workers', async (req, res) => {
  try {
    const { email, paypal_email, rating, is_available } = req.body;
    if (!email || !paypal_email) {
      return res.status(400).json({ success: false, error: 'email and paypal_email are required.' });
    }

    const crypto = await import('crypto');
    const worker: User = {
      id: crypto.randomUUID(),
      email: email.trim(),
      paypal_email: paypal_email.trim(),
      rating: rating !== undefined ? parseFloat(rating) : 5.0,
      current_workload: 0,
      is_available: is_available !== undefined ? Boolean(is_available) : true,
    };

    const pool = getPgPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO users (id, email, paypal_email, rating, current_workload, is_available)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (email) DO UPDATE
           SET paypal_email = EXCLUDED.paypal_email, rating = EXCLUDED.rating, is_available = EXCLUDED.is_available`,
          [worker.id, worker.email, worker.paypal_email, worker.rating, worker.current_workload, worker.is_available]
        );
      } catch (err: any) {
        console.warn('⚠️ [Workers Route] Postgres insert notice:', err.message);
      }
    }

    memoryStore.users.set(worker.id, worker);
    return res.status(201).json({ success: true, worker });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/health/self-healing
 * Health-check endpoint that monitors pending work orders, failed transactions,
 * PayPal gateway status, and active AI support incident tickets.
 */
router.get('/health/self-healing', async (req, res) => {
  try {
    const pool = getPgPool();
    const isDbConnected = Boolean(pool);
    const payPalCfg = getPayPalConfig();

    const pendingWorkOrders = Array.from(memoryStore.workOrders.values()).filter(
      (w) => w.status === 'assigned' || w.status === 'in_progress'
    );
    const failedWorkOrders = Array.from(memoryStore.workOrders.values()).filter((w) => w.payment_status === 'failed');
    const failedTransactions = Array.from(memoryStore.transactions.values()).filter((t) => t.status === 'failed');

    const now = new Date();
    const overdueWorkOrders = pendingWorkOrders.filter((w) => new Date(w.completion_deadline) <= now);

    const isSystemHealthy = failedWorkOrders.length === 0 && failedTransactions.length === 0;

    return res.json({
      status: isSystemHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      selfHealing: {
        active: true,
        monitoringIntervalSeconds: 15,
        exponentialBackoffMaxRetries: 3,
      },
      metrics: {
        pendingWorkOrdersCount: pendingWorkOrders.length,
        overdueWorkOrdersCount: overdueWorkOrders.length,
        failedWorkOrdersCount: failedWorkOrders.length,
        failedTransactionsCount: failedTransactions.length,
        activeSupportTicketsCount: activeSupportTickets.length,
        totalRegisteredWorkers: memoryStore.users.size,
      },
      paypalGateway: {
        configured: isPayPalConfigured(),
        mode: payPalCfg.mode,
        receiverEmail: payPalCfg.receiverEmail,
      },
      database: {
        status: isDbConnected ? 'connected' : 'in_memory_fallback',
        engine: 'Neon / PostgreSQL',
      },
      activeTickets: activeSupportTickets.slice(0, 5),
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * POST /api/support/ai-chat
 * AI Support Chat endpoint for questions, debugging, and interactive assistance
 */
router.post('/support/ai-chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, error: 'message string is required.' });
    }

    const response = await queryAISupportChat(message, history || []);
    return res.json({ success: true, ...response });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/support/trigger-incident
 * Diagnostic endpoint to trigger AI Support analysis manually
 */
router.post('/support/trigger-incident', async (req, res) => {
  try {
    const { category, severity, title, errorMessage, context } = req.body || {};
    const ticket = await triggerAISupportIncident({
      category: category || 'GENERAL_SUPPORT',
      severity: severity || 'medium',
      title: title || 'Manual Diagnostic Trigger',
      errorMessage,
      context,
    });

    return res.json({ success: true, ticket });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/retry/trigger
 * Manually trigger self-healing retry engine
 */
router.post('/retry/trigger', async (req, res) => {
  try {
    const diagnostic = await runSelfHealingDiagnostics();
    return res.json({
      success: true,
      message: 'Self-healing diagnostic cycle executed successfully.',
      diagnostic,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
