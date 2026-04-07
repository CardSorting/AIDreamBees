/**
 * Rate Limiting Configuration
 * Defines rate limits for different API endpoints
 */

import { rateLimit } from 'express-rate-limit';
import type { Express } from 'express';

/**
 * Initialize rate limiting middleware
 * @param app Express application instance
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // Limit each IP to 200 auth requests per hour
  message: { error: 'Auth rate limit exceeded' },
});

export function configureRateLimits(app: Express) {
  // Apply rate limiters to specific routes
  app.use('/api/chat', apiLimiter);
  app.post('/broadcasting/auth', authLimiter);
}
