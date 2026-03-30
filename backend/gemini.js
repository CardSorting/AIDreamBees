import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the nano.md context for system instructions
const nanoContext = fs.readFileSync(path.join(__dirname, '../nano.md'), 'utf8');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function combineToGrid(imageBase64s) {
  if (!imageBase64s || imageBase64s.length === 0) return null;
  if (imageBase64s.length === 1) return imageBase64s[0];

  try {
    // Process only up to 4 images for a 2x2 grid
    const buffers = await Promise.all(
      imageBase64s.slice(0, 4).map(async (b64) => {
        const raw = b64.includes(',') ? b64.split(',')[1] : b64;
        const buf = Buffer.from(raw, 'base64');
        // Resize to a standard 512x512 for consistent grid layout
        return await sharp(buf).resize(512, 512).toBuffer();
      })
    );

    const size = 512;
    const canvasSize = size * 2;
    const compositeImages = buffers.map((buf, idx) => ({
      input: buf,
      top: Math.floor(idx / 2) * size,
      left: (idx % 2) * size,
    }));

    const gridBuffer = await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite(compositeImages)
    .png()
    .toBuffer();

    return gridBuffer.toString('base64');
  } catch (err) {
    console.error("Grid creation error:", err);
    return imageBase64s[0]; // Fallback to first image
  }
}

export async function getAIResponse(chatHistory, userMessage, substrateContext = "", useGrid = false) {
  try {
    // 1. Convert history to the format required by @google/genai
    const contents = chatHistory.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'model',
      parts: (msg.images && msg.images.length > 0)
        ? [
            { text: msg.message },
            ...msg.images.map(img => ({
              inlineData: { mimeType: "image/png", data: img.split(',')[1] || img }
            }))
          ]
        : [{ text: msg.message }]
    }));

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    // 2. Call Gemini 3.1 Flash with Substrate Grounding
    const gridInstruction = useGrid 
      ? "\n- GRID MODE ACTIVE: Generate 4 distinct, high-quality variations of the requested image. This is mandatory for a 2x2 grid layout." 
      : "";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        systemInstruction: `
          You are Nano Banana 2, a highly efficient conversational AI model.
          You are powered by the BroccoliDB Cognitive Substrate.
          
          TECHNICAL GROUNDING FROM SUBSTRATE:
          ${substrateContext || "No specific substrate knowledge retrieved for this query."}
          
          Original Documentation Context:
          ${nanoContext.substring(0, 3000)}
          
          Key instructions:
          - Use a professional yet friendly persona.
          - Prioritize the TECHNICAL GROUNDING from the substrate if it contradicts browser knowledge.
          - If the user asks for an image, fulfill the request using your native generation capabilities.${gridInstruction}
          - If you use substrate knowledge, acknowledge it as "Cognitive Grounding."
        `
      }
    });


    // 3. Extract parts (Text and Image data)
    const resultParts = [];
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          resultParts.push({ type: 'text', content: part.text });
        } else if (part.inlineData) {
          resultParts.push({ type: 'image', content: part.inlineData.data });
        }
      }
    }

    return resultParts;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate AI response.");
  }
}

