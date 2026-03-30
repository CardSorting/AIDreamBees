import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { dbPool, BufferedDbPool } from '../db/BufferedDbPool.js';

export interface QueueJob<T> {
  id: string;
  payload: T;
  status: 'pending' | 'processing' | 'done' | 'failed';
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type JobHandler<T> = (job: QueueJob<T>) => Promise<void>;

export interface SqliteQueueOptions {
  dbPath?: string;
  tableName?: string;
  visibilityTimeoutMs?: number;
  pruneDoneAgeMs?: number;
  defaultMaxAttempts?: number;
  baseRetryDelayMs?: number;
}

/**
 * SqliteQueue provides a hardened, production-grade background job processor.
 * It uses BufferedDbPool for high-throughput, buffered database operations.
 */
export class SqliteQueue<T> {
  private isProcessing = false;
  private stopRequested = false;
  private wakeUpEmitter = new EventEmitter();

  private visibilityTimeoutMs: number;
  private pruneDoneAgeMs: number;
  private defaultMaxAttempts: number;
  private baseRetryDelayMs: number;
  private dbPath?: string;
  private tableName?: string;

  constructor(options: SqliteQueueOptions = {}) {
    const {
      visibilityTimeoutMs = 300000, // 5 minutes default
      pruneDoneAgeMs = 86400000, // 24 hours default
      defaultMaxAttempts = 5,
      baseRetryDelayMs = 1000,
      dbPath,
      tableName,
    } = options;

    this.visibilityTimeoutMs = visibilityTimeoutMs;
    this.pruneDoneAgeMs = pruneDoneAgeMs;
    this.defaultMaxAttempts = defaultMaxAttempts;
    this.baseRetryDelayMs = baseRetryDelayMs;
    this.dbPath = dbPath;
    this.tableName = tableName;
  }

  /**
   * Enqueue a new job with optional priority and delay.
   */
  async enqueue(
    payload: T,
    options: {
      id?: string;
      priority?: number;
      delayMs?: number;
      maxAttempts?: number;
    } = {},
  ): Promise<string> {
    const jobId = options.id || crypto.randomUUID();
    const now = Date.now();
    const runAt = now + (options.delayMs || 0);
    const maxAttempts = options.maxAttempts ?? this.defaultMaxAttempts;

    await dbPool.push({
      type: 'upsert',
      table: 'queue_jobs',
      values: {
        id: jobId,
        payload: JSON.stringify(payload),
        status: 'pending',
        priority: options.priority || 0,
        attempts: 0,
        maxAttempts,
        runAt,
        createdAt: now,
        updatedAt: now,
        error: null,
      },
      where: { column: 'id', value: jobId },
      layer: 'infrastructure',
    });
    this.wakeUpEmitter.emit('enqueue');
    return jobId;
  }

  /**
   * Enqueue multiple jobs in a single transaction for high throughput.
   */
  async enqueueBatch(
    items: { payload: T; priority?: number; delayMs?: number; id?: string }[],
  ): Promise<string[]> {
    const ids: string[] = [];
    const now = Date.now();
    const ops = items.map((item) => {
      const jobId = item.id || crypto.randomUUID();
      const runAt = now + (item.delayMs || 0);
      ids.push(jobId);
      return {
        type: 'insert' as const,
        table: 'queue_jobs' as const,
        values: {
          id: jobId,
          payload: JSON.stringify(item.payload),
          status: 'pending' as const,
          priority: item.priority || 0,
          attempts: 0,
          maxAttempts: this.defaultMaxAttempts,
          runAt,
          createdAt: now,
          updatedAt: now,
          error: null,
        },
        layer: 'infrastructure' as const,
      };
    });

    await dbPool.pushBatch(ops);
    this.wakeUpEmitter.emit('enqueue');
    return ids;
  }

  /**
   * Dequeue multiple jobs atomically using a transaction.
   */
  async dequeueBatch(limit: number): Promise<QueueJob<T>[]> {
    const now = Date.now();
    try {
      return await dbPool.runTransaction(async (agentId) => {
        const jobs = await dbPool.selectWhere(
          'queue_jobs',
          [
            { column: 'status', value: 'pending' },
            { column: 'runAt', value: now, operator: '<=' },
          ],
          agentId,
          {
            orderBy: { column: 'priority', direction: 'desc' },
            limit,
          },
        );

        if (jobs.length === 0) return [];

        const ids = jobs.map((j) => j.id);
        const nowMs = Date.now();
        await dbPool.push(
          {
            type: 'update',
            table: 'queue_jobs',
            values: {
              status: 'processing',
              updatedAt: nowMs,
              attempts: BufferedDbPool.increment(1),
            },
            where: { column: 'id', value: ids, operator: 'IN' },
            layer: 'infrastructure',
          },
          agentId,
        );

        return jobs.map((job) => ({
          ...job,
          payload: JSON.parse(job.payload) as T,
          updatedAt: nowMs,
          attempts: job.attempts + 1,
          status: 'processing' as const,
        })) as unknown as QueueJob<T>[];
      });
    } catch (e) {
      console.error('[SqliteQueue] DequeueBatch failed:', e);
      return [];
    }
  }

  /**
   * Recovers jobs that were stuck in 'processing' (e.g., process crashed).
   */
  async reclaimStaleJobs(): Promise<number> {
    const now = Date.now();
    const threshold = now - this.visibilityTimeoutMs;

    const staleJobs = await dbPool.selectWhere('queue_jobs', [
      { column: 'status', value: 'processing' },
      { column: 'updatedAt', value: threshold, operator: '<' },
    ]);

    if (staleJobs.length === 0) return 0;

    const nowMs = Date.now();
    await dbPool.pushBatch(
      staleJobs.map((job) => ({
        type: 'update',
        table: 'queue_jobs',
        values: { status: 'pending', updatedAt: nowMs },
        where: { column: 'id', value: job.id },
        layer: 'infrastructure',
      })),
    );

    console.warn(`[SqliteQueue] Reclaiming ${staleJobs.length} stale jobs.`);
    return staleJobs.length;
  }

  /**
   * Mark multiple jobs as completed in a single high-throughput update.
   */
  async completeBatch(ids: string[]) {
    if (ids.length === 0) return;
    const now = Date.now();
    await dbPool.push({
      type: 'update',
      table: 'queue_jobs',
      values: { status: 'done', updatedAt: now },
      where: { column: 'id', value: ids, operator: 'IN' },
      layer: 'infrastructure',
    });
  }

  /**
   * Completed task handling.
   */
  async complete(id: string) {
    const now = Date.now();
    await dbPool.push({
      type: 'update',
      table: 'queue_jobs',
      values: { status: 'done', updatedAt: now },
      where: { column: 'id', value: id },
      layer: 'infrastructure',
    });
  }

  /**
   * Failure handling with exponential backoff.
   */
  async fail(id: string, error: string) {
    const now = Date.now();
    const job = await dbPool.selectOne('queue_jobs', { column: 'id', value: id });

    if (!job) return;

    if (job.attempts < job.maxAttempts) {
      // Exponential backoff: 2^attempts * baseDelay
      const nextDelay = 2 ** (job.attempts - 1) * this.baseRetryDelayMs;
      const nextRun = now + nextDelay;

      await dbPool.push({
        type: 'update',
        table: 'queue_jobs',
        values: { status: 'pending', runAt: nextRun, error, updatedAt: now },
        where: { column: 'id', value: id },
        layer: 'infrastructure',
      });

      console.warn(`[SqliteQueue] Job ${id} failed. Retrying in ${nextDelay}ms...`);
    } else {
      // Permanently failed (DLQ-equivalent)
      await dbPool.push({
        type: 'update',
        table: 'queue_jobs',
        values: { status: 'failed', error, updatedAt: now },
        where: { column: 'id', value: id },
        layer: 'infrastructure',
      });

      console.error(`[SqliteQueue] Job ${id} failed permanently after ${job.attempts} attempts.`);
    }
  }

  /**
   * Health check and automated maintenance.
   */
  async performMaintenance(): Promise<void> {
    const now = Date.now();

    try {
      await dbPool.runTransaction(async (agentId) => {
        const lastMaint = await dbPool.selectOne(
          'queue_settings',
          { column: 'key', value: 'last_maintenance' },
          agentId,
        );
        if (lastMaint && now - Number(lastMaint.value) < 10000) return; // Only once every 10s

        await dbPool.push(
          {
            type: 'upsert',
            table: 'queue_settings',
            values: { key: 'last_maintenance', value: String(now), updatedAt: now },
            where: { column: 'key', value: 'last_maintenance' },
            layer: 'infrastructure',
          },
          agentId,
        );

        // 1. Reclaim stale jobs
        await this.reclaimStaleJobs();

        // 2. Prune old 'done' jobs
        const pruneThreshold = now - this.pruneDoneAgeMs;
        const oldJobs = await dbPool.selectWhere(
          'queue_jobs',
          [
            { column: 'status', value: 'done' },
            { column: 'updatedAt', value: pruneThreshold, operator: '<' },
          ],
          agentId,
        );

        if (oldJobs.length > 0) {
          await dbPool.pushBatch(
            oldJobs.map((j) => ({
              type: 'delete',
              table: 'queue_jobs',
              where: { column: 'id', value: j.id },
              layer: 'infrastructure',
            })),
            agentId,
          );
          console.log(`[SqliteQueue] Pruned ${oldJobs.length} old completed jobs.`);
        }
      });
    } catch (e) {
      console.error('[SqliteQueue] Maintenance failed:', e);
    }
  }

  /**
   * Main processing loop with fluid concurrency and high-throughput batching.
   */
  async process(
    handler: JobHandler<T>,
    options: { concurrency?: number; pollIntervalMs?: number; batchSize?: number } = {},
  ) {
    const { concurrency = 10, pollIntervalMs = 100, batchSize = 100 } = options;
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.stopRequested = false;

    // Background maintenance loop (every 30s)
    const maintenanceInterval = setInterval(() => this.performMaintenance(), 30000);

    let activeWorkers = 0;
    let pendingCompletions: string[] = [];
    let completionTimeout: NodeJS.Timeout | null = null;

    const flushCompletions = async () => {
      if (pendingCompletions.length > 0) {
        const ids = [...pendingCompletions];
        pendingCompletions = [];
        await this.completeBatch(ids);
      }
      completionTimeout = null;
    };

    const scheduleCompletion = (id: string) => {
      pendingCompletions.push(id);
      if (pendingCompletions.length >= batchSize) {
        if (completionTimeout) clearTimeout(completionTimeout);
        flushCompletions().catch(console.error);
      } else if (!completionTimeout) {
        completionTimeout = setTimeout(() => flushCompletions(), 10);
      }
    };

    const runWorker = async () => {
      while (!this.stopRequested) {
        if (activeWorkers >= concurrency) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          continue;
        }

        const limit = Math.min(batchSize, concurrency - activeWorkers);
        const jobs = await this.dequeueBatch(limit);

        if (jobs.length > 0) {
          for (const job of jobs) {
            activeWorkers++;
            (async () => {
              try {
                await handler(job);
                scheduleCompletion(job.id);
              } catch (err: unknown) {
                const error = err instanceof Error ? err.message : String(err);
                await this.fail(job.id, error);
              } finally {
                activeWorkers--;
              }
            })();
          }
          // Micro-tick to keep loop moving
          await new Promise((resolve) => setImmediate(resolve));
        } else {
          // No jobs, wait for signal or interval
          await Promise.race([
            new Promise((resolve) => setTimeout(resolve, pollIntervalMs)),
            new Promise((resolve) => this.wakeUpEmitter.once('enqueue', resolve)),
          ]);
        }
      }
    };

    const worker = runWorker();

    const cleanup = () => {
      clearInterval(maintenanceInterval);
      if (completionTimeout) clearTimeout(completionTimeout);
      this.isProcessing = false;
    };

    worker.then(cleanup).catch(cleanup);
  }

  stop() {
    this.stopRequested = true;
    this.isProcessing = false;
  }

  async size(): Promise<number> {
    const pendingJobs = await dbPool.selectWhere('queue_jobs', { column: 'status', value: 'pending' });
    return pendingJobs.length;
  }

  async getMetrics() {
    const allJobs = await dbPool.selectWhere('queue_jobs', []);
    return {
      pending: allJobs.filter((j) => j.status === 'pending').length,
      processing: allJobs.filter((j) => j.status === 'processing').length,
      done: allJobs.filter((j) => j.status === 'done').length,
      failed: allJobs.filter((j) => j.status === 'failed').length,
    };
  }

  async close() {
    this.stop();
  }
}
