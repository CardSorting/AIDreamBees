import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function setup() {
  const rl = readline.createInterface({ input, output });
  const envPath = path.resolve(process.cwd(), '.env');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  console.log('\n🌟 Welcome to the AIDreamBees Onboarding Tool! 🌟');
  console.log('--------------------------------------------\n');

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

  const launchAll = await rl.question('\n🚀 Do you want to launch EVERYTHING now? (Backend, Soketi, Frontend) (y/n, default: y): ');
  const shouldLaunchAll = launchAll.toLowerCase() !== 'n';

  if (shouldLaunchAll) {
    console.log('\n📦 Installing all dependencies first...');
    const { execSync, spawn } = await import('node:child_process');
    try {
      console.log('🔹 Backend dependencies...');
      execSync('npm install', { stdio: 'inherit' });
      console.log('🔹 Frontend dependencies...');
      execSync('cd ../frontend && npm install', { stdio: 'inherit' });

      console.log('\n🚀 Launching services in parallel...');

      // Launch Soketi
      console.log('📡 Starting Soketi...');
      spawn('bash', ['../start-soketi.sh'], { stdio: 'inherit', shell: true });

      // Launch Backend (wait a second for Soketi)
      setTimeout(() => {
        console.log('⚙️ Starting Backend...');
        spawn('npm', ['start'], { stdio: 'inherit', shell: true });
      }, 1000);

      // Launch Frontend
      setTimeout(() => {
        console.log('🎨 Starting Frontend...');
        spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true, cwd: '../frontend' });
      }, 2000);

      console.log('\n🌟 All services are booting up! Check the logs above.');
    } catch (err) {
      console.error('❌ Error during automated launch:', err);
    }
  } else {
    console.log('\n👍 Setup complete! You can start services manually when ready.');
  }

  rl.close();
}

setup().catch((err) => {
  console.error('❌ An error occurred during setup:', err);
  process.exit(1);
});
