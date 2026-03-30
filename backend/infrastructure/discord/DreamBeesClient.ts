import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
} from 'discord.js';
import type {
  Message,
  TextChannel,
  ThreadChannel,
} from 'discord.js';
import dotenv from 'dotenv';
import winston from 'winston';

dotenv.config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export class DreamBeesAIClient {
  private client: Client;
  private onMessageCallback: (message: Message, thread: ThreadChannel) => Promise<void>;

  constructor(onMessageCallback: (message: Message, thread: ThreadChannel) => Promise<void>) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.onMessageCallback = onMessageCallback;
    this.setupListeners();
  }

  private setupListeners() {
    this.client.once(Events.ClientReady, (readyClient) => {
      logger.info(`Ready! Logged in as ${readyClient.user.tag} (DreamBeesAI)`);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;

      // Logic: If message is in the main channel, create a thread
      if (message.channelId === process.env.DISCORD_CHANNEL_ID) {
        await this.handleMainChannelMessage(message);
      } else if (message.channel.isThread()) {
        // If message is in a thread, treat it as a studio interaction
        await this.onMessageCallback(message, message.channel as ThreadChannel);
      }
    });
  }

  private async handleMainChannelMessage(message: Message) {
    try {
      const channel = message.channel as TextChannel;
      const threadName = `${message.author.username}'s Art Studio`;

      // Check if thread already exists (optional, or just create new one)
      const thread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: 60,
        type: ChannelType.PublicThread,
        reason: 'New private art studio for user',
      });

      await thread.send(`Welcome to your private art studio, ${message.author.username}! I am DreamBeesAI, your AI creative partner.`);
      
      // Pass the original message to the callback within the context of the new thread
      await this.onMessageCallback(message, thread);
    } catch (error) {
      logger.error('Failed to create thread:', error);
    }
  }

  public async start() {
    if (!process.env.DISCORD_TOKEN) {
      logger.warn('DISCORD_TOKEN not found. DreamBees bot will not start.');
      return;
    }
    await this.client.login(process.env.DISCORD_TOKEN);
  }

  public getClient() {
    return this.client;
  }
}
