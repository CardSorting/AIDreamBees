/**
 * Pusher (Soketi) Integration
 * Manages websocket connections and channel triggers for real-time updates
 */

import Pusher from 'pusher';
import winston from 'winston';
import { config } from '../../config.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Pusher client configuration
 */
const pusherConfig = {
  appId: config.SOKETI_APP_ID,
  key: config.SOKETI_APP_KEY,
  secret: config.SOKETI_APP_SECRET,
  useTLS: config.SOKETI_TLS,
  host: config.SOKETI_HOST,
  port: String(config.SOKETI_PORT),
  cluster: config.SOKETI_CLUSTER,
};

/**
 * Initialize Soketi Pusher client
 */
export function initializePusher(): Pusher {
  try {
    const pusher = new Pusher(pusherConfig);
    logger.info('🔌 Soketi (Pusher) initialized successfully');
    return pusher;
  } catch (error) {
    logger.error('Failed to initialize Soketi:', error);
    throw error;
  }
}

/**
 * Safe pusher trigger with error handling
 * Returns true if successful, false if failed
 */
export async function safeTrigger(
  channel: string,
  event: string,
  data: Record<string, unknown>,
  correlationId?: string,
): Promise<boolean> {
  try {
    const payload = {
      ...data,
      correlationId: correlationId || `cor-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
    };
    await pusher.trigger(channel, event, payload);
    return true;
  } catch (error) {
    logger.error(`Soketi Trigger Failure [${channel}:${event}]:`, error);
    return false;
  }
}

/**
 * Authenticate Soketi broadcast endpoint
 */
export function pusherAuthMiddleware(req: any, res: any) {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;

  const auth = pusher.authenticate(socketId, channel, {
    user_id: String(`user-${Math.floor(Math.random() * 1000)}`),
    user_info: { name: 'Anonymous Banana User' },
  });

  res.send(auth);
}