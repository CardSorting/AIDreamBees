import type { Message, TextChannel, ThreadChannel } from 'discord.js';
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
 * Handles incoming messages from Discord and routes them through the AI generation pipeline.
 * Supports commands:
 * - /dream <prompt> (Single image)
 * - /grid <prompt> (2x2 grid)
 * 
 * This is now INTENT-BASED: We parse the intent and enqueue a job,
 * then let the worker process it asynchronously.
 */
export async function handleDiscordMessage(message: Message, thread: ThreadChannel) {
  try {
    const userId = message.author.username;
    const prompt = message.content.trim();

    // Parse command using Domain layer
    const parseResult = PromptProcessor.parseCommand(prompt);

    if (!parseResult || parseResult.type === 'unknown') {
      await thread.send(
        'I don\'t understand that command. Try `/dream a cosmic bee` or `/grid a neon hive`.',
      );
      return;
    }

    const { content, isDirect } = parseResult;

    if (content.length === 0) {
      await thread.send(
        'Please provide a prompt! Example: `/dream a cosmic bee` or `/grid a neon hive`.',
      );
      return;
    }

    // Add message to BroccoliDB (Unified history)
    await DBMessage.create({
      user: userId,
      message: content,
      type: 'user',
      images: [],
    });

    // Check grid mode
    const useGrid = parseResult.type === 'grid';

    // Build job object using Domain models
    const job: DreamJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: useGrid ? 'grid' : 'dream',
      prompt: content,
      userId,
      platform: 'discord',
      options: {
        useGrid,
      },
      destination: {
        channelId: message.channelId,
        threadId: thread.id,
      },
    };

    logger.info(`[DiscordOrchestrator] Enqueuing job ${job.id} for user ${userId}`);

    // Add "Processing..." status
    await thread.send('🎨 DreamBeesAI is creating your art...');

    // Enqueue job - this happens IMMEDIATELY (non-blocking)
    const queueAdapter = await getQueueAdapter();
    const result = await queueAdapter.enqueueJob(job);

    if (result) {
      logger.info(`[DiscordOrchestrator] Job enqueued successfully: ${job.id}`);
    } else {
      logger.error(`[DiscordOrchestrator] Failed to enqueue job ${job.id}`);
      await thread.send('🤖 Sorry, I couldn\'t create your art right now. Please try again.');
    }
  } catch (error) {
    logger.error('Discord Orchestrator Error:', error);
    await thread.send(
      "I'm sorry, I encountered an error while processing your request. Please try again later.",
    );
  }
}