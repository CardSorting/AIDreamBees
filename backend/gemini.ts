import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { getActiveProviderKey } from './routes/providers.js';

dotenv.config();

const getGenAIClient = async () => {
  const userKey = await getActiveProviderKey('gemini');
  return new GoogleGenAI({
    apiKey: userKey || process.env.GEMINI_API_KEY || '',
  });
};

interface Message {
  user: string;
  message: string;
  type: string;
  images?: string[];
}

interface AIResponsePart {
  type: 'text' | 'image';
  content: string;
}

/**
 * Higher-level function to handle AI responses, including text and image generation.
 */
const getAIResponse = async (
  _history: Message[],
  message: string,
  _substrateContext: unknown,
  useGrid: boolean,
): Promise<AIResponsePart[]> => {
  const ai = await getGenAIClient();
  const model = 'gemini-3.1-flash-image-preview';

  try {
    if (useGrid) {
      // Parallel generation of 4 unique images for a 2x2 grid
      const gridVariations = [
        'variation A: high detail, close-up perspective',
        'variation B: cinematic lighting, wide-angle',
        'variation C: artistic style shift, vibrant colors',
        'variation D: minimal composition, soft focus',
      ];

      const imagePromises = gridVariations.map(async (variation) => {
        const prompt = `${message} (${variation})`;
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        });

        // Extract image part from response
        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts;
        if (!parts) return null;

        for (const part of parts) {
          if (part.inlineData?.data) {
            return {
              type: 'image' as const,
              content: part.inlineData.data, // base64
            };
          }
        }
        return null;
      });

      const results = await Promise.all(imagePromises);
      // Fixed type guard to correctly identify non-null image parts
      const imageParts = results.filter((r): r is { type: 'image'; content: string } => r !== null);

      return [{ type: 'text', content: `Generated a 2x2 grid for: "${message}"` }, ...imageParts];
    } else {
      // Single image generation
      const response = await ai.models.generateContent({
        model,
        contents: message,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      const parts: AIResponsePart[] = [];
      const candidate = response.candidates?.[0];
      const resParts = candidate?.content?.parts;

      if (resParts) {
        for (const part of resParts) {
          if (part.text) {
            parts.push({ type: 'text', content: part.text });
          } else if (part.inlineData?.data) {
            parts.push({ type: 'image', content: part.inlineData.data });
          }
        }
      }

      return parts;
    }
  } catch (error) {
    console.error('Gemini Native Generation Error:', error);
    throw error;
  }
};

/**
 * Combines up to 4 images into a 2x2 grid using sharp.
 */
const combineToGrid = async (images: string[]): Promise<string | null> => {
  if (images.length < 2) return images[0] || null;

  try {
    const imageBuffers = await Promise.all(
      images.slice(0, 4).map((img) => Buffer.from(img.split(',')[1] || img, 'base64')),
    );

    // Basic 2x2 grid logic (assumes square inputs)
    const { data } = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        imageBuffers.map((buffer, i) => ({
          input: buffer,
          top: i < 2 ? 0 : 512,
          left: i % 2 === 0 ? 0 : 512,
        })),
      )
      .png()
      .toBuffer({ resolveWithObject: true });

    return `data:image/png;base64,${data.toString('base64')}`;
  } catch (error) {
    console.error('Sharp Grid Error:', error);
    return null;
  }
};

export { combineToGrid, getAIResponse };
