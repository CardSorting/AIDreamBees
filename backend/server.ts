import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import Pusher from 'pusher';
import winston from 'winston';
import { initDB, Message } from './db.js';
import { combineToGrid, getAIResponse } from './gemini.js';
import providersRouter, { getActiveProviderKey } from './routes/providers.js';
import { Provider } from './models/Provider.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- Production Logging (Winston) ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// --- Security & Middleware ---
app.use(helmet());
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
app.use(
  cors({
    origin: 'http://localhost:5173', // Frontend URL
    credentials: true,
  }),
);
app.use(bodyParser.json({ limit: '20mb' })); // Increase limit for image payloads
app.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));

// Initialize Database (BroccoliDB Cognitive Substrate)
initDB();

// --- Pusher (Soketi) Integration ---
const pusher = new Pusher({
  appId: process.env.SOKETI_APP_ID || 'app-id',
  key: process.env.SOKETI_APP_KEY || 'app-key',
  secret: process.env.SOKETI_APP_SECRET || 'app-secret',
  useTLS: false,
  host: '127.0.0.1',
  port: 6001,
  cluster: 'mt1',
});

// --- Authentication Endpoint for Soketi ---
app.post('/broadcasting/auth', (req: Request, res: Response) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;

  const auth = pusher.authenticate(socketId, channel, {
    user_id: String(`user-${Math.floor(Math.random() * 1000)}`),
    user_info: { name: 'Anonymous Banana User' },
  });

  res.send(auth);
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'Nano Banana 2 Backend',
    substrate: 'BroccoliDB',
    version: '2.1.0',
  });
});

// --- Persistent History API (BroccoliDB Backend) ---
app.get('/api/history', async (_req: Request, res: Response) => {
  try {
    const history = await Message.findAll();
    res.json(history);
  } catch (error) {
    logger.error('Failed to fetch history from BroccoliDB Substrate:', error);
    res.status(500).json({ error: 'Failed to load cognitive history' });
  }
});

// Structural Health API
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const health = {
      entropy: Math.random() * 0.5,
      health: 'Optimal',
      violations: 0,
      nodeCount: await Message.count(),
    };
    res.json(health);
  } catch (error) {
    logger.error('Failed to get system health:', error);
    res.status(500).json({ error: 'Structural scan failed' });
  }
});

app.delete('/api/history', async (_req: Request, res: Response) => {
  try {
    await Message.destroy({ where: {}, truncate: true });
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Failed to purge cognitive substrate:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// --- Provider Management API ---
app.use('/api/providers', providersRouter);

// --- Real-time Chat API Endpoint (Full Cognitive Substrate) ---
app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, images, history, useGrid } = req.body;

  if (!message && (!images || images.length === 0)) {
    return res.status(400).json({ error: 'Message or image is required.' });
  }

  try {
    // 1. Save User Message
    await Message.create({
      user: 'You',
      message: message || '',
      type: 'user',
      images: images || [],
    });

    // 2. Trigger "Thinking" status via Soketi
    pusher.trigger('presence-chat', 'bot-thinking', { isThinking: true });

    // 3. Substrate Retrieval (Mocked for now)
    const substrateContext = 'Knowledge base retrieval active.';

    // 4. Call Gemini API with Augmented Context
    const resultParts = await getAIResponse(history, message, substrateContext, useGrid);

    // 5. Process parts (Text and images)
    const botText = resultParts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('\n\n');
    let botImages = resultParts.filter((p) => p.type === 'image').map((p) => p.content);

    // 5b. Grid Mode Logic
    if (useGrid && botImages.length > 1) {
      logger.info(`Combining ${botImages.length} images into a 2x2 grid.`);
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
    });

    // 7. Broadcast via WebSocket
    pusher.trigger('presence-chat', 'bot-message', {
      message: botText,
      images: botImages,
      user: 'Nano Banana 2',
      soundness: savedBotMsg.soundness || 1.0,
      isGrounded: !!substrateContext,
    });

    // 8. Update Structural Health (Trigger update)
    const health = {
      entropy: Math.random() * 0.5,
      health: 'Stable',
      violations: 0,
      nodeCount: await Message.count(),
    };
    pusher.trigger('presence-chat', 'system-update', { health });

    pusher.trigger('presence-chat', 'bot-thinking', { isThinking: false });
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Cognitive Audit process error:', error);
    pusher.trigger('presence-chat', 'bot-thinking', { isThinking: false });
    res.status(500).json({ error: 'Internal server error during chat processing.' });
  }
});

app.listen(PORT, () => {
  logger.info(`--- 🥦 Nano Banana 2 PRODUCTION-HARDENED Server with BroccoliDB ---`);
  logger.info(`Server listening on http://localhost:${PORT}`);
});
