import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required for cognitive resonance'),
  
  // Soketi / Pusher
  SOKETI_APP_ID: z.string().min(1, 'SOKETI_APP_ID is required'),
  SOKETI_APP_KEY: z.string().min(1, 'SOKETI_APP_KEY is required'),
  SOKETI_APP_SECRET: z.string().min(1, 'SOKETI_APP_SECRET is required'),
  SOKETI_HOST: z.string().default('127.0.0.1'),
  SOKETI_PORT: z.coerce.number().default(6001),
  SOKETI_TLS: z.coerce.boolean().default(false),
  SOKETI_CLUSTER: z.string().default('mt1'),
  
  // Discord (Optional, but bot won't start)
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  
  // Telegram (Optional)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  
  // Database
  DB_STORAGE: z.string().default('nano_banana.db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const validateConfig = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ [CRITICAL] Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
};

export const config = validateConfig();
