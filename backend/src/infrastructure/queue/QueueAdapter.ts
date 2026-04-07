import type { SqliteQueue } from '../broccolidb/infrastructure/queue/SqliteQueue.js';
import type { DreamJob } from '@/src/domain/queue/JobTypes.js';

/**
 * Factory function to initialize QueueAdapter
 * Creates and returns a configured QueueAdapter instance
 */
export async function initializeQueueAdapter() {
  const { pool } = await import('../broccolidb/infrastructure/db/BufferedDbPool.js');
  const { SqliteQueue } = await import('../broccolidb/infrastructure/queue/SqliteQueue.js');
  const { DreamJob } = await import('@/src/domain/queue/JobTypes.js');
  
  const queue = new SqliteQueue('dreambees_queue.db', 'dreambees_queue');
  await queue.connect();
  
  return new QueueAdapter(queue);
}

/**
 * QueueAdapter wraps broccolidb's SqliteQueue with DreamBees domain types
 * This is the infrastructure bridge between the queue implementation and domain logic
 */
export class QueueAdapter {
  private queue: SqliteQueue<DreamJob>;

  constructor(queue: SqliteQueue<DreamJob>) {
    this.queue = queue;
  }

  /**
   * Enqueue a new dream job
   */
  async enqueue(job: DreamJob): Promise<string> {
    return this.queue.enqueue(job, {
      priority: 0,
      delayMs: 0,
    });
  }

  /**
   * Enqueue a batch of jobs
   */
  async enqueueBatch(jobs: DreamJob[]): Promise<string[]> {
    return this.queue.enqueueBatch(
      jobs.map((j) => ({
        ...j,
        payload: j.payload,
      })),
    );
  }

  /**
   * Get queue size (pending jobs)
   */
  async getSize(): Promise<number> {
    return this.queue.size();
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<{
    pending: number;
    processing: number;
    done: number;
    failed: number;
  }> {
    return this.queue.getMetrics();
  }

  /**
   * Shutdown the queue adapter gracefully
   */
  async shutdown(): Promise<void> {
    this.queue.close();
  }

  /**
   * Expose underlying queue for custom operations if needed
   */
  get queue(): SqliteQueue<DreamJob> {
    return this.queue;
  }
}