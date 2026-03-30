import type { Message as DiscordMessage, ThreadChannel } from 'discord.js';
import winston from 'winston';
import { Message as DBMessage } from '../db.js';
import { combineToGrid, getAIResponse } from '../gemini.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Handles incoming messages from Discord and routes them through the AI generation pipeline.
 * Supports commands:
 * - /dream <prompt> (Single image)
 * - /grid <prompt> (2x2 grid)
 */
export async function handleDiscordMessage(message: DiscordMessage, thread: ThreadChannel) {
  try {
    let userMessageContent = message.content.trim();
    let useGrid = false;

    // 1. Command Parsing
    if (userMessageContent.startsWith('/grid')) {
      useGrid = true;
      userMessageContent = userMessageContent.slice(5).trim();
    } else if (userMessageContent.startsWith('/dream')) {
      useGrid = false;
      userMessageContent = userMessageContent.slice(6).trim();
    } else if (userMessageContent.startsWith('/imagine')) {
      useGrid = false;
      userMessageContent = userMessageContent.slice(8).trim();
    }

    if (!userMessageContent) {
      await thread.send(
        'Please provide a prompt! Example: `/dream a cosmic bee` or `/grid a neon hive`.',
      );
      return;
    }

    // 2. Add message to BroccoliDB (Unified history)
    await DBMessage.create({
      user: message.author.username,
      message: userMessageContent,
      type: 'user',
      images: [],
    });

    // 3. Indicate thinking
    await thread.sendTyping();

    // 4. Get AI Response
    const substrateContext = `User: ${message.author.username}, Channel: ${thread.name}, Platform: Discord`;
    const responseParts = await getAIResponse([], userMessageContent, substrateContext, useGrid);

    // 5. Process and send back to Discord thread
    let botImages = responseParts.filter((p) => p.type === 'image').map((p) => p.content);
    let sourceImages: string[] = [];

    if (useGrid && botImages.length > 1) {
      sourceImages = [...botImages];
      const gridResult = await combineToGrid(botImages);
      if (gridResult) {
        botImages = [gridResult];
      }
    }

    // Send text parts
    for (const part of responseParts) {
      if (part.type === 'text') {
        const content = part.content.substring(0, 2000);
        if (content) await thread.send(content);
      }
    }

    // Send image buffers
    for (const img of botImages) {
      const buffer = Buffer.from(img.split(',')[1] || img, 'base64');
      await thread.send({
        files: [
          {
            attachment: buffer,
            name: useGrid ? 'dream-grid.png' : 'dream.png',
          },
        ],
      });
    }

    // 6. Save AI Message to DB
    const botText = responseParts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('\n');
    await DBMessage.create({
      user: 'DreamBees',
      message: botText,
      type: 'bot',
      images: botImages,
      sourceImages: sourceImages,
    });
  } catch (error) {
    logger.error('Discord Orchestrator Error:', error);
    await thread.send(
      "I'm sorry, I encountered an error while processing your request. Please try again later.",
    );
  }
}
