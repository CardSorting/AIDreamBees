import { Message as DiscordMessage, ThreadChannel } from 'discord.js';
import { getAIResponse } from '../gemini.js';
import { Message as DBMessage } from '../db.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export class DiscordOrchestrator {
  public static async handleMessage(message: DiscordMessage, thread: ThreadChannel) {
    try {
      // 1. Prepare history for Gemini
      // Note: We might want to fetch thread history from DB or Discord. 
      // For now, let's just use the current message or a brief window.
      const userMessageContent = message.content;
      
      // 2. Add message to BroccoliDB (optional, but good for unified history)
      await DBMessage.create({
        user: message.author.username,
        message: userMessageContent,
        type: 'user',
        images: [], // Discord images could be handled here later
      });

      // 3. Indicate thinking
      await thread.sendTyping();

      // 4. Get AI Response
      // Substrate Context could be injected here if we have search capability
      const substrateContext = `User: ${message.author.username}, Channel: ${thread.name}`;
      
      const responseParts = await getAIResponse([], userMessageContent, substrateContext, false);

      // 5. Send back to Discord thread
      for (const part of responseParts) {
        if (part.type === 'text') {
          // Send in chunks if needed (Discord limit is 2000 chars)
          await thread.send(part.content.substring(0, 2000));
        } else if (part.type === 'image') {
          // Part content is base64
          const buffer = Buffer.from(part.content.split(',')[1] || part.content, 'base64');
          await thread.send({
            files: [{
              attachment: buffer,
              name: 'dream.png'
            }]
          });
        }
      }

      // 6. Save AI Message to DB
      const botText = responseParts.filter(p => p.type === 'text').map(p => p.content).join('\n');
      await DBMessage.create({
        user: 'DreamBees',
        message: botText,
        type: 'bot',
        images: responseParts.filter(p => p.type === 'image').map(p => p.content),
      });

    } catch (error) {
      logger.error('Discord Orchestrator Error:', error);
      await thread.send("I'm sorry, I'm having trouble thinking right now. Please try again later.");
    }
  }
}
