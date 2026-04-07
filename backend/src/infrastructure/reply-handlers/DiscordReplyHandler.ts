import type { DiscordClientInterface } from '@/infrastructure/discord/DreamBeesClient.js';

/**
 * DiscordReplyHandler manages reply sending for Discord channel threads
 */
export class DiscordReplyHandler {
  private clients: Map<string, DiscordClientInterface>;

  constructor(clients: Map<string, DiscordClientInterface>) {
    this.clients = clients;
  }

  /**
   * Send bot reply to Discord channel/thread
   */
  async sendBotReply(job: any, result: any): Promise<void> {
    try {
      const client = this.clients.get('discord');
      if (!client) {
        console.error('[DiscordReplyHandler] Discord client not found');
        return;
      }

      // In reality, extract job data from the job object
      const channelId = job.destination.channelId;
      const threadId = job.destination.threadId;

      if (threadId) {
        await client.sendMessageToThread(
          job.payload.prompt,
          result.textParts.join('\n'),
          result.images,
          threadId,
        );
      } else {
        await client.sendMessageToChannel(
          channelId,
          job.payload.prompt,
          result.textParts.join('\n'),
          result.images,
        );
      }
    } catch (error) {
      console.error('[DiscordReplyHandler] Failed to send reply:', error);
    }
  }
}