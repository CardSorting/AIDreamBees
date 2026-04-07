import type { QueueAdapter } from '@/src/infrastructure/queue/QueueAdapter.js';
import type { DreamJobHandler } from '@/src/core/worker/JobHandler.js';
import type { DiscordReplyHandler } from '@/src/infrastructure/reply-handlers/DiscordReplyHandler.js';
import type { TelegramReplyHandler } from '@/src/infrastructure/reply-handlers/TelegramReplyHandler.js';

/**
 * QueueDispatcher manages event dispatching and job processing coordination
 * Acts as the bridge between Discord/Telegram platforms and the queue system
 */
export class QueueDispatcher {
  private queueAdapter: QueueAdapter;
  private discordHandler: DiscordReplyHandler;
  private telegramHandler: TelegramReplyHandler;
  private jobHandler: DreamJobHandler | null = null;
  private isProcessing = false;

  constructor(
    discordHandler: DiscordReplyHandler,
    telegramHandler: TelegramReplyHandler,
    queueAdapter: QueueAdapter,
  ) {
    this.discordHandler = discordHandler;
    this.telegramHandler = telegramHandler;
    this.queueAdapter = queueAdapter;
  }

  /**
   * Dispatch a Discord event to the queue
   */
  async dispatchDiscordEvent(
    message: any,
    options: { channelId: string },
  ): Promise<void> {
    try {
      const job = this.createDreamJob(message, 'discord', options.channelId, options.threadId);
      await this.queueAdapter.enqueue(job);
    } catch (error) {
      console.error('[QueueDispatcher] Failed to enqueue Discord event:', error);
    }
  }

  /**
   * Dispatch a Telegram event to the queue
   */
  async dispatchTelegramEvent(
    message: any,
    chatId: string,
  ): Promise<void> {
    try {
      const job = this.createDreamJob(message, 'telegram', chatId);
      await this.queueAdapter.enqueue(job);
    } catch (error) {
      console.error('[QueueDispatcher] Failed to enqueue Telegram event:', error);
    }
  }

  /**
   * Create a dream job from incoming message
   */
  private createDreamJob(
    message: any,
    platform: 'discord' | 'telegram',
    channelId: string,
    threadId?: string,
  ): any {
    // In reality, this would extract data from the message
    // Mock implementation for now
    return {
      id: `job-${Date.now()}-${Math.random()}`,
      payload: {
        prompt: "Dream prompt goes here", // Would normally extract from message
        history: [],
        images: [], // Would normally extract from attachments
        useGrid: false,
        userId: "user-123", // Would normally extract from message author
      },
      destination: {
        platform,
        channelId,
        threadId,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Start the job processing worker
   */
  async start(jobHandler: DreamJobHandler): Promise<void> {
    if (this.isProcessing) {
      console.warn('[QueueDispatcher] Already processing');
      return;
    }

    this.isProcessing = true;

    // Configure the job handler with reply handlers
    jobHandler.discordHandler = this.discordHandler;
    jobHandler.telegramHandler = this.telegramHandler;

    // Start processing jobs
    const queue = this.queueAdapter.queue;
    await queue.process(
      async (job: any) => {
        await jobHandler.handle(job);
      },
      {
        concurrency: 10,
        pollIntervalMs: 100,
        batchSize: 10,
      },
    );
  }

  /**
   * Shutdown the dispatcher gracefully
   */
  async shutdown(): Promise<void> {
    console.log('[QueueDispatcher] Shutting down...');
    this.isProcessing = false;

    // Close the queue
    await this.queueAdapter.shutdown();

    console.log('[QueueDispatcher] Shutdown complete');
  }
}