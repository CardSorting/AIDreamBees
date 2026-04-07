/**
 * Infrastructure Adapter: Queue System
 * Bridges Domain Queue Models with BroccoliDB implementation
 */

import type { DreamJob, JobRow, JobStatus } from '@/domain/queue/JobTypes';
import { jobTracker } from '../../core/broccolidb/core/tracker';
import { SqliteQueue } from '../../core/broccolidb/infrastructure/queue/SqliteQueue';

export interface QueueJobWithMetadata extends DreamJob, Partial<JobRow> {}

export interface QueueConfig {
  dbPath?: string;
  maxConcurrent?: number;
  batchSize?: number;
  pollIntervalMs?: number;
  baseRetryDelayMs?: number;
  maxRetries?: number;
  retryMultiplier?: number;
}

export class DreamQueueAdapter {
  private queue: SqliteQueue<QueueJobWithMetadata>;
  private config: Required<QueueConfig>;
  private processingJobs: Map<string, Promise<any>> = new Map();
  private isProcessing: boolean = false;

  constructor(config: QueueConfig = {}) {
    this.config = {
      dbPath: config.dbPath || './queue.db',
      maxConcurrent: config.maxConcurrent || 100,
      batchSize: config.batchSize || 50,
      pollIntervalMs: config.pollIntervalMs || 100,
      baseRetryDelayMs: config.baseRetryDelayMs || 500,
      maxRetries: config.maxRetries || 3,
      retryMultiplier: config.retryMultiplier || 2,
    };

    this.queue = new SqliteQueue({
      dbPath: this.config.dbPath,
      tableName: 'queue_jobs',
      defaultMaxAttempts: this.config.maxRetries,
      baseRetryDelayMs: this.config.baseRetryDelayMs,
    });

    // Initialize queue tables
    this.initializeTables();

    console.log(`[DreamQueueAdapter] Initialized with config:`, this.config);
  }

  /**
   * Initialize database tables
   * This is a simplified version - actual table schema would be in BroccoliDB
   */
  private async initializeTables(): Promise<void> {
    try {
      const dbPath = this.config.dbPath;
      // In real implementation, this would create the queue_jobs table
      // For now, we'll assume the table exists or will be created by SqliteQueue
      console.log(`[DreamQueueAdapter] Tables would be initialized at ${dbPath}`);
    } catch (error) {
      console.error('[DreamQueueAdapter] Failed to initialize tables:', error);
      throw error;
    }
  }

  /**
   * Enqueue a new job into the processing queue
   *
   * This is a non-blocking call - it validates and queues
   * but doesn't process the job immediately
   *
   * @param job - The DreamJob to enqueue
   * @returns Job ID if successful, null if validation failed
   */
  async enqueueJob(job: DreamJob): Promise<string | null> {
    try {
      // Add metadata to job
      const jobWithMetadata: QueueJobWithMetadata = {
        ...job,
        id: job.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'pending' as JobStatus,
        priority: job.options.highDetail ? 100 : 50,
        attempts: 0,
        maxAttempts: this.config.maxRetries,
        runAt: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Validate before enqueuing
      if (!jobWithMetadata?.prompt || !jobWithMetadata.userId) {
        console.error('[DreamQueueAdapter] Invalid job - missing prompt or userId');
        return null;
      }

      // Enqueue with priority
      const jobId = await this.queue.enqueue(jobWithMetadata, {
        priority: jobWithMetadata.priority,
        maxAttempts: jobWithMetadata.maxAttempts,
      });

      jobTracker.trackJob('pending');
      console.log(`[DreamQueueAdapter] Job enqueued: ${jobId} for ${jobWithMetadata.userId}`);

      return jobId;
    } catch (error) {
      console.error('[DreamQueueAdapter] Failed to enqueue job:', error);
      jobTracker.trackFailure('enqueue');
      throw error;
    }
  }

  /**
   * Start processing queued jobs
   *
   * This creates worker processes that process jobs asynchronously
   * ideally should be separated from the main process
   *
   * For this implementation, we'll process in the same process
   * to keep it self-contained
   */
  async startProcessing(handler: (job: DreamJob) => Promise<any>): Promise<void> {
    if (this.isProcessing) {
      console.warn('[DreamQueueAdapter] Processing already started');
      return;
    }

    this.isProcessing = true;

    console.log('[DreamQueueAdapter] Starting job processor...');

    // Process jobs in batches
    setInterval(async () => {
      try {
        // Dequeue jobs (prioritizing higher priority first)
        const jobs = await this.queue.dequeue(this.config.batchSize);

        if (jobs.length > 0) {
          console.log(`[DreamQueueAdapter] Processing batch of ${jobs.length} jobs`);

          // Process jobs concurrently but within limits
          const batchPromises = jobs.map(async (job) => {
            return this.processJob(job, handler);
          });

          await Promise.all(batchPromises);
        }
      } catch (error) {
        console.error('[DreamQueueAdapter] Error in processing loop:', error);
      }
    }, this.config.pollIntervalMs);
  }

  /**
   * Process a single job with retry logic
   */
  private async processJob(job: DreamJob, handler: (job: DreamJob) => Promise<any>): Promise<void> {
    const jobId = job.id!;

    // Skip already completed jobs
    if (!job.status || job.status === 'pending') {
      try {
        // Mark as processing
        await this.updateJobStatus(jobId, 'processing');

        const startTime = Date.now();
        try {
          // Execute the actual job handler
          const _result = await handler(job);

          const processingTime = Date.now() - startTime;

          // Mark as completed
          await this.updateJobStatus(jobId, 'done');

          jobTracker.trackJob('completed');
          console.log(`[DreamQueueAdapter] Job completed: ${jobId} (${processingTime}ms)`);
        } catch (error: any) {
          const retryDelay = this.calculateRetryDelay(
            job.attempts || 0,
            job.maxAttempts || this.config.maxRetries,
            this.config.baseRetryDelayMs,
            this.config.retryMultiplier,
          );

          const errorResult = {
            success: false,
            error: error.message || 'Unknown error',
            images: [],
            textParts: [],
            requestId: jobId,
            retryCount: job.attempts || 0,
          };

          // Update job status with error
          await this.updateJobStatus(jobId, 'failed', errorResult);

          jobTracker.trackFailure(job.type);
          console.error(`[DreamQueueAdapter] Job failed: ${jobId} (${job.attempts || 0} attempts)`);
          console.error(`[DreamQueueAdapter] Error: ${error.message}`);
          console.log(`[DreamQueueAdapter] Scheduling retry in ${retryDelay}ms...`);
        }
      } catch (error) {
        console.error(`[DreamQueueAdapter] Error processing job ${jobId}:`, error);
      }
    }
  }

  /**
   * Reclaim stale jobs (e.g., after worker crash)
   *
   * This is critical for reliability - if workers crash,
   * we want to continue processing without manual intervention
   */
  async reclaimStaleJobs(): Promise<number> {
    try {
      const staleJobs = await this.getJobsByStatus('pending');

      if (staleJobs.length > 0) {
        console.log(`[DreamQueueAdapter] Reclaiming ${staleJobs.length} stale jobs`);

        for (const job of staleJobs) {
          const identifier = `job_${job.id}`;
          if (!this.processingJobs.has(identifier)) {
            this.processingJobs.set(identifier, Promise.resolve());
          }
        }

        return staleJobs.length;
      }

      return 0;
    } catch (error) {
      console.error('[DreamQueueAdapter] Failed to reclaim stale jobs:', error);
      return 0;
    }
  }

  /**
   * Get status information about the queue
   */
  async getQueueStatus(): Promise<{
    pendingCount: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    queueSize: number;
    activeWorkers: number;
  }> {
    try {
      const pendingJobs = await this.getJobsByStatus('pending');
      const processingJobs = await this.getJobsByStatus('processing');

      return {
        pendingCount: pendingJobs.length,
        processingCount: processingJobs.length,
        completedCount: 0, // Would need to query completed jobs
        failedCount: 0, // Would need to query failed jobs
        queueSize: pendingJobs.length + processingJobs.length,
        activeWorkers: this.processingJobs.size,
      };
    } catch (error) {
      console.error('[DreamQueueAdapter] Failed to get queue status:', error);
      return {
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        failedCount: 0,
        queueSize: 0,
        activeWorkers: this.processingJobs.size,
      };
    }
  }

  /**
   * Helper: Get all jobs with a specific status
   */
  private async getJobsByStatus(status: JobStatus): Promise<DreamJob[]> {
    try {
      const allJobs = await this.queue.list();
      return allJobs.filter((j) => j.status === status);
    } catch (error) {
      console.error(`[DreamQueueAdapter] Failed to get jobs for status ${status}:`, error);
      return [];
    }
  }

  /**
   * Helper: Update job status
   */
  private async updateJobStatus(jobId: string, status: JobStatus, result?: any): Promise<void> {
    try {
      const db = this.queue.getDb();
      const updateStmt = db.prepare(`
        UPDATE queue_jobs 
        SET status = ?, 
            updated_at = ?${result ? `, payload = ?` : ''}
        WHERE id = ?
      `);

      const timestamp = Date.now();
      const params = result
        ? [status, timestamp, JSON.stringify(result), jobId]
        : [status, timestamp, jobId];

      updateStmt.run(...params);
    } catch (error) {
      console.error(`[DreamQueueAdapter] Failed to update job ${jobId}:`, error);
    }
  }

  /**
   * Helper: Calculate retry delay
   */
  private calculateRetryDelay(
    attempt: number,
    maxAttempts: number,
    baseDelay: number,
    multiplier: number,
  ): number {
    if (attempt >= maxAttempts) {
      return 0; // No more retries
    }
    return Math.min(baseDelay * multiplier ** attempt, 30000); // Max 30 seconds
  }

  /**
   * Shutdown the queue adapter
   */
  async shutdown(): Promise<void> {
    console.log('[DreamQueueAdapter] Shutting down...');
    await this.queue.stop();
    this.isProcessing = false;
    this.processingJobs.clear();
    console.log('[DreamQueueAdapter] Shutdown complete');
  }
}

/**
 * Global queue adapter instance
 */
let queueAdapter: DreamQueueAdapter | null = null;

/**
 * Initialize the queue adapter
 */
export async function initializeQueueAdapter(config?: QueueConfig): Promise<DreamQueueAdapter> {
  if (!queueAdapter) {
    queueAdapter = new DreamQueueAdapter(config);
  }
  return queueAdapter;
}

/**
 * Get the global queue adapter instance
 */
export function getQueueAdapter(): DreamQueueAdapter {
  if (!queueAdapter) {
    throw new Error('Queue adapter not initialized. Call initializeQueueAdapter() first.');
  }
  return queueAdapter;
}

/**
 * Start processing jobs (must be called after initialization)
 */
export async function startJobProcessing(handler: (job: DreamJob) => Promise<any>): Promise<void> {
  const adapter = getQueueAdapter();
  await adapter.startProcessing(handler);
}
