import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function setup() {
  const rl = readline.createInterface({ input, output });
  const envPath = path.resolve(process.cwd(), '.env');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  console.log('🚀 Welcome to the AIDreamBees Onboarding Tool!\n');

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

    // Interactive skipping
    if (key === 'DISCORD_TOKEN') {
      const skip = await rl.question('Do you want to set up Discord? (y/n, default: y): ');
      if (skip.toLowerCase() === 'n') skipDiscord = true;
    }

    if (key === 'TELEGRAM_BOT_TOKEN') {
      const skip = await rl.question('Do you want to set up Telegram? (y/n, default: y): ');
      if (skip.toLowerCase() === 'n') skipTelegram = true;
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

    const answer = await rl.question(`Enter value for ${key}${defaultValue ? ` (default: ${defaultValue})` : ''}: `);
    newEnv.push(`${key}=${answer || defaultValue || ''}`);
  }

  fs.writeFileSync(envPath, newEnv.join('\n'));
  console.log('\n✅ .env file has been successfully created!');

  const runSoketi = await rl.question('\nDo you want to start the Soketi server now? (y/n, default: n): ');
  if (runSoketi.toLowerCase() === 'y') {
    console.log('🚀 Starting Soketi server...');
    const { exec } = await import('node:child_process');
    exec('bash ../start-soketi.sh', (err, stdout, stderr) => {
      if (err) console.error('❌ Error starting Soketi:', err);
      console.log(stdout);
      console.error(stderr);
    });
  }

  const setupFrontend = await rl.question('\nDo you want to install frontend dependencies? (y/n, default: n): ');
  if (setupFrontend.toLowerCase() === 'y') {
    console.log('📦 Installing frontend dependencies...');
    const { execSync } = await import('node:child_process');
    try {
      execSync('cd ../frontend && npm install', { stdio: 'inherit' });
      console.log('✅ Frontend dependencies installed successfully!');
    } catch (err) {
      console.error('❌ Error installing frontend dependencies:', err);
    }
  }

  rl.close();
}

setup().catch((err) => {
  console.error('❌ An error occurred during setup:', err);
  process.exit(1);
});
