# ⚙️ Configuration Guide

This document outlines how to properly configure the DreamBeesAI platform for development and production environments.

---

## 📄 Environment variables (.env)

The backend requires a `.env` file in the `backend/` directory. If it doesn't exist, create it from the following template:

```env
# Server Port
PORT=3001

# Gemini API Key (Required)
# Get one at: https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key

# Soketi / Pusher Configuration (Required)
SOKETI_APP_ID=app-id
SOKETI_APP_KEY=app-key
SOKETI_APP_SECRET=app-secret
SOKETI_HOST=127.0.0.1
SOKETI_PORT=6001
SOKETI_TLS=false
SOKETI_CLUSTER=mt1

# Discord Integration (Optional)
DISCORD_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_guild_id
DISCORD_CHANNEL_ID=your_target_channel_id

# Telegram Integration (Optional)
# Get one from @BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Database Configuration
DB_STORAGE=nano_banana.db
NODE_ENV=development
```

---

## 🤖 Bot Setup

### 1. Discord Bot
To enable the Discord integration:
1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Create a new Application and add a Bot.
3.  Copy the **Token** and paste it into `DISCORD_TOKEN`.
4.  Under the **Bot** tab, enable all **Privileged Gateway Intents** (specifically Message Content Intent).
5.  Invite the bot to your server with `bot` and `application.commands` scopes and Administrator permissions (for simplicity).
6.  Copy the **Server ID** and **Channel ID** where you want the bot to resonate and paste them into `DISCORD_GUILD_ID` and `DISCORD_CHANNEL_ID`.

### 2. Telegram Bot
To enable Telegram:
1.  Message [@BotFather](https://t.me/botfather) on Telegram.
2.  Use `/newbot` and follow the prompts.
3.  Copy the **API Token** and paste it into `TELEGRAM_BOT_TOKEN`.
4.  The bot will automatically start listening for messages once the backend is launched.

---

## 🌐 Soketi (WebSockets)

DreamBeesAI uses **Soketi** as its WebSocket server.

### Local Development
Run the included helper script to start a local Soketi instance:
```bash
chmod +x start-soketi.sh
./start-soketi.sh
```
This will start the server on `127.0.0.1:6001` with default credentials matching the `.env` template.

### Production
For production environments, ensure:
-   `SOKETI_TLS` is set to `true` if serving over HTTPS.
-   The firewall allows traffic on the configured `SOKETI_PORT`.
-   You use a production-grade process manager like `pm2`.

---

## 🗄️ Database (BroccoliDB)

The system uses SQLite by default.
-   The database file is specified by `DB_STORAGE` (default: `nano_banana.db`).
-   The schema is automatically synchronized on startup via Sequelize.
-   **Purging**: You can clear the cognitive substrate by sending a `DELETE` request to `/api/history`.
