# 🩹 DreamBeesAI Troubleshooting Guide

Have you hit a snag? Don't worry, even a hive needs a little tune-up sometimes. Here are some of the most common issues and how to fix them!

---

## 🌩️ Connection Issues

### ❌ "The Web UI Is Stuck on 'Connecting'"
-   **Why it's happening**: The frontend can't find the Soketi (WebSocket) server.
-   **The Fix**:
    1.  Make sure you ran the `./start-soketi.sh` script in a terminal.
    2.  Check that the port `6001` is open on your firewall.
    3.  Refresh your browser.

---

## 🤖 Bot Issues (Discord/Telegram)

### ❌ "My Bot Join the Server, but Isn't Responding"
-   **Why it's happening**: The bot might not have the correct permissions to read messages.
-   **The Fix**:
    1.  **Discord**: Go to your [Developer Portal](https://discord.com/developers/applications) and make sure "Message Content Intent" is turned **ON**.
    2.  **Permissions**: Ensure the bot has permission to "Read Message History" and "Send Messages" in the specific channel.

### ❌ "I Get an Authorization Error When Telegram Messages Come In"
-   **Why it's happening**: Your `TELEGRAM_BOT_TOKEN` might be incorrect or expired.
-   **The Fix**: Double-check your `.env` file against what [@BotFather](https://t.me/botfather) gave you.

---

## 🎨 Image Generation Issues

### ❌ "I'm Getting a 403 or 'Access Denied' Error"
-   **Why it's happening**: Your Gemini API key might be invalid or hit its rate limit.
-   **The Fix**: Get a new key from [Google AI Studio](https://aistudio.google.com/) and update your `.env` file. Restart the backend.

### ❌ "The 2x2 Grid Looks Blurry or Failed to Generate"
-   **Why it's happening**: Sometimes the AI struggles with complex requests.
-   **The Fix**: Try a simpler prompt or disable **Grid Mode** to see if individual images generate correctly.

---

## 🧠 Database (Substrate) Issues

### ❌ "Where Did My Conversation History Go?"
-   **Why it's happening**: DreamBeesAI uses **Local Memory**. 
-   **The Fix**: If you moved the `backend/` folder or deleted `nano_banana.db`, your history will be reset. Always keep your database file safe!

---

*Still stuck? Create an issue on GitHub or reach out to the developer.*
