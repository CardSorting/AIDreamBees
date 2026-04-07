/**
 * Chat Request Validation Middleware
 * Validates incoming chat requests using Zod schema
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import { logger } from '../broccolidb/infrastructure/util/Logger.js';

/**
 * Chat request schema for validation
 */
export const ChatRequestSchema = z.object({
  message: z.string().optional(),
  images: z.array(z.string()).optional(),
  history: z.array(z.any()).optional(),
  useGrid: z.boolean().optional().default(false),
  correlationId: z.string().optional(),
});

/**
 * Validate chat request
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export function validateChatRequest(req: Request, res: Response, next: () => void) {
  const validationResult = ChatRequestSchema.safeParse(req.body);

  if (!validationResult.success) {
    logger.error('Chat request validation failed:', validationResult.error.format());
    return res.status(400).json({
      error: 'Cognitive payload violation',
      details: validationResult.error.format(),
    });
  }

  // Attach validated data to request object for downstream handlers
  req.parsedBody = validationResult.data;
  next();
}

/**
 * Simple chat request schema (for message only)
 */
export const SimpleChatSchema = z.object({
  message: z.string(),
  correlationId: z.string().optional(),
});