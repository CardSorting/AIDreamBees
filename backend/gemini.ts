import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

const getAIResponse = async (
  history: Message[],
  message: string,
  substrateContext: unknown,
  _useGrid: boolean,
): Promise<AIResponsePart[]> => {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  // Simplified prompt for demonstration
  const prompt = `
    Context from BroccoliDB Substrate: ${JSON.stringify(substrateContext)}
    User: ${message}
    History: ${JSON.stringify(history)}
    
    Response format: JSON array of parts { "type": "text" | "image", "content": "string" }.
    For images, use base64 strings.
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // In a real app, you'd parse this text for JSON parts.
    // For now, let's assume it returns text and potentially mock images if requested.
    return [{ type: 'text', content: text }];
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};

const combineToGrid = async (images: string[]): Promise<string | null> => {
  if (images.length < 2) return images[0] || null;

  try {
    const imageBuffers = await Promise.all(
      images.slice(0, 4).map((img) => Buffer.from(img.split(',')[1] || img, 'base64')),
    );

    // Basic 2x2 grid logic using sharp
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
