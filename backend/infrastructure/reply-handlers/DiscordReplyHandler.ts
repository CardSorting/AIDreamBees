import type { Message, ThreadChannel } from 'discord.js';
import winston from 'winston';
import { ProcessingResult } from '@/src/domain/queue/JobTypes.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export interface DiscordClientInterface {
  sendMessageToThread(thread: ThreadChannel, content: string, files?: any[]): Promise<void>;
}

export class DiscordReplyHandler {
  constructor(private discordClients: Map<string, DiscordClientInterface>) {}

  /**
   * Send a reply to Discord after job completion
   */
  async sendBotReply(
    job: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    result: ProcessingResult,
  ): Promise<void> {
    const client = this.discordClients.get('discord');
    if (!client) {
      logger.error('[DiscordReplyHandler] Discord client not found');
      return;
    }

    try {
      // Find the thread - we need unique identification
      const thread = await this.findJobThread(job);

      if (!thread) {
        logger.error(`[DiscordReplyHandler] Thread not found for job ${job.id}`);
        return;
      }

      // If reply destination is provided, use that
      const destination = job.destination as { channelId?: string; threadId?: string } | undefined;
      const targetThread = destination?.threadId
        ? await this.getThreadById(destination.channelId || '', destination.threadId)
        : thread;

      if (!targetThread) {
        logger.error(`[DiscordReplyHandler] Target thread not found`);
        return;
      }

      // Send text parts
      for (const textPart of result.textParts) {
        if (textPart.trim()) {
          const content = textPart.length > 2000 ? textPart.substring(0, 2000) : textPart;
          await targetThread.send(content);
        }
      }

      // Send images
      for (const img of result.images) {
        const buffer = Buffer.from(img.split(',')[1] || img, 'base64');
        await targetThread.send({
          files: [{ attachment: buffer, name: 'dream-result.png' }],
        });
      }

      logger.info(`[DiscordReplyHandler] Sent reply for job ${job.id}`);
    } catch (error) {
      logger.error(`[DiscordReplyHandler] Failed to send Discord reply:`, error);
    }
  }

  /**
   * Send completion notification to Discord channel
   */
  async sendCompletionNotification(
    job: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    result: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<void> {
    const destination = job.destination as { channelId?: string } | undefined;
    const client = this.discordClients.get('discord');

    if (!client || !destination?.channelId) {
      return;
    }

    try {
      const clientInstance = (client as { getClient: () => any }).getClient();
      const channel = await clientInstance.channels.fetch(destination.channelId);

      if (channel && channel.isTextBased()) {
        const text = result.success
          ? `✅ Dream completed for "${job.prompt}"`
          : `❌ Dream failed for "${job.prompt}"`;
        await channel.send(text);
      }
    } catch (error) {
      logger.error('[DiscordReplyHandler] Failed to send completion notification:', error);
    }
  }

  private async findJobThread(job: any): Promise<ThreadChannel | null> {
    // In a real implementation, you'd track thread ID with job
    // For now, try to find by some identifier
    return null;
  }

  private async getThreadById(channelId: string, threadId: string): Promise<ThreadChannel | null> {
    try {
      const client = this.discordClients.get('discord');
      const clientInstance = (client as { getClient: () => any }).getClient();
      const channel = await clientInstance.channels.fetch(channelId);

      if (channel && channel.isTextBased()) {
        const thread = await channel.threads.fetch(threadId);
        return thread as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    } catch (error) {
      logger.error(`[DiscordReplyHandler] Failed to fetch thread ${threadId}:`, error);
    }
    return null;
  }
}