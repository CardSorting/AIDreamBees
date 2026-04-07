import { getAIResponse, combineToGrid } from '../../gemini.js';
import { ProcessingResult } from '@/src/domain/queue/JobTypes.js';

export interface AIProviderOptions {
  useGrid?: boolean;
}

export class GeminiAIProvider {
  /**
   * Generate AI content based on prompt
   */
  async generate(prompt: string, options: AIProviderOptions = {}): Promise<ProcessingResult> {
    const { useGrid = false } = options;

    // Get AI response from Gemini
    const substrateContext = 'User request for image generation';
    const responseParts = await getAIResponse([], prompt, substrateContext, useGrid);

    // Extract text and image parts
    const textParts = responseParts.filter((p) => p.type === 'text').map((p) => p.content);
    let images = responseParts.filter((p): p is { type: 'image'; content: string } => p.type === 'image').map((p) => p.content);

    // Handle grid mode
    if (useGrid && images.length > 1) {
      console.log(`[GeminiAIProvider] Combining ${images.length} images into 2x2 grid`);
      const gridResult = await combineToGrid(images);
      if (gridResult) {
        images = [gridResult];
      }
    }

    return {
      success: true,
      textParts,
      images,
      requestId: crypto.randomUUID(),
    };
  }
}