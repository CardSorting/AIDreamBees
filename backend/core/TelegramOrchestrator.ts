import TelegramBot from 'node-telegram-bot-api';
import { getAIResponse } from '../gemini.js';
import { Message as DBMessage } from '../db.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export class TelegramOrchestrator {
  public static async handleMessage(bot: TelegramBot, msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const username = msg.from?.username || msg.from?.first_name || 'Telegram User';

    try {
      // 1. Save to BroccoliDB
      await DBMessage.create({
        user: username,
        message: text,
        type: 'user',
        images: [],
      });

      // 2. Show typing
      await bot.sendChatAction(chatId, 'typing');

      // 3. Get AI Response
      const substrateContext = `User: ${username}, Platform: Telegram`;
      const responseParts = await getAIResponse([], text, substrateContext, false);

      // 4. Send back to Telegram
      for (const part of responseParts) {
        if (part.type === 'text') {
          await bot.sendMessage(chatId, part.content);
        } else if (part.type === 'image') {
          const buffer = Buffer.from(part.content.split(',')[1] || part.content, 'base64');
          await bot.sendPhoto(chatId, buffer, { caption: 'DreamBees Art' });
        }
      }

      // 5. Save AI Message to DB
      const botText = responseParts.filter(p => p.type === 'text').map(p => p.content).join('\n');
      await DBMessage.create({
        user: 'DreamBees',
        message: botText,
        type: 'bot',
        images: responseParts.filter(p => p.type === 'image').map(p => p.content),
      });

    } catch (error) {
      logger.error('Telegram Orchestrator Error:', error);
      await bot.sendMessage(chatId, "I'm sorry, I'm having trouble processing your request on Telegram.");
    }
  }
}
