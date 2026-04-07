import type TelegramBot from 'node-telegram-bot-api';
import winston from 'winston';
import { Message as DBMessage } from '../db.js';
import { combineToGrid, getAIResponse } from '../gemini.js';
import { PromptProcessor } from '@/src/domain/commands/PromptProcessing.js';
import { DreamJob } from '@/src/domain/queue/JobTypes.js';
import { getQueueAdapter } from '@/src/infrastructure/queue/QueueAdapter.js';
import { DispatchResult } from '@/src/core/dispatcher/QueueDispatcher.js';

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
 * 
 * This is now INTENT-BASED: We parse the intent and enqueue a job,
 * then let the worker process it asynchronously.
 */
export async function handleTelegramMessage(bot: TelegramBot, msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  const username = msg.from?.username || msg.from?.first_name || 'Telegram User';
  const content = (msg.text || '').trim();
  
  try {
    // Parse command using Domain layer
    const parseResult = PromptProcessor.parseCommand(content);

    if (!parseResult || parseResult.type === 'unknown') {
      await bot.sendMessage(
        chatId,
        'I don\'t understand that command. Try `/dream a cosmic bee` or `/grid a neon hive`.',
      );
      return;
    }

    const { content: prompt, type } = parseResult;

    if (prompt.length === 0) {
      await bot.sendMessage(
        chatId,
        'Please provide a prompt! Example: `/dream a cosmic bee` or `/grid a neon hive`.',
      );
      return;
    }

    // Add message to BroccoliDB (Unified history)
    await DBMessage.create({
      user: username,
      message: prompt,
      type: 'user',
      images: [],
    });

    // Check grid mode
    const useGrid = type === 'grid';

    // Build job object using Domain models
    const job: DreamJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: useGrid ? 'grid' : 'dream',
      prompt,
      userId: username,
      platform: 'telegram',
      options: {
        useGrid,
      },
      destination: {
        channelId: String(chatId),
      },
    };

    logger.info(`[TelegramOrchestrator] Enqueuing job ${job.id} for user ${username}`);

    // Add "Processing..." status
    await bot.sendChatAction(chatId, 'typing');

    // Enqueue job - this happens IMMEDIATELY (non-blocking)
    const queueAdapter = await getQueueAdapter();
    const result = await queueAdapter.enqueueJob(job);

    if (result) {
      logger.info(`[TelegramOrchestrator] Job enqueued successfully: ${job.id}`);
    } else {
      logger.error(`[TelegramOrchestrator] Failed to enqueue job ${job.id}`);
      await bot.sendMessage(
        chatId,
        '🤖 Sorry, I couldn\'t create your art right now. Please try again.',
      );
    }
  } catch (error) {
    logger.error('Telegram Orchestrator Error:', error);
    await bot.sendMessage(
      chatId,
      "I'm sorry, I'm having trouble processing your request on Telegram. Please try again later.",
    );
  }
}