import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the nano.md context for system instructions
const nanoContext = fs.readFileSync(path.join(__dirname, '../nano.md'), 'utf8');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getAIResponse(chatHistory, userMessage, substrateContext = "") {
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
          - If the user asks for an image, fulfill the request using your native generation capabilities.
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

