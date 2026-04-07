import type { TelegramClientInterface } from '@/infrastructure/telegram/DreamBeesTelegramClient.js';

/**
 * TelegramReplyHandler manages reply sending for Telegram channels/chats
 */
export class TelegramReplyHandler {
  private clients: Map<string, TelegramClientInterface>;

  constructor(clients: Map<string, TelegramClientInterface>) {
    this.clients = clients;
  }

  /**
   * Send bot reply to Telegram chat
   */
  async sendBotReply(job: any, result: any): Promise<void> {
    try {
      const client = this.clients.get('telegram');
      if (!client) {
        console.error('[TelegramReplyHandler] Telegram client not found');
        return;
      }

      // In reality, extract job data from the job object
      const chatId = job.destination.channelId;

      // Send reply to the chat
      await client.sendMessage(
        chatId,
        job.payload.prompt,
        result.textParts.join('\n'),
        result.images,
      );
    } catch (error) {
      console.error('[TelegramReplyHandler] Failed to send reply:', error);
    }
  }
}