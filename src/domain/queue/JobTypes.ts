/**
 * Domain Models for Queue System
 * Pure business logic representations
 */

export interface DreamJob {
  /** Unique job identifier */
  id: string;

  /** Type of operation to perform */
  type: 'dream' | 'grid' | 'imagine';

  /** User's prompt text */
  prompt: string;

  /** User ID identifier */
  userId: string;

  /** Platform where the request originated */
  platform: 'discord' | 'telegram' | 'api';

  /** Channel/thread ID for responses */
  channel?: string;

  /** Original Discord message ID (for sending results back) */
  messageSourceId?: string;

  /** Job configuration options */
  options: {
    useGrid?: boolean;
    highDetail?: boolean;
    cinematic?: boolean;
    gridSize?: number;
  };

  /** Optional constraints */
  constraints?: {
    maxImages?: number;
    timeoutMs?: number;
  };

  /** Metadata */
  createdAt?: number;
  lastAttemptAt?: number;
}

export interface ProcessingResult {
  /** Was the processing successful? */
  success: boolean;

  /** Generated text parts (for grid variations) */
  textParts: string[];

  /** Generated image URLs (base64 or paths) */
  images: string[];

  /** Original input images (for grounding) */
  sourceImages?: string[];

  /** Request that triggered this result */
  requestId: string;

  /** Number of retry attempts made */
  retryCount?: number;

  /** Processing error if failed */
  error?: string;

  /** Metrics for the processing */
  metrics?: {
    latencyMs: number;
    autogroundingEfficiency?: number;
    textLength?: number;
  };
}

export interface JobEvent {
  /** Type of event */
  type: 'enqueued' | 'processing' | 'completed' | 'failed' | 'retryScheduled';

  /** The job associated with this event */
  job: DreamJob;

  /** Additional payload based on event type */
  payload?: ProcessingResult | Error;

  /** Event timestamp */
  timestamp: number;

  /** Event ID for tracking */
  eventId?: string;
}

export interface QueueConfig {
  /** Maximum concurrent jobs per worker */
  maxConcurrent: number;

  /** Batch size for processing */
  batchSize: number;

  /** Time between queue polls (ms) */
  pollIntervalMs: number;

  /** Base retry delay (ms) */
  baseRetryDelayMs: number;

  /** Maximum retry attempts */
  maxRetries: number;

  /** Retry backoff multiplier */
  retryMultiplier: number;

  /** Grace period for stale jobs (ms) */
  staleJobGracePeriodMs?: number;
}

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface JobRow {
  id: string;
  payload: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
}
