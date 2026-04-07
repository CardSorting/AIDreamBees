/**
 * Core: Job Worker Handler
 * Executes AI generation jobs based on job type and configuration
 */

import { PromptProcessor } from '@/domain/commands';
import type { DreamJob, ProcessingResult } from '@/domain/queue/JobTypes';

export interface AIProvider {
  generate(
    prompt: string,
    options?: {
      highDetail?: boolean;
      gridSize?: number;
    },
  ): Promise<ProcessingResult>;
}

export class DreamJobHandler {
  constructor(private aiProvider: AIProvider) {}

  /**
   * Main entry point for processing a job
   */
  async handleJob(job: DreamJob): Promise<ProcessingResult> {
    console.log(`[DreamJobHandler] Starting job ${job.id}: ${job.type} for ${job.userId}`);
    console.log(`[DreamJobHandler] Prompt: "${job.prompt.substring(0, 100)}..."`);

    const startTime = Date.now();

    try {
      let result: ProcessingResult;

      // Route to appropriate handler based on job type
      switch (job.type) {
        case 'dream':
          result = await this.handleDream(job);
          break;
        case 'grid':
          result = await this.handleGrid(job);
          break;
        case 'imagine':
          result = await this.handleImagine(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      const processingTime = Date.now() - startTime;

      // Add metrics if not present
      return {
        ...result,
        metrics: {
          ...result.metrics,
          latencyMs: processingTime,
        },
      };
    } catch (error: any) {
      const processingTime = Date.now() - startTime;

      return {
        success: false,
        textParts: [],
        images: [],
        requestId: job.id,
        retryCount: job.attempts || 0,
        error: error.message || 'Unknown processing error',
        metrics: {
          latencyMs: processingTime,
        },
      };
    }
  }

  /**
   * Handle a standard dream job (not grid)
   */
  private async handleDream(job: DreamJob): Promise<ProcessingResult> {
    console.log(`[DreamJobHandler] Processing dream job for ${job.userId}`);

    // Validate prompt
    const validation = PromptProcessor.validatePrompt(job.prompt);
    if (!validation.valid) {
      throw new Error(`Invalid prompt: ${validation.error}`);
    }

    // Generate content
    const result = await this.aiProvider.generate(job.prompt, {
      highDetail: job.options.highDetail,
    });

    return {
      success: true,
      textParts: result.textParts.length > 0 ? result.textParts : ['Dream generated!'],
      images: result.images.length > 0 ? result.images : [],
      requestId: job.id,
      retryCount: 0,
    };
  }

  /**
   * Handle a grid job (generate multiple variations)
   */
  private async handleGrid(job: DreamJob): Promise<ProcessingResult> {
    console.log(`[DreamJobHandler] Processing grid job for ${job.userId}`);

    // Initialize grid options
    const gridArgs = PromptProcessor.parseGridArguments(job.prompt);

    // Validate prompt
    const validation = PromptProcessor.validatePrompt(gridArgs.prompt);
    if (!validation.valid) {
      throw new Error(`Invalid prompt: ${validation.error}`);
    }

    // Generate multiple variations
    const variations = gridArgs.gridSize ? gridArgs.gridSize : job.options.gridSize || 4;

    console.log(`[DreamJobHandler] Generating ${variations} grid variations`);

    const rawResult = await this.aiProvider.generate(gridArgs.prompt, {
      highDetail: job.options.highDetail,
      gridSize: variations,
    });

    // The AI provider should return multiple images/text in grid mode
    return {
      success: true,
      textParts:
        rawResult.textParts.length > 1
          ? rawResult.textParts
          : [`Grid with ${variations} variations generated!`],
      images: rawResult.images.length > 0 ? rawResult.images : [],
      requestId: job.id,
      retryCount: 0,
    };
  }

  /**
   * Handle an imagine job (character generation)
   */
  private async handleImagine(job: DreamJob): Promise<ProcessingResult> {
    console.log(`[DreamJobHandler] Processing imagine job for ${job.userId}`);

    // Imagine jobs typically require grounding (images as input)
    const result = await this.aiProvider.generate(job.prompt, {
      highDetail: job.options.highDetail,
    });

    return {
      success: true,
      textParts: result.textParts.length > 0 ? result.textParts : ['Character imagined!'],
      images: rawInputImages(job) || result.images,
      requestId: job.id,
      retryCount: 0,
    };
  }
}

/**
 * Helper to detect if images were provided as input
 */
function rawInputImages(job: DreamJob): string[] | null {
  if (job.constraints?.maxImages && job.constraints.maxImages > 0) {
    return [
      /* In real implementation, would extract from input */
    ];
  }
  return null;
}
