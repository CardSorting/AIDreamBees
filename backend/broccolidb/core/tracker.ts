/**
 * Telemetry Queue for DreamBees Background Processing
 * Monitors job processing metrics and health
 */

import { EventEmitter } from "node:events";

EventEmitter.defaultMaxListeners = 1000;

export interface QueueMetrics {
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  queueSize: number;
  averageProcessingTime: number;
  lastMaintenanceTime: number;
}

export class JobTracker {
  private eventEmitter = new EventEmitter().setMaxListeners(1000);
  private metrics: Map<string, number> = new Map(); // type -> count
  private processingTimes: number[] = [];
  private lastMaintenance = Date.now();

  trackJob(type: string) {
    const current = this.metrics.get(type) || 0;
    this.metrics.set(type, current + 1);
    this.eventEmitter.emit(type, this.getMetrics());
  }

  trackFailure(type: string) {
    const failed = this.metrics.get(`${type}:failed`) || 0;
    this.metrics.set(`${type}:failed`, failed + 1);
    this.eventEmitter.emit(`${type}:failed`, this.getMetrics());
  }

  trackProcessingTime(ms: number) {
    this.processingTimes.push(ms);
    if (this.processingTimes.length > 1000) {
      this.processingTimes = this.processingTimes.slice(-1000);
    }
    this.eventEmitter.emit('processing-time', this.getMetrics());
  }

  getMetrics(): QueueMetrics {
    const pending = this.metrics.get('pending') || 0;
    const processed = this.metrics.get('completed') || 0;
    const failed = this.metrics.get('failed') || 0;
    
    const avgTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
      : 0;

    return {
      pendingJobs: pending,
      processingJobs: 0, // Track this separately
      completedJobs: processed,
      failedJobs: failed,
      queueSize: pending + processed + failed,
      averageProcessingTime: avgTime,
      lastMaintenanceTime: this.lastMaintenance,
    };
  }

  emitUpdate(type: string) {
    this.eventEmitter.emit(type, this.getMetrics());
  }

  on(eventName: string, listener: (metrics: QueueMetrics) => void) {
    this.eventEmitter.on(eventName, listener);
  }
}

export const jobTracker = new JobTracker();

/**
 * Telemetry queue for drain() compatibility
 * Wraps jobTracker to provide a queue-like interface
 */
export const telemetryQueue = {
  async drain(): Promise<void> {
    // Telemetry doesn't queue operations - drain immediately completes
    // This ensures shutdown doesn't hang waiting for non-existent queue
    await new Promise(resolve => setTimeout(resolve, 0));
  },
};
