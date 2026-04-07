/**
 * Core: Queue Dispatcher
 * Non-blocking orchestrator that dispatches jobs to the queue and handles replies
 */

import type { DreamJobHandler } from '@/core/worker/JobHandler';
import { PromptProcessor } from '@/domain/commands';
import type { DreamJob } from '@/domain/queue/JobTypes';
import { getQueueAdapter } from '@/infrastructure/queue/QueueAdapter';

export interface MessageDestination {
  type: 'discord' | 'telegram' | 'api';
  channelId?: string;
  threadId?: string;
  messageId?: string;
}

export interface ReplyHandler {
  sendText(content: string, destination?: MessageDestination): Promise<void>;
  sendImages(images: string[], destination?: MessageDestination): Promise<void>;
  sendThreadMessages(
    textParts: string[],
    images: string[],
    destination: MessageDestination,
  ): Promise<void>;
}

export interface NotificationHandler {
  sendEnqueuedNotification(job: DreamJob, destination?: MessageDestination): Promise<void>;
  sendProcessingNotification(job: DreamJob, destination?: MessageDestination): Promise<void>;
  sendCompletionNotification(
    job: DreamJob,
    result: any,
    destination?: MessageDestination,
  ): Promise<void>;
  sendFailureNotification(
    job: DreamJob,
    error: string,
    destination?: MessageDestination,
  ): Promise<void>;
}

export interface DreamJobResult {
  jobId: string;
  success: boolean;
  result?: any;
  error?: string;
}

export class QueueDispatcher {
  private queueAdapter: any;
  private replyHandler: ReplyHandler;
  private notificationHandler: NotificationHandler;
  private isRunning: boolean = false;

  constructor(
    replyHandler: ReplyHandler,
    notificationHandler: NotificationHandler,
    queueAdapter?: any,
  ) {
    this.replyHandler = replyHandler;
    this.notificationHandler = notificationHandler;
    this.queueAdapter = queueAdapter || this.getDefaultQueueAdapter();
  }

  /**
   * Get the default queue adapter if none provided
   */
  private async getDefaultQueueAdapter(): Promise<any> {
    return await getQueueAdapter();
  }

  /**
   * Start the dispatcher - initializes queue processing
   */
  async start(handler: DreamJobHandler): Promise<void> {
    if (this.isRunning) {
      console.warn('[QueueDispatcher] Dispatcher already running');
      return;
    }

    this.isRunning = true;

    // Initialize queue adapter if needed
    if (!this.queueAdapter) {
      this.queueAdapter = await getQueueAdapter();
    }

    // Start processing jobs
    await getQueueAdapter().startProcessing((job: DreamJob) => {
      return handler.handleJob(job);
    });

    console.log('[QueueDispatcher] Started processing jobs');
  }

  /**
   * Stop the dispatcher
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('[QueueDispatcher] Stopped');
  }

  /**
   * Dispatch a message to the queue (non-blocking)
   * This is the main entry point for incoming messages
   */
  async dispatchDiscordEvent(
    message: any,
    destination?: MessageDestination,
  ): Promise<string | null> {
    try {
      // Extract user info
      const userId = message.author?.id || message.user?.id || 'unknown';
      const channel = destination?.channelId || (message.channel as any)?.id;

      console.log(`[QueueDispatcher] Handling message from ${userId} in channel ${channel}`);
      console.log(`[QueueDispatcher] Content: "${message.content?.substring(0, 100)}..."`);

      // 1. Parse command using Domain Logic
      const { type, content } = PromptProcessor.parseCommand(message.content || '');

      // 2. Validate prompt using Domain Logic
      const validation = PromptProcessor.validatePrompt(content);
      if (!validation.valid) {
        console.error(`[QueueDispatcher] Invalid prompt: ${validation.error}`);
        await this.replyHandler.sendText(`⚠️ Error: ${validation.error}`, destination);
        return null;
      }

      // 3. Create job DTO (Domain Model)
      const job: DreamJob = {
        id: crypto.randomUUID(),
        type,
        prompt: content,
        userId,
        platform: 'discord',
        channel,
        messageSourceId: message.id,
        options: {
          useGrid: type === 'grid' || content.includes('grid'),
          highDetail:
            content.toLowerCase().includes('high_detail') || message.flags?.includes('HIGH_DETAIL'),
          gridSize: 4, // TODO: Parse from command arguments
        },
        createdAt: Date.now(),
      };

      // 4. Enqueue job (Infrastructure)
      const jobId = await this.queueAdapter.enqueueJob(job);

      if (!jobId) {
        throw new Error('Failed to enqueue job');
      }

      console.log(`[QueueDispatcher] Job successfully enqueued: ${jobId}`);

      // 5. Send enqueued notification
      await this.notificationHandler.sendEnqueuedNotification(job, destination);
      await this.replyHandler.sendText(
        '✨ Dream job added to queue! Processing... 🚀',
        destination,
      );

      return jobId;
    } catch (error: any) {
      console.error('[QueueDispatcher] Failed to dispatch job:', error);

      // Send error notification
      if (destination) {
        await this.notificationHandler.sendFailureNotification(
          { userId: 'unknown', prompt: message.content } as DreamJob,
          error.message || 'Unknown error',
          destination,
        );
      }

      return null;
    }
  }

  /**
   * Dispatch a Telegram message to the queue
   */
  async dispatchTelegramEvent(message: any, chatId: string): Promise<string | null> {
    const destination = {
      type: 'telegram',
      channelId: chatId,
    };

    return await this.dispatchMessageEvent(message, destination);
  }

  /**
   * Dispatch a general message to the queue
   */
  async dispatchMessageEvent(
    message: any,
    destination?: MessageDestination,
  ): Promise<string | null> {
    // Normalize message content
    const cleanContent = message.text || message.content || 'Untitled dream';

    // Create a mock message object
    const mockMessage = {
      id: crypto.randomUUID(),
      content: cleanContent,
      author: {
        id: message.from?.id || message.userId || 'unknown',
      },
      channel: {
        id: destination?.channelId || 'unknown',
      },
      flags: message.flags as any,
    };

    return await this.dispatchDiscordEvent(mockMessage, destination);
  }

  /**
   * Dispatch manual API request to the queue
   */
  async dispatchApiRequest(
    prompt: string,
    userId: string,
    options?: DreamJob['options'],
  ): Promise<string | null> {
    const job: DreamJob = {
      id: crypto.randomUUID(),
      type: 'dream',
      prompt,
      userId,
      platform: 'api',
      options: options || { useGrid: false },
      createdAt: Date.now(),
    };

    return await this.queueAdapter.enqueueJob(job);
  }

  /**
   * Immediately process a job for testing/debugging
   * (Bypasses queue for immediate results)
   */
  async processImmediately(job: DreamJob): Promise<any> {
    console.log('[QueueDispatcher] Processing job immediately (bypassing queue):', job.id);
    // Implementation would require a separate handler
    throw new Error('Immediate processing not implemented');
  }

  /**
   * Update the reply handler
   */
  setReplyHandler(handler: ReplyHandler): void {
    this.replyHandler = handler;
  }

  /**
   * Update the notification handler
   */
  setNotificationHandler(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  /**
   * Get dispatcher status
   */
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      queue: this.queueAdapter?.getQueueStatus ? this.queueAdapter.getQueueStatus() : null,
    };
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    await this.stop();
    if (this.queueAdapter?.shutdown) {
      await this.queueAdapter.shutdown();
    }
    console.log('[QueueDispatcher] Shutdown complete');
  }
}
