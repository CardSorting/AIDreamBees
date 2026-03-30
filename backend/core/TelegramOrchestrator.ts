import { Message as DBMessage } from '../db.js';
import { combineToGrid, getAIResponse } from '../gemini.js';
import type TelegramBot from 'node-telegram-bot-api';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Handles incoming messages from Telegram and routes them through the AI generation pipeline.
 * Supports commands:
 * - /dream <prompt>
 * - /grid <prompt>
 */
export async function handleTelegramMessage(bot: TelegramBot, msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const username = msg.from?.username || msg.from?.first_name || 'Telegram User';
  let text = (msg.text || '').trim();
  let useGrid = false;

  try {
    // 1. Command Parsing
    if (text.startsWith('/grid')) {
      useGrid = true;
      text = text.slice(5).trim();
    } else if (text.startsWith('/dream')) {
      useGrid = false;
      text = text.slice(6).trim();
    } else if (text.startsWith('/imagine')) {
      useGrid = false;
      text = text.slice(8).trim();
    }

    if (!text) {
      await bot.sendMessage(
        chatId,
        'Please provide a prompt! Example: `/dream a cosmic bee` or `/grid a neon hive`.',
      );
      return;
    }

    // 2. Save User Message to BroccoliDB
    await DBMessage.create({
      user: username,
      message: text,
      type: 'user',
      images: [],
    });

    // 3. Show typing action
    await bot.sendChatAction(chatId, 'typing');

    // 4. Get AI Response
    const substrateContext = `User: ${username}, Platform: Telegram`;
    const responseParts = await getAIResponse([], text, substrateContext, useGrid);

    // 5. Process parts
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
        if (part.content) await bot.sendMessage(chatId, part.content);
      }
    }

    // Send images
    for (const img of botImages) {
      const buffer = Buffer.from(img.split(',')[1] || img, 'base64');
      await bot.sendPhoto(chatId, buffer, {
        caption: useGrid ? 'DreamBees Art (Grid 2x2)' : 'DreamBees Art',
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
    logger.error('Telegram Orchestrator Error:', error);
    await bot.sendMessage(
      chatId,
      "I'm sorry, I'm having trouble processing your request on Telegram. Please try again later.",
    );
  }
}
