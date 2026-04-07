/**
 * DreamBeesAI Server Orchestration
 * Entry point that initializes and orchestrates all server components
 */

import express, { type Express, type Request, type Response } from 'express';
import winston from 'winston';

// CORE Layer Imports
import { config } from '../../../config.schema.js';
import { DreamJobHandler } from '../worker/JobHandler.js';
import { QueueDispatcher } from '../dispatcher/QueueDispatcher.js';
import { configureMiddleware } from './middleware.js';
import { initializePusher, safeTrigger } from './pusher.js';
import { configureRateLimits, apiLimiter } from './rateLimit.js';
import { ChatRequestSchema, validateChatRequest } from './chatMiddleware.js';
import {
  serveRoot,
  getHistory,
  purgeHistory,
  deleteMessage,
  pusherAuthMiddleware,
  postChat,
} from './routes.js';

// INFRASTRUCTURE Layer Imports (BroccoliDB & Core Persistence)
import { Message, initDB } from '../../../db.js';
import { combineToGrid, getAIResponse } from '../../../gemini.js';
import { GeminiAIProvider } from '../../../infrastructure/ai/providers/GeminiAIProvider.js';
import { DreamBeesAIClient } from '../../../infrastructure/discord/DreamBeesClient.js';
import { DreamBeesAITelegramClient } from '../../../infrastructure/telegram/DreamBeesTelegramClient.js';
import { telemetryQueue } from '../../../../backend/broccolidb/core/tracker.js';
import { dbPool } from '../../broccolidb/infrastructure/db/BufferedDbPool.js';
import { initializeQueueAdapter } from '../../infrastructure/queue/QueueAdapter.js';
import { DiscordReplyHandler } from '../../infrastructure/reply-handlers/DiscordReplyHandler.js';
import { TelegramReplyHandler } from '../../infrastructure/reply-handlers/TelegramReplyHandler.js';

// Routes
import providersRouter from '../../../routes/providers.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Initialize the DreamBeesAI server
 */
export async function initializeServer(): Promise<Express> {
  const app = express();
  const PORT = (config as { PORT?: number }).PORT || 3000;
  const startTime = Date.now();

  logger.info('🚀 Starting DreamBeesAI Server...');

  // --- Core Infrastructure Setup ---

  // Initialize Database (BroccoliDB Cognitive Substrate)
  try {
    await initDB();
    logger.info('✅ BroccoliDB substrate initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize BroccoliDB:', error);
    throw error;
  }

  // Initialize Pusher (Soketi) WebSocket client
  const pusher = initializePusher();
  app.set('pusher', pusher);

  // Initialize Logger and core app state
  app.set('logger', logger);
  app.set('safeTrigger', safeTrigger);
  app.set('Message', Message);
  app.set('getAIResponse', getAIResponse);
  app.set('combineToGrid', combineToGrid);
  app.set('startTime', startTime);
  app.set('ZodSchema', ChatRequestSchema);

  // --- Middleware Configuration ---

  configureMiddleware(app);
  configureRateLimits(app);

  // --- Route Definitions ---

  app.get('/', serveRoot);
  app.get('/api/history', getHistory);
  app.delete('/api/history', purgeHistory);
  app.delete('/api/history/:id', deleteMessage);
  app.post('/broadcasting/auth', pusherAuthMiddleware);
  app.post('/api/chat', apiLimiter, validateChatRequest, (req: Request, res: Response) =>
    postChat(req, res, app),
  );
  app.use('/api/providers', providersRouter);

  // --- Start the HTTP Server ---

  const server = app.listen(PORT, async () => {
    logger.info(`--- 🥦 DreamBeesAI PRODUCTION-HARDENED Server with BroccoliDB ---`);
    logger.info(`Server listening on http://localhost:${PORT}`);

    // --- Background Processing Setup ---
    try {
      // 1. Initialize AI and Job Handler
      const aiProvider = new GeminiAIProvider();
      const jobHandler = new DreamJobHandler(aiProvider);
      
      // 2. Initialize Messaging Clients
      const { handleDiscordMessage } = await import('../../../core/DiscordOrchestrator.js');
      const { handleTelegramMessage } = await import('../../../core/TelegramOrchestrator.js');

      const discordClient = new DreamBeesAIClient(handleDiscordMessage);
      const telegramClient = new DreamBeesAITelegramClient(handleTelegramMessage);

      // 3. Initialize Reply Handlers
      const discordReplyHandler = new DiscordReplyHandler(new Map([['discord', discordClient]]));
      const telegramReplyHandler = new TelegramReplyHandler(new Map([['telegram', telegramClient]]));

      // 4. Initialize Queue System
      const queueAdapter = await initializeQueueAdapter();
      const dispatcher = new QueueDispatcher(
        discordReplyHandler,
        telegramReplyHandler,
        queueAdapter,
      );

      app.set('dispatcher', dispatcher);

      // 5. Start Dispatcher and Background Workers
      await dispatcher.start(jobHandler);
      await discordClient.start();
      await telegramClient.start();

      logger.info('✅ All background systems (Queue, Discord, Telegram) initialized and started');
    } catch (error) {
      logger.error('❌ Failed to initialize background processing:', error);
    }

    app.set('app', app);
    logger.info('[Queue] All systems operational with non-blocking processing');
  });

  // Attach server instance for graceful shutdown
  (app as any).server = server;

  return app;
}

/**
 * Graceful Shutdown Handler
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`\n[NanoBanana] ${signal} received. Starting graceful shutdown...`);

  const app = (global as { app?: Express }).app;
  if (!app) {
    process.exit(0);
  }

  const server = (app as any).server;

  if (server) {
    server.close(() => {
      logger.info('[NanoBanana] HTTP server closed.');
    });
  }

  try {
    const dispatcher = app.get('dispatcher');
    if (dispatcher) {
      logger.info('[NanoBanana] Stopping job processing...');
      await dispatcher.shutdown();
    }

    logger.info('[NanoBanana] Draining telemetry queue...');
    await telemetryQueue.drain();

    logger.info('[NanoBanana] Flushing database pool...');
    if (dbPool) {
      await dbPool.stop();
    }

    logger.info('[NanoBanana] All resources safely persisted. Exit.');
    process.exit(0);
  } catch (err) {
    logger.error('[NanoBanana] Error during shutdown:', err);
    process.exit(1);
  }
}

// Set up graceful shutdown listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
