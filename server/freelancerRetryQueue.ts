import Queue from 'bull';
import { getPgPool, memoryStore } from './pgDatabase.js';
import { createFreelancerProject, getFreelancerConfig } from './freelancerApi.js';
import { logActivityEvent } from './activityLogger.js';

let freelancerSyncQueue: Queue.Queue | null = null;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize Bull Queue safely
try {
  freelancerSyncQueue = new Queue('freelancer-sync', redisUrl, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
    },
  });

  freelancerSyncQueue.process(async (job) => {
    const { jobId } = job.data;
    console.log(`🔄 [Bull Queue: freelancer-sync] Processing project creation retry for job: ${jobId} (Attempt ${job.attemptsMade + 1}/3)`);
    const success = await syncJobToFreelancer(jobId);
    if (!success && job.attemptsMade < 2) {
      throw new Error(`Freelancer sync retry failed for job ${jobId}. Bull will retry with exponential backoff.`);
    }
    return { success, jobId };
  });

  freelancerSyncQueue.on('failed', (job, err) => {
    console.warn(`⚠️ [Bull Queue: freelancer-sync] Job ${job.id} (app jobId: ${job.data?.jobId}) failed attempt ${job.attemptsMade}/3: ${err.message}`);
  });
} catch (err: any) {
  console.warn(`⚠️ [Bull Queue: freelancer-sync] Redis unavailable at ${redisUrl}. Using in-memory retry processor:`, err.message);
  freelancerSyncQueue = null;
}

/**
 * Syncs a specific job to the external freelancer platform and updates its external_id column
 */
export async function syncJobToFreelancer(jobId: string): Promise<boolean> {
  const pool = getPgPool();
  let jobData: { id: string; title: string; description: string; budget: number; external_id?: string | null } | null = null;

  if (pool) {
    try {
      const res = await pool.query('SELECT id, title, description, budget, external_id FROM jobs WHERE id = $1', [jobId]);
      if (res.rows.length > 0) {
        jobData = res.rows[0];
      }
    } catch (err: any) {
      console.warn('⚠️ [Freelancer Sync] Postgres query notice:', err.message);
    }
  }

  if (!jobData) {
    const memJob = memoryStore.jobs.get(jobId);
    if (memJob) {
      jobData = {
        id: memJob.id,
        title: memJob.title,
        description: memJob.description,
        budget: memJob.budget,
        external_id: memJob.external_id,
      };
    }
  }

  if (!jobData) {
    console.error(`❌ [Freelancer Sync] Job ${jobId} not found in DB or memory store.`);
    return false;
  }

  // Already has external_id
  if (jobData.external_id) {
    return true;
  }

  // Call the external freelancer API
  const syncResult = await createFreelancerProject({
    title: jobData.title,
    description: jobData.description,
    budget: Number(jobData.budget),
  });

  if (syncResult.success && syncResult.projectId) {
    const externalId = syncResult.projectId;

    // Update in Postgres
    if (pool) {
      try {
        await pool.query('UPDATE jobs SET external_id = $1 WHERE id = $2', [externalId, jobId]);
      } catch (err: any) {
        console.warn('⚠️ [Freelancer Sync] Postgres update notice:', err.message);
      }
    }

    // Update in Memory Store
    const memJob = memoryStore.jobs.get(jobId);
    if (memJob) {
      memJob.external_id = externalId;
      memoryStore.jobs.set(jobId, memJob);
    }

    logActivityEvent({
      source: 'SelfHealing',
      type: 'SYNC_REPAIRED',
      status: 'success',
      summary: `Auto-repaired external link for job "${jobData.title}" -> ${externalId}`,
      tags: ['self_healing', 'freelancer_sync', jobId],
    });

    console.log(`✅ [Freelancer Sync] Job ${jobId} successfully linked to external ID: ${externalId}`);
    return true;
  }

  return false;
}

/**
 * Enqueue a job for background sync to external freelancer platform
 */
export async function enqueueFreelancerJobSync(jobId: string): Promise<void> {
  if (freelancerSyncQueue) {
    try {
      await freelancerSyncQueue.add({ jobId }, { attempts: 5, backoff: { type: 'exponential', delay: 3000 } });
      return;
    } catch (err: any) {
      console.warn(`⚠️ [Bull Queue Enqueue Notice]`, err.message);
    }
  }

  // Fallback async retry execution
  setTimeout(async () => {
    try {
      await syncJobToFreelancer(jobId);
    } catch (e: any) {
      console.error(`⚠️ [In-Memory Retry] Sync failed for job ${jobId}:`, e.message);
    }
  }, 4000);
}

/**
 * Self-healing scanner: Finds all jobs with missing external_id and enqueues them
 */
export async function scanAndRetryMissingExternalJobs(): Promise<{
  scannedCount: number;
  fixedCount: number;
  missingJobIds: string[];
}> {
  const pool = getPgPool();
  const missingJobIds: string[] = [];

  if (pool) {
    try {
      const res = await pool.query('SELECT id FROM jobs WHERE external_id IS NULL OR external_id = \'\'');
      for (const row of res.rows) {
        missingJobIds.push(row.id);
      }
    } catch (err: any) {
      console.warn('⚠️ [Scan Missing External Jobs] Postgres query notice:', err.message);
    }
  }

  // Also check memory store
  for (const [id, job] of memoryStore.jobs.entries()) {
    if (!job.external_id && !missingJobIds.includes(id)) {
      missingJobIds.push(id);
    }
  }

  let fixedCount = 0;
  for (const id of missingJobIds) {
    await enqueueFreelancerJobSync(id);
    fixedCount++;
  }

  return {
    scannedCount: missingJobIds.length,
    fixedCount,
    missingJobIds,
  };
}
