import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import Pusher from 'pusher';
import morgan from 'morgan';
import winston from 'winston';
import { getAIResponse } from './gemini.js';
import { Message, initDB } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- Production Logging (Winston) ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// --- Security & Middleware ---
app.use(helmet());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(cors({
  origin: 'http://localhost:5173', // Frontend URL
  credentials: true
}));
app.use(bodyParser.json({ limit: '20mb' })); // Increase limit for image payloads
app.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));

// Initialize Database (BroccoliDB Cognitive Substrate)
initDB();

// --- Pusher (Soketi) Integration ---
const pusher = new Pusher({
  appId: process.env.SOKETI_APP_ID || "app-id",
  key: process.env.SOKETI_APP_KEY || "app-key",
  secret: process.env.SOKETI_APP_SECRET || "app-secret",
  useTLS: false,
  host: "127.0.0.1",
  port: 6001,
  cluster: "mt1"
});

// --- Authentication Endpoint for Soketi ---
app.post('/broadcasting/auth', (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  
  const auth = pusher.authenticate(socketId, channel, {
    user_id: `user-${Math.floor(Math.random() * 1000)}`,
    user_info: { name: 'Anonymous Banana User' }
  });
  
  res.send(auth);
});

// --- Persistent History API (BroccoliDB Backend) ---
app.get('/api/history', async (req, res) => {
  try {
    const history = await Message.findAll();
    res.json(history);
  } catch (error) {
    logger.error('Failed to fetch history from BroccoliDB Substrate:', error);
    res.status(500).json({ error: 'Failed to load cognitive history' });
  }
});

// Structural Health API
app.get('/api/health', async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (error) {
    logger.error('Failed to get system health:', error);
    res.status(500).json({ error: 'Structural scan failed' });
  }
});

app.delete('/api/history', async (req, res) => {
  try {
    await Message.destroy();
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Failed to purge cognitive substrate:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// --- Real-time Chat API Endpoint (Full Cognitive Substrate) ---
app.post('/api/chat', async (req, res) => {
  const { message, images, history } = req.body;
  
  if (!message && (!images || images.length === 0)) {
    return res.status(400).json({ error: "Message or image is required." });
  }

  try {
    // 1. Save User Message (Indexing as Knowledge Node)
    await Message.create({
      user: 'You',
      message: message || '',
      type: 'user',
      images: images || []
    });

    // 2. Trigger "Thinking" status via Soketi
    pusher.trigger('presence-chat', 'bot-thinking', { isThinking: true });

    // 3. Substrate Retrieval (RAG)
    const substrateContext = await searchSubstrate(message);

    // 4. Call Gemini API with Augmented Context
    const resultParts = await getAIResponse(history, message, substrateContext);

    // 5. Process parts (Text and images)
    const botText = resultParts.filter(p => p.type === 'text').map(p => p.content).join('\n\n');
    const botImages = resultParts.filter(p => p.type === 'image').map(p => p.content);

    // 6. Save AI Message & Perform Epistemic Audit in db.js
    const savedBotMsg = await Message.create({
      user: 'Nano Banana 2',
      message: botText,
      type: 'bot',
      images: botImages
    });

    // 7. Broadcast via WebSocket including Epistemic Soundness & Grounding Status
    pusher.trigger('presence-chat', 'bot-message', {
      message: botText,
      images: botImages,
      user: 'Nano Banana 2',
      soundness: savedBotMsg.soundness || 1.0,
      isGrounded: !!substrateContext
    });

    // 8. Generate and Broadcast Proactive Suggestions
    const suggestions = await getCognitiveSuggestions(savedBotMsg.id);
    if (suggestions.length > 0) {
      pusher.trigger('presence-chat', 'substrate-suggestions', { suggestions });
    }

    // 9. Update Structural Health status
    const health = await getSystemHealth();
    pusher.trigger('presence-chat', 'system-update', { health });


    pusher.trigger('presence-chat', 'bot-thinking', { isThinking: false });
    res.json({ status: "success" });
  } catch (error) {
    logger.error("Cognitive Audit process error:", error);
    pusher.trigger('presence-chat', 'bot-thinking', { isThinking: false });
    res.status(500).json({ error: "Internal server error during chat processing." });
  }
});


app.listen(PORT, () => {
  logger.info(`--- 🥦 Nano Banana 2 PRODUCTION-HARDENED Server with BroccoliDB ---`);
  logger.info(`Server listening on http://localhost:${PORT}`);
});


