import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function setup() {
  const rl = readline.createInterface({ input, output });
  const envPath = path.resolve(process.cwd(), '.env');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  const asciiArt = `
\x1b[36m   _____                             ____                      _     _____ 
  |  __ \\                           |  _ \\                    / \\   |_   _|
  | |  | | _ __  ___   __ _  _ __ ___ | |_) |  ___   ___  ___   / _ \\    | |  
  | |  | || '__|/ _ \\ / _\` || '_ \` _ \\|  _ <  / _ \\ / _ \\/ __| / ___ \\   | |  
  | |__| || |  |  __/| (_| || | | | | || |_) ||  __/|  __/\\__ \\/ /   \\ \\ _| |_ 
  |_____/ |_|   \\___| \\__,_||_| |_| |_||____/  \\___| \\___||___/_/     \\_\\_____|
\x1b[0m`;

  console.log(asciiArt);
  console.log('\x1b[33m%s\x1b[0m', '🌟 Welcome to the DreamBeesAI Onboarding Tool! 🌟');
  console.log('\x1b[33m%s\x1b[0m', '------------------------------------------------');
  console.log('\x1b[90m%s\x1b[0m', 'Building the future of AI orchestration...\n');

  if (!fs.existsSync(envExamplePath)) {
    console.error('❌ .env.example file not found. Please ensure you are running this from the backend directory.');
    process.exit(1);
  }

  const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
  const lines = exampleContent.split('\n');
  const newEnv: string[] = [];

  let skipDiscord = false;
  let skipTelegram = false;

  for (const line of lines) {
    if (line.trim() === '' || line.startsWith('#')) {
      newEnv.push(line);
      continue;
    }

    const [key, defaultValue] = line.split('=');
    if (!key) {
      newEnv.push(line);
      continue;
    }

    // Interactive skipping with help
    if (key === 'DISCORD_TOKEN') {
      const skip = await rl.question('\x1b[35mDo you want to set up Discord? (y/n, or type "help"): \x1b[0m');
      if (skip.toLowerCase() === 'help') {
        console.log('\n\x1b[35m🎮 DISCORD SETUP WALKTHROUGH:\x1b[0m');
        console.log('1. Go to the Discord Developer Portal: https://discord.com/developers/applications');
        console.log('2. Create a "New Application".');
        console.log('3. Go to "Bot" settings, reset/copy your "Token".');
        console.log('4. Ensure "Message Content Intent" is enabled under "Privileged Gateway Intents".\n');
        const skipAfterHelp = await rl.question('Ready to set up Discord? (y/n): ');
        if (skipAfterHelp.toLowerCase() === 'n') skipDiscord = true;
      } else if (skip.toLowerCase() === 'n') {
        skipDiscord = true;
      }
    }

    if (key === 'TELEGRAM_BOT_TOKEN') {
      const skip = await rl.question('\x1b[34mDo you want to set up Telegram? (y/n, or type "help"): \x1b[0m');
      if (skip.toLowerCase() === 'help') {
        console.log('\n\x1b[34m📱 TELEGRAM SETUP WALKTHROUGH:\x1b[0m');
        console.log('1. Open Telegram and search for "@BotFather".');
        console.log('2. Send "/newbot" and follow the prompts to name your bot.');
        console.log('3. Copy the "HTTP API token" provided at the end.\n');
        const skipAfterHelp = await rl.question('Ready to set up Telegram? (y/n): ');
        if (skipAfterHelp.toLowerCase() === 'n') skipTelegram = true;
      } else if (skip.toLowerCase() === 'n') {
        skipTelegram = true;
      }
    }

    // Skip related fields
    if (skipDiscord && key.startsWith('DISCORD_')) {
      newEnv.push(`${key}=`);
      continue;
    }

    if (skipTelegram && key === 'TELEGRAM_BOT_TOKEN') {
      newEnv.push(`${key}=`);
      continue;
    }

    let answer = '';
    if (key === 'GEMINI_API_KEY') {
      const help = await rl.question(`\x1b[32mEnter value for ${key} (or type "help"): \x1b[0m`);
      if (help.toLowerCase() === 'help') {
        console.log('\n\x1b[32m📖 GEMINI API KEY WALKTHROUGH:\x1b[0m');
        console.log('1. Go to https://aistudio.google.com/');
        console.log('2. Click on "Get API key" in the sidebar.');
        console.log('3. Create a new API key in a new or existing project.');
        console.log('4. Copy and paste the key here.\n');
        answer = await rl.question(`Enter value for ${key}: `);
      } else {
        answer = help;
      }
    } else if (key === 'SOKETI_APP_ID' || key === 'SOKETI_APP_KEY' || key === 'SOKETI_APP_SECRET') {
      const help = await rl.question(`\x1b[36mEnter value for ${key} (default: ${defaultValue}, or type "help"): \x1b[0m`);
      if (help.toLowerCase() === 'help') {
        console.log('\n\x1b[36m📡 SOKETI CONFIGURATION GUIDE:\x1b[0m');
        console.log('Soketi is a self-hosted WebSocket server. You can use any values for local development.');
        console.log('Defaults are recommended for local setup:');
        console.log('- ID: app-id');
        console.log('- Key: app-key');
        console.log('- Secret: app-secret\n');
        answer = await rl.question(`Enter value for ${key} (default: ${defaultValue}): `);
      } else {
        answer = help;
      }
    } else {
      answer = await rl.question(`Enter value for ${key}${defaultValue ? ` (default: ${defaultValue})` : ''}: `);
    }
    newEnv.push(`${key}=${answer || defaultValue || ''}`);
  }

  fs.writeFileSync(envPath, newEnv.join('\n'));
  console.log('\n\x1b[32m✅ .env file has been successfully created!\x1b[0m');

  const launchAll = await rl.question('\n\x1b[33m🚀 Do you want to launch EVERYTHING now? (Backend, Soketi, Frontend) (y/n, default: y): \x1b[0m');
  const shouldLaunchAll = launchAll.toLowerCase() !== 'n';

  if (shouldLaunchAll) {
    console.log('\n\x1b[90m📦 Installing all dependencies first...\x1b[0m');
    const { execSync, spawn } = await import('node:child_process');
    try {
      console.log('🔹 Backend dependencies...');
      execSync('npm install', { stdio: 'inherit' });
      console.log('🔹 Frontend dependencies...');
      execSync('cd ../frontend && npm install', { stdio: 'inherit' });

      console.log('\n\x1b[33m🚀 Launching services in parallel...\x1b[0m');

      // Launch Soketi
      console.log('\x1b[36m📡 Starting Soketi...\x1b[0m');
      spawn('bash', ['../start-soketi.sh'], { stdio: 'inherit', shell: true });

      // Launch Backend (wait a second for Soketi)
      setTimeout(() => {
        console.log('\x1b[32m⚙️ Starting Backend...\x1b[0m');
        spawn('npm', ['start'], { stdio: 'inherit', shell: true });
      }, 1000);

      // Launch Frontend
      setTimeout(() => {
        console.log('\x1b[34m🎨 Starting Frontend...\x1b[0m');
        spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true, cwd: '../frontend' });
      }, 2000);

      console.log('\n\x1b[32m🌟 All services are booting up! Check the logs above.\x1b[0m');
    } catch (err) {
      console.error('\x1b[31m❌ Error during automated launch:\x1b[0m', err);
    }
  } else {
    console.log('\n\x1b[32m👍 Setup complete! You can start services manually when ready.\x1b[0m');
  }

  rl.close();
}

setup().catch((err) => {
  console.error('\x1b[31m❌ An error occurred during setup:\x1b[0m', err);
  process.exit(1);
});
