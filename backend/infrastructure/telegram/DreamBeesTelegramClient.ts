import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import winston from 'winston';

dotenv.config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export class DreamBeesAITelegramClient implements TelegramClientInterface {
  private bot: TelegramBot | null = null;
  private onMessageCallback: (bot: TelegramBot, msg: TelegramBot.Message) => Promise<void>;

  constructor(onMessageCallback: (bot: TelegramBot, msg: TelegramBot.Message) => Promise<void>) {
    this.onMessageCallback = onMessageCallback;
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialized');
    }
    await this.bot.sendMessage(chatId, text);
  }

  public async start() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      logger.warn('TELEGRAM_BOT_TOKEN not found. DreamBeesAI Telegram bot will not start.');
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });

    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.from?.is_bot) return;
      if (this.bot) {
        await this.onMessageCallback(this.bot, msg);
      }
    });

    logger.info('DreamBeesAI Telegram bot started (polling)');
  }

  public getBot() {
    return this.bot;
  }
}
