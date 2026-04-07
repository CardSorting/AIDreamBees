import type { ProcessingResult } from '@/src/domain/queue/JobTypes.js';
import type { GeminiAIProvider } from '../infrastructure/ai/providers/GeminiAIProvider.js';
import type { DiscordReplyHandler } from '../infrastructure/reply-handlers/DiscordReplyHandler.js';
import type { TelegramReplyHandler } from '../infrastructure/reply-handlers/TelegramReplyHandler.js';

/**
 * JobHandler processes queue jobs and sends responses via appropriate channels
 */
export class DreamJobHandler {
  constructor(
    private aiProvider: GeminiAIProvider,
    private discordHandler: DiscordReplyHandler | null = null,
    private telegramHandler: TelegramReplyHandler | null = null,
  ) {}

  /**
   * Process a single dream job
   */
  async handle(job: any): Promise<ProcessingResult> {
    // In reality, we'd deserialize the job payload here
    // For now, we'll work with the job object structure
    const prompt = job.payload.prompt;
    const history = job.payload.history;
    const images = job.payload.images;
    const useGrid = job.payload.useGrid;
    const userId = job.payload.userId;

    let processedResult: ProcessingResult;

    try {
      // Use AI Provider to generate results
      processedResult = await this.aiProvider.generateDream(
        prompt,
        history as Array<{ role: string; content: string }>,
        images,
        useGrid,
      );
      processedResult.userId = userId;
    } catch (error) {
      console.error('[DreamJobHandler] AI generation failed:', error);
      throw error;
    }

    // Send results to appropriate platform
    if (job.destination.platform === 'discord' && this.discordHandler) {
      await this.discordHandler.sendBotReply(job, processedResult);
    } else if (job.destination.platform === 'telegram' && this.telegramHandler) {
      await this.telegramHandler.sendBotReply(job, processedResult);
    }

    return processedResult;
  }
}