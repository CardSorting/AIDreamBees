import * as crypto from 'node:crypto';
import Database from 'better-sqlite3';

export interface QueueJob<T> {
  id: string;
  payload: T;
  status: 'pending' | 'processing' | 'done' | 'failed';
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type JobHandler<T> = (job: QueueJob<T>) => Promise<void>;

export interface SqliteQueueOptions {
  dbPath?: string;
  tableName?: string;
  busyTimeout?: number;
  visibilityTimeoutMs?: number;
  pruneDoneAgeMs?: number;
  defaultMaxAttempts?: number;
  baseRetryDelayMs?: number;
}

interface JobRow {
  id: string;
  payload: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface CountRow {
  count: number;
}

/**
 * SqliteQueue provides a hardened, production-grade background job processor.
 * It ensures "at-least-once" delivery via visibility timeouts and supports
 * priorities, delayed execution, and exponential backoff.
 */
export class SqliteQueue<T> {
  private db: Database.Database;
  private tableName: string;
  private isProcessing = false;
  private stopRequested = false;

  private visibilityTimeoutMs: number;
  private pruneDoneAgeMs: number;
  private defaultMaxAttempts: number;
  private baseRetryDelayMs: number;

  constructor(options: SqliteQueueOptions = {}) {
    const {
      dbPath = ':memory:',
      tableName = 'queue_jobs',
      busyTimeout = 10000,
      visibilityTimeoutMs = 300000, // 5 minutes default
      pruneDoneAgeMs = 86400000, // 24 hours default
      defaultMaxAttempts = 5,
      baseRetryDelayMs = 1000,
    } = options;

    this.db = new Database(dbPath);
    this.db.pragma(`busy_timeout = ${busyTimeout}`);
    this.tableName = tableName;

    this.visibilityTimeoutMs = visibilityTimeoutMs;
    this.pruneDoneAgeMs = pruneDoneAgeMs;
    this.defaultMaxAttempts = defaultMaxAttempts;
    this.baseRetryDelayMs = baseRetryDelayMs;

    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        maxAttempts INTEGER DEFAULT 5,
        runAt BIGINT,
        error TEXT,
        createdAt BIGINT,
        updatedAt BIGINT
      );
      
      -- Indices for high-throughput polling
      CREATE INDEX IF NOT EXISTS idx_poll_order ON ${this.tableName}(status, runAt, priority DESC, createdAt ASC);
      CREATE INDEX IF NOT EXISTS idx_cleanup ON ${this.tableName}(status, updatedAt);

      -- Coordination table for distributed maintenance
      CREATE TABLE IF NOT EXISTS queue_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt BIGINT
      );
    `);

    // Performance optimizations
    this.db.pragma('journal_mode = WAL');
    // Use synchronous = NORMAL for better durability with WAL
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456'); // 256MB mmap
  }

  /**
   * Enqueue a new job with optional priority and delay.
   */
  enqueue(
    payload: T,
    options: {
      id?: string;
      priority?: number;
      delayMs?: number;
      maxAttempts?: number;
    } = {},
  ): string {
    const jobId = options.id || crypto.randomUUID();
    const now = Date.now();
    const runAt = now + (options.delayMs || 0);
    const maxAttempts = options.maxAttempts ?? this.defaultMaxAttempts;

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (id, payload, status, priority, attempts, maxAttempts, runAt, createdAt, updatedAt)
      VALUES (?, ?, 'pending', ?, 0, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        status = 'pending',
        priority = excluded.priority,
        runAt = excluded.runAt,
        updatedAt = excluded.updatedAt
    `);

    stmt.run(jobId, JSON.stringify(payload), options.priority || 0, maxAttempts, runAt, now, now);
    return jobId;
  }

  /**
   * Enqueue multiple jobs in a single transaction for high throughput.
   */
  enqueueBatch(
    items: { payload: T; priority?: number; delayMs?: number; id?: string }[],
  ): string[] {
    const ids: string[] = [];
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (id, payload, status, priority, attempts, maxAttempts, runAt, createdAt, updatedAt)
      VALUES (?, ?, 'pending', ?, 0, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      for (const item of items) {
        const jobId = item.id || crypto.randomUUID();
        const runAt = now + (item.delayMs || 0);
        ids.push(jobId);
        stmt.run(
          jobId,
          JSON.stringify(item.payload),
          item.priority || 0,
          this.defaultMaxAttempts,
          runAt,
          now,
          now,
        );
      }
    })();
    return ids;
  }

  /**
   * Dequeue multiple jobs atomically in a single transaction.
   * Useful for high-throughput consumers that can handle batches.
   */
  dequeueBatch(limit: number): QueueJob<T>[] {
    const now = Date.now();
    try {
      return this.db.transaction(() => {
        const jobs = this.db
          .prepare(`
          SELECT * FROM ${this.tableName}
          WHERE status = 'pending' AND runAt <= ?
          ORDER BY priority DESC, createdAt ASC
          LIMIT ?
        `)
          .all(now, limit) as JobRow[];

        if (jobs.length === 0) return [];

        const ids = jobs.map((j) => j.id);
        this.db
          .prepare(`
          UPDATE ${this.tableName}
          SET status = 'processing', updatedAt = ?, attempts = attempts + 1
          WHERE id IN (${ids.map(() => '?').join(',')})
        `)
          .run(now, ...ids);

        return jobs.map((job) => ({
          ...job,
          payload: JSON.parse(job.payload) as T,
          updatedAt: now,
          attempts: job.attempts + 1,
          status: 'processing' as const,
        }));
      })();
    } catch (e) {
      console.error('[SqliteQueue] DequeueBatch failed:', e);
      return [];
    }
  }

  /**
   * Atomic dequeue supporting priority and runAt scheduling.
   */
  dequeue(): QueueJob<T> | null {
    const now = Date.now();
    try {
      return this.db.transaction(() => {
        // Find next eligible job
        const job = this.db
          .prepare(`
          SELECT * FROM ${this.tableName}
          WHERE status = 'pending' AND runAt <= ?
          ORDER BY priority DESC, createdAt ASC
          LIMIT 1
        `)
          .get(now) as JobRow | undefined;

        if (!job) return null;

        // Mark as processing
        this.db
          .prepare(`
          UPDATE ${this.tableName}
          SET status = 'processing', updatedAt = ?, attempts = attempts + 1
          WHERE id = ?
        `)
          .run(now, job.id);

        return {
          ...job,
          payload: JSON.parse(job.payload) as T,
          updatedAt: now,
          attempts: job.attempts + 1,
          status: 'processing' as const,
        };
      })();
    } catch (e) {
      console.error('[SqliteQueue] Dequeue failed:', e);
      return null;
    }
  }

  /**
   * Recovers jobs that were stuck in 'processing' (e.g., process crashed).
   */
  reclaimStaleJobs(): number {
    const now = Date.now();
    const threshold = now - this.visibilityTimeoutMs;

    const result = this.db
      .prepare(`
      UPDATE ${this.tableName}
      SET status = 'pending', updatedAt = ?
      WHERE status = 'processing' AND updatedAt < ?
    `)
      .run(now, threshold);

    if (result.changes > 0) {
      console.warn(`[SqliteQueue] Reclaimed ${result.changes} stale jobs.`);
    }
    return result.changes;
  }

  /**
   * Mark multiple jobs as completed in a single transaction.
   */
  completeBatch(ids: string[]) {
    if (ids.length === 0) return;
    const now = Date.now();
    this.db.transaction(() => {
      const stmt = this.db.prepare(`
        UPDATE ${this.tableName}
        SET status = 'done', updatedAt = ?
        WHERE id = ?
      `);
      for (const id of ids) {
        stmt.run(now, id);
      }
    })();
  }

  /**
   * Completed task handling.
   */
  complete(id: string) {
    const now = Date.now();
    this.db
      .prepare(`
      UPDATE ${this.tableName}
      SET status = 'done', updatedAt = ?
      WHERE id = ?
    `)
      .run(now, id);
  }

  /**
   * Failure handling with exponential backoff.
   */
  fail(id: string, error: string) {
    const now = Date.now();
    const job = this.db
      .prepare(`SELECT attempts, maxAttempts FROM ${this.tableName} WHERE id = ?`)
      .get(id) as { attempts: number; maxAttempts: number } | undefined;

    if (!job) return;

    if (job.attempts < job.maxAttempts) {
      // Exponential backoff: 2^attempts * baseDelay
      const nextDelay = 2 ** (job.attempts - 1) * this.baseRetryDelayMs;
      const nextRun = now + nextDelay;

      this.db
        .prepare(`
        UPDATE ${this.tableName}
        SET status = 'pending', runAt = ?, error = ?, updatedAt = ?
        WHERE id = ?
      `)
        .run(nextRun, error, now, id);

      console.warn(`[SqliteQueue] Job ${id} failed. Retrying in ${nextDelay}ms...`);
    } else {
      // Permanently failed (DLQ-equivalent)
      this.db
        .prepare(`
        UPDATE ${this.tableName}
        SET status = 'failed', error = ?, updatedAt = ?
        WHERE id = ?
      `)
        .run(error, now, id);

      console.error(`[SqliteQueue] Job ${id} failed permanently after ${job.attempts} attempts.`);
    }
  }

  /**
   * Health check and automated maintenance.
   * Uses a coordination lock to ensure only one process performs maintenance.
   */
  performMaintenance(): void {
    const now = Date.now();

    try {
      this.db.transaction(() => {
        const lastMaint = this.db
          .prepare(`SELECT value FROM queue_settings WHERE key = 'last_maintenance'`)
          .get() as { value: string } | undefined;
        if (lastMaint && now - Number(lastMaint.value) < 10000) return; // Only once every 10s

        this.db
          .prepare(
            `REPLACE INTO queue_settings (key, value, updatedAt) VALUES ('last_maintenance', ?, ?)`,
          )
          .run(String(now), now);

        // 1. Reclaim stale jobs
        this.reclaimStaleJobs();

        // 2. Prune old 'done' jobs
        const pruneThreshold = now - this.pruneDoneAgeMs;
        const result = this.db
          .prepare(`
          DELETE FROM ${this.tableName}
          WHERE status = 'done' AND updatedAt < ?
        `)
          .run(pruneThreshold);

        if (result.changes > 0) {
          console.log(`[SqliteQueue] Pruned ${result.changes} old completed jobs.`);
        }
      })();

      // 3. WAL Checkpoint (Passive) to keep shm/wal sizes small
      this.db.pragma('wal_checkpoint(PASSIVE)');
    } catch (e) {
      console.error('[SqliteQueue] Maintenance failed:', e);
    }
  }

  /**
   * Main processing loop.
   */
  async process(
    handler: JobHandler<T>,
    options: { concurrency?: number; pollIntervalMs?: number } = {},
  ) {
    const { concurrency = 1, pollIntervalMs = 50 } = options;
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.stopRequested = false;

    // Background maintenance loop (every 30s)
    const maintenanceInterval = setInterval(() => this.performMaintenance(), 30000);

    const runWorker = async () => {
      while (!this.stopRequested) {
        const job = this.dequeue();
        if (job) {
          try {
            await handler(job);
            this.complete(job.id);
          } catch (err: unknown) {
            this.fail(job.id, err instanceof Error ? err.message : String(err));
          }
          // Micro-tick for high throughput
          await new Promise((resolve) => setImmediate(resolve));
        } else {
          // No jobs, wait for interval
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }
    };

    // Spawn workers
    const workers = Array.from({ length: concurrency }, () => runWorker());

    // Cleanup on stop
    const cleanup = () => {
      clearInterval(maintenanceInterval);
    };

    // Allow awaiting the whole process if needed (rare for server apps)
    Promise.all(workers).then(cleanup).catch(cleanup);
  }

  stop() {
    this.stopRequested = true;
    this.isProcessing = false;
  }

  size(): number {
    return (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = 'pending'`)
        .get() as CountRow
    ).count;
  }

  getMetrics() {
    return {
      pending: (
        this.db
          .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = 'pending'`)
          .get() as CountRow
      ).count,
      processing: (
        this.db
          .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = 'processing'`)
          .get() as CountRow
      ).count,
      done: (
        this.db
          .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = 'done'`)
          .get() as CountRow
      ).count,
      failed: (
        this.db
          .prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = 'failed'`)
          .get() as CountRow
      ).count,
    };
  }

  close() {
    this.stop();
    this.db.close();
  }
}
