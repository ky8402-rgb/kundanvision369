import { Pool } from 'pg';
import crypto from 'crypto';
import { getNeonPool } from './neon.js';

export interface User {
  id: string;
  email: string;
  paypal_email: string | null;
  rating: number;
  current_workload: number;
  is_available: boolean;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  budget: number;
  status: 'open' | 'assigned' | 'completed' | 'paid';
  customer_id: string;
  created_at: string;
}

export interface Bid {
  id: string;
  job_id: string;
  worker_id: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface WorkOrder {
  id: string;
  job_id: string;
  worker_id: string;
  bid_id: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'paid';
  completion_deadline: string;
  completed_at: string | null;
  payment_status: 'pending' | 'processing' | 'paid' | 'failed';
  customer_confirmed?: boolean;
  worker_marked_complete?: boolean;
}

export interface Transaction {
  id: string;
  work_order_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  paypal_payout_batch_id: string | null;
  created_at: string;
  retry_count?: number;
  last_error?: string | null;
}

// In-Memory resilient state (used when offline/fallback or parallel to DB)
class InMemoryStore {
  users: Map<string, User> = new Map();
  jobs: Map<string, Job> = new Map();
  bids: Map<string, Bid> = new Map();
  workOrders: Map<string, WorkOrder> = new Map();
  transactions: Map<string, Transaction> = new Map();

  constructor() {
    this.seedDefaultWorkers();
  }

  seedDefaultWorkers() {
    const defaultWorkers: User[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'alex.developer@example.com',
        paypal_email: 'alex.worker.paypal@example.com',
        rating: 4.95,
        current_workload: 0,
        is_available: true,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'sam.fullstack@example.com',
        paypal_email: 'sam.worker.paypal@example.com',
        rating: 4.88,
        current_workload: 1,
        is_available: true,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'jordan.engineer@example.com',
        paypal_email: 'jordan.worker.paypal@example.com',
        rating: 4.92,
        current_workload: 0,
        is_available: true,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'customer.demo@example.com',
        paypal_email: null,
        rating: 5.0,
        current_workload: 0,
        is_available: true,
      }
    ];

    for (const u of defaultWorkers) {
      this.users.set(u.id, u);
    }
  }
}

export const memoryStore = new InMemoryStore();

let pgPoolInstance: Pool | null = null;

export function getPgPool(): Pool | null {
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl || (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))) {
    return null;
  }

  if (!pgPoolInstance) {
    pgPoolInstance = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pgPoolInstance;
}

/**
 * Initialize PostgreSQL tables if connected to Neon / Postgres
 */
export async function initializeDatabaseSchema(): Promise<boolean> {
  const pool = getPgPool();
  if (!pool) {
    console.log('ℹ️ [Database] Running with in-memory resilient storage (DATABASE_URL not configured).');
    return false;
  }

  try {
    const schemaSql = `
      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          email TEXT UNIQUE,
          paypal_email TEXT,
          rating DECIMAL DEFAULT 0,
          current_workload INT DEFAULT 0,
          is_available BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS jobs (
          id UUID PRIMARY KEY,
          title TEXT,
          description TEXT,
          budget DECIMAL,
          status TEXT DEFAULT 'open',
          customer_id UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bids (
          id UUID PRIMARY KEY,
          job_id UUID REFERENCES jobs(id),
          worker_id UUID REFERENCES users(id),
          amount DECIMAL,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_orders (
          id UUID PRIMARY KEY,
          job_id UUID REFERENCES jobs(id),
          worker_id UUID REFERENCES users(id),
          bid_id UUID REFERENCES bids(id),
          status TEXT DEFAULT 'assigned',
          completion_deadline TIMESTAMP,
          completed_at TIMESTAMP,
          payment_status TEXT DEFAULT 'pending',
          customer_confirmed BOOLEAN DEFAULT FALSE,
          worker_marked_complete BOOLEAN DEFAULT FALSE
      );

      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS customer_confirmed BOOLEAN DEFAULT FALSE;
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS worker_marked_complete BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS transactions (
          id UUID PRIMARY KEY,
          work_order_id UUID REFERENCES work_orders(id),
          amount DECIMAL,
          status TEXT DEFAULT 'pending',
          paypal_payout_batch_id TEXT,
          created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    await pool.query(schemaSql);
    console.log('✅ [Database] PostgreSQL schema initialized successfully.');

    // Seed default workers in Postgres if empty
    const checkWorkers = await pool.query('SELECT COUNT(*) as count FROM users WHERE paypal_email IS NOT NULL');
    if (parseInt(checkWorkers.rows[0]?.count || '0', 10) === 0) {
      for (const worker of memoryStore.users.values()) {
        await pool.query(
          `INSERT INTO users (id, email, paypal_email, rating, current_workload, is_available)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [worker.id, worker.email, worker.paypal_email, worker.rating, worker.current_workload, worker.is_available]
        );
      }
      console.log('✅ [Database] Default workers seeded in PostgreSQL.');
    }

    return true;
  } catch (err: any) {
    console.warn('⚠️ [Database] Postgres schema init fallback notice:', err.message);
    return false;
  }
}

// Auto-initialize schema in background
initializeDatabaseSchema().catch(() => {});
