/**
 * Express Middleware Setup
 * Orchestrates middleware configuration for the DreamBeesAI server
 */

import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import winston from 'winston';
import { config } from '../../config.js'; // Using 'config' module instead of config.schema for runtime access
import type { Request, Response } from 'express';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

/**
 * Environment variables (extracted from runtime config)
 */
const CORS_ORIGIN = config.CORS_ORIGIN || ['http://localhost:5173', 'http://localhost:5174'];

/**
 * Express middleware factory
 */
export function configureMiddleware(app: ReturnType<typeof import('express').Express>) {
  // Security middleware
  app.use(helmet());

  // Request logging
  app.use(
    morgan('combined', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    }),
  );

  // CORS configuration
  app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
    }),
  );

  // JSON body parsing with generous limits for image payloads
  app.use(bodyParser.json({ limit: '20mb' }));
  app.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));

  logger.info('⬜ Middleware configured successfully');
}