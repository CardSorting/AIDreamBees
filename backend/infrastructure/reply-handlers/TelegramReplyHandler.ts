import type TelegramBot from 'node-telegram-bot-api';
import winston from 'winston';
import { ProcessingResult } from '@/src/domain/queue/JobTypes.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export interface TelegramClientInterface {
  sendMessage(chatId: number | string, text: string): Promise<void>;
}

export class TelegramReplyHandler {
  constructor(private telegramClients: Map<string, TelegramClientInterface>) {}

  /**
   * Send a reply to Telegram after job completion
   */
  async sendBotReply(
    job: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    result: ProcessingResult,
  ): Promise<void> {
    const client = this.telegramClients.get('telegram');
    if (!client) {
      logger.error('[TelegramReplyHandler] Telegram client not found');
      return;
    }

    try {
      const chatId = Number(job.destination?.channelId) || Number(process.env.TELEGRAM_CHAT_ID);

      // Send text parts
      for (const textPart of result.textParts) {
        if (textPart.trim()) {
          const content = textPart.length > 4096 ? textPart.substring(0, 4096) : textPart;
          await client.sendMessage(chatId, content);
        }
      }

      // Send images (convert base64 to buffer)
      for (const img of result.images) {
        const buffer = Buffer.from(img.split(',')[1] || img, 'base64');
        try {
          await client.sendPhoto(chatId, buffer);
        } catch (err) {
          logger.error('[TelegramReplyHandler] Failed to send image:', err);
        }
      }

      logger.info(`[TelegramReplyHandler] Sent reply for job ${job.id}`);
    } catch (error) {
      logger.error(`[TelegramReplyHandler] Failed to send Telegram reply:`, error);
    }
  }

  /**
   * Send completion notification to Telegram chat
   */
  async sendCompletionNotification(
    job: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    result: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<void> {
    const chatId = Number(job.destination?.channelId) || Number(process.env.TELEGRAM_CHAT_ID);
    const client = this.telegramClients.get('telegram');

    if (!client) {
      return;
    }

    try {
      const text = result.success
        ? `✅ Dream completed for "${job.prompt}"`
        : `❌ Dream failed for "${job.prompt}"`;
      await client.sendMessage(chatId, text);
    } catch (error) {
      logger.error('[TelegramReplyHandler] Failed to send completion notification:', error);
    }
  }
}