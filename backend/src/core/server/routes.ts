/**
 * HTTP Routes Definition
 * Defines all API endpoints for the DreamBeesAI backend
 */

import winston from 'winston';
import Pusher from 'pusher';
import { Message } from '../../db.js'; // Using direct db.js import for Sequelize models
import { safeTrigger } from './pusher.js';
import os from 'node:os';
import type { Request, Response } from 'express';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Helper function to get next sequence ID
 */
let messageSequence = 0;
const getNextSequenceId = () => ++messageSequence;

/**
 * Serve root endpoint
 */
export function serveRoot(_req: Request, res: Response) {
  res.json({
    status: 'online',
    service: 'DreamBeesAI Backend',
    substrate: 'BroccoliDB',
    version: '2.1.0',
  });
}

/**
 * GET /api/history - Fetch all messages
 */
export async function getHistory(_req: Request, res: Response) {
  try {
    const history = await Message.findAll();
    res.json(history);
  } catch (error) {
    logger.error('Failed to fetch history from BroccoliDB Substrate:', error);
    res.status(500).json({ error: 'Failed to load cognitive history' });
  }
}

/**
 * DELETE /api/history - Purge all messages
 */
export async function purgeHistory(_req: Request, res: Response) {
  try {
    await Message.destroy({ where: {}, truncate: true });
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Failed to purge cognitive substrate:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
}

/**
 * DELETE /api/history/:id - Delete specific message
 */
export async function deleteMessage(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const deletedCount = await Message.destroy({ where: { id } });
    if (deletedCount > 0) {
      res.json({ status: 'success' });
    } else {
      res.status(404).json({ error: 'Message not found' });
    }
  } catch (error) {
    logger.error('Failed to delete individual message from substrate:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
}

/**
 * GET /api/broadcasting/auth - Soketi authentication endpoint
 */
export const pusherAuthMiddleware = (req: any, res: any) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;

  const auth = (req.app.get('pusher') as Pusher).authenticate(socketId, channel, {
    user_id: String(`user-${Math.floor(Math.random() * 1000)}`),
    user_info: { name: 'Anonymous Banana User' },
  });

  res.send(auth);
};

/**
 * GET /api/health - Health check endpoint
 */
export async function getHealth(app: any, startTime: number, sequenceLevel: number): Promise<Response> {
  try {
    const memoryUsage = process.memoryUsage();
    const systemUptime = os.uptime();
    const appUptime = (Date.now() - startTime) / 1000;

    // Check DB health
    let dbStatus = 'Optimal';
    try {
      await (app.get('sequelize') as any).authenticate();
    } catch {
      dbStatus = 'Degraded';
    }

    // Proactive Soketi Probe
    let soketiStatus = 'Optimal';
    try {
      await (req.app.get('pusher') as Pusher).get({ path: '/channels/presence-chat' });
    } catch (err) {
      logger.warn('Soketi Proactive Probe Failed:', err);
      soketiStatus = 'Degraded (Connectivity Error)';
    }

    const health = {
      entropy: Math.min(0.9, memoryUsage.heapUsed / memoryUsage.heapTotal + Math.random() * 0.05),
      health: dbStatus,
      soketiStatus: soketiStatus,
      violations: 0,
      nodeCount: await Message.count(),
      uptime: appUptime,
      systemUptime: systemUptime,
      systemLoad: os.loadavg()[0],
      substrateStability: 0.99,
      sequenceLevel,
    };
    return res.json(health);
  } catch (error) {
    logger.error('Failed to get system health:', error);
    return res.status(500).json({ error: 'Structural scan failed' });
  }
}

/**
 * POST /api/chat - Main chat endpoint with AI processing
 */
export async function postChat(_req: any, res: Response, app: any): Promise<Response | void> {
  // Schema validation
  const chatRequestSchema = _req.ZodSchema; // Passing Zod schema via middleware later

  const validationResult = chatRequestSchema
    .extend({
      correlationId: _req.z.string().optional(),
    })
    .safeParse(_req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      error: 'Cognitive payload violation',
      details: validationResult.error.format(),
    });
  }

  const { message, images, history, useGrid, correlationId } = validationResult.data;
  const logger = _req.logger;
  const safeTrigger = _req.safeTrigger;
  const Message = _req.Message;
  const getAIResponse = _req.getAIResponse;
  const combineToGrid = _req.combineToGrid;

  try {
    // 1. Save User Message
    await Message.create({
      user: 'You',
      message: message || '',
      type: 'user',
      images: images || [],
    });

    // 2. Trigger "Thinking" status via Soketi
    await safeTrigger('presence-chat', 'bot-thinking', { isThinking: true }, correlationId);

    // 3. Substrate Retrieval (Functional context grounding)
    const recentHistory = await Message.findAll({ limit: 5, order: [['timestamp', 'DESC']] });
    const substrateContext =
      recentHistory.length > 0
        ? `Resonating with recent hive activity: ${recentHistory.map((m) => m.message.substring(0, 50)).join('; ')}`
        : 'Knowledge base retrieval active.';

    // 4. Process parts (Text and images)
    console.log('AI Response type', typeof getAIResponse);
    const resultParts = (await getAIResponse(
      (history || []) as any[],
      message || '',
      substrateContext,
      useGrid,
    )) as any[];

    const botText = resultParts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('\n\n');
    let botImages = resultParts
      .filter((p): p is any & { type: 'image' } => p.type === 'image')
      .map((p) => p.content);

    // 5b. Grid Mode Logic
    let sourceImages: string[] = [];
    if (useGrid && botImages.length > 1) {
      logger.info(`Combining ${botImages.length} images into a 2x2 grid.`);
      sourceImages = [...botImages];
      const gridResult = await combineToGrid(botImages);
      if (gridResult) {
        botImages = [gridResult];
      }
    }

    // 6. Save AI Message
    const savedBotMsg = await Message.create({
      user: 'Nano Banana 2',
      message: botText,
      type: 'bot',
      images: botImages,
      sourceImages: sourceImages,
    });

    // 7. Broadcast via WebSocket
    await safeTrigger(
      'presence-chat',
      'bot-message',
      {
        message: botText,
        images: botImages,
        sourceImages: sourceImages,
        user: 'Nano Banana 2',
        soundness: savedBotMsg.soundness || 1.0,
        isGrounded: !!substrateContext,
      },
      correlationId,
    );

    // 8. Update Structural Health
    const memoryUsage = process.memoryUsage();
    const health = {
      entropy: Math.min(0.9, memoryUsage.heapUsed / memoryUsage.heapTotal + Math.random() * 0.05),
      health: 'Stable',
      violations: 0,
      nodeCount: await Message.count(),
      uptime: (Date.now() - _req.startTime) / 1000,
      systemLoad: os.loadavg()[0],
      substrateStability: 0.995,
    };
    await safeTrigger('presence-chat', 'system-update', { health }, correlationId);

    await safeTrigger('presence-chat', 'bot-thinking', { isThinking: false }, correlationId);
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Cognitive Audit process error:', error);
    await safeTrigger('presence-chat', 'bot-thinking', { isThinking: false }, correlationId);
    res.status(500).json({ error: 'Internal server error during chat processing.' });
  }
}