/**
 * Infrastructure: Discord Dispatcher
 * Bridge between Discord clients and the non-blocking queue system
 * 
 * This file handles async reply dispatching when queue jobs complete
 */

import type { Message as DiscordMessage, ThreadChannel } from 'discord.js';
import winston from 'winston';
import type { DreamJob, ProcessingResult } from '../../../src/domain/queue/JobTypes';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Send Discord reply for a completed job
 */
export class DiscordReplyHandler {
  constructor(private clients: Map<string, any>) {}

  /**
   * Send text message to Discord
   */
  async sendText(content: string, destination?: { channelId?: string; threadId?: string }) {
    try {
      const client = this.clients.get('discord');
      if (!client) {
        logger.warn('Discord client not available for reply');
        return;
      }

      // Send to thread/channel
      if (destination?.threadId) {
        const thread = await client.channels.fetch(destination.threadId);
        if (thread?.isThread()) {
          await thread.send(content);
          return;
        }
      }

      if (destination?.channelId) {
        const channel = await client.channels.fetch(destination.channelId);
        if (channel?.isTextBased()) {
          await channel.send(content);
          return;
        }
      }
    } catch (error) {
      logger.error('Failed to send Discord text:', error);
    }
  }

  /**
   * Send images to Discord
   */
  async sendImages(images: string[], destination?: { channelId?: string; threadId?: string }) {
    try {
      const client = this.clients.get('discord');
      if (!client) {
        logger.warn('Discord client not available for image reply');
        return;
      }

      // Send images
      for (const img of images) {
        const buffer = Buffer.from(img.split(',')[1] || img, 'base64');
        
        if (destination?.threadId) {
          const thread = await client.channels.fetch(destination.threadId);
          if (thread?.isThread()) {
            await thread.send({
              files: [
                {
                  attachment: buffer,
                  name: 'dream-result.png',
                },
              ],
            });
          }
        } else if (destination?.channelId) {
          const channel = await client.channels.fetch(destination.channelId);
          if (channel?.isTextBased()) {
            await channel.send({
              files: [
                {
                  attachment: buffer,
                  name: 'dream-result.png',
                },
              ],
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to send Discord images:', error);
    }
  }

  /**
   * Send bot's generated content to Discord thread
   */
  async sendBotReply(job: DreamJob, result: ProcessingResult): Promise<void> {
    try {
      const client = this.clients.get('discord');
      if (!client) {
        logger.warn('Discord client not available');
        return;
      }

      // Prepare thread reference
      if (job.channel && job.messageSourceId) {
        const thread = await client.channels.fetch(job.channel);
        if (thread?.isThread()) {
          // Send text parts
          for (const part of result.textParts) {
            await thread.send(part.substring(0, 2000));
          }

          // Send images
          if (result.images.length > 0) {
            await this.sendImages(result.images, { channelId: job.channel, threadId: job.channel });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to send Discord reply:', error);
    }
  }
}

/**
 * Notification handler for Discord
 */
export class DiscordNotificationHandler {
  constructor(private clients: Map<string, any>) {}

  /**
   * Send notification when job is enqueued
   */
  async sendEnqueuedNotification(job: DreamJob, destination?: { channelId?: string; threadId?: string }) {
    try {
      const client = this.clients.get('discord');
      if (!client) return;

      if (destination?.threadId) {
        const thread = await client.channels.fetch(destination.threadId);
        if (thread?.isThread()) {
          await thread.send('✨ **Dream job enqueued!** I\'m working on this right now. Frame 1...');
        }
      } else if (destination?.channelId) {
        const channel = await client.channels.fetch(destination.channelId);
        if (channel?.isTextBased()) {
          await channel.send(`✨ Dream job enqueued for <@${job.userId}>!`);
        }
      }
    } catch (error) {
      logger.error('Failed to send enqueued notification:', error);
    }
  }

  /**
   * Send notification when job processing starts
   */
  async sendProcessingNotification(job: DreamJob, destination?: { channelId?: string; threadId?: string }) {
    try {
      const client = this.clients.get('discord');
      if (!client) return;

      if (destination?.threadId) {
        const thread = await client.channels.fetch(destination.threadId);
        if (thread?.isThread()) {
          await thread.send('🚀 **Dream processing started!** Generating masterpieces...');
        }
      }
    } catch (error) {
      logger.error('Failed to send processing notification:', error);
    }
  }

  /**
   * Send notification when job completes
   */
  async sendCompletionNotification(job: DreamJob, result: ProcessingResult, destination?: { channelId?: string; threadId?: string }) {
    try {
      const client = this.clients.get('discord');
      if (!client) return;

      if (destination?.threadId) {
        const thread = await client.channels.fetch(destination.threadId);
        if (thread?.isThread()) {
          // Highlight successful generation
          await thread.send('✅ **Dream completed!** Check out the results below...');
        }
      }
    } catch (error) {
      logger.error('Failed to send completion notification:', error);
    }
  }

  /**
   * Send notification when job fails
   */
  async sendFailureNotification(job: DreamJob, error: string, destination?: { channelId?: string; threadId?: string }) {
    try {
      const client = this.clients.get('discord');
      if (!client) return;

      const errorMsg = `❌ **Processing failed for your dream:**\n${error}`;
      
      if (destination?.threadId) {
        const thread = await client.channels.fetch(destination.threadId);
        if (thread?.isThread()) {
          await thread.send(`⚠️ ${errorMsg}`);
        }
      } else if (destination?.channelId) {
        const channel = await client.channels.fetch(destination.channelId);
        if (channel?.isTextBased()) {
          await channel.send(`⚠️ ${errorMsg}`);
        }
      }
    } catch (err) {
      logger.error('Failed to send failure notification:', err);
    }
  }
}