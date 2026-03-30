# 🐝 Welcome to DreamBeesAI: The Heart of the Hive

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Soketi](https://img.shields.io/badge/WebSockets-Soketi-6366f1.svg)](https://soketi.app/)
[![Gemini](https://img.shields.io/badge/AI-Gemini%203.1-blue.svg)](https://ai.google.dev/)

**DreamBeesAI** is more than just a messaging layer—it's a high-performance creative ecosystem where humans and AI dream together in real-time. Built on the **Nano Banana 2** (Gemini 3.1 Flash) model, it transcends the boundaries of standard chat to provide a unified, persistent, and "resonant" experience across the Web, Discord, and Telegram.

---

## 👋 New to the Hive?

Welcome! We're so glad you're here. To get started, we've designed a specialized guide just for you:

> [!TIP]
> **[Read the Welcome Letter](docs/WELCOME.md)** to understand the vision and spirit of the DreamBeesAI project!

---

## 🗺️ Choose Your Journey

Where do you want to go next? Pick a path that fits your role:

| I am a... | Start Here |
|---|---|
| **🎨 Creative Artist** | [📖 User Walkthrough](docs/WALKTHROUGH.md) & [📝 Glossary](docs/GLOSSARY.md) |
| **🍪 Quick-Start User** | [🍪 Success Recipes](docs/RECIPES.md) |
| **🛠️ Focused Developer** | [🏗️ Architecture](docs/ARCHITECTURE.md) & [💻 Development Guide](docs/DEVELOPMENT.md) |
| **⚙️ Server Administrator** | [⚙️ Configuration](docs/CONFIGURATION.md) & [🩹 Troubleshooting](docs/TROUBLESHOOTING.md) |
| **🔌 Software Integrator** | [🔌 API Reference](docs/API.md) |

---

## ✨ Features at a Glance

-   **🧠 BroccoliDB Cognitive Substrate**: A private, version-controlled "Digital Brain" for long-term AI memory.
-   **🚀 High-Performance Infrastructure**: Optimized SQLite persistence with `BufferedDbPool` write-behind and `SqliteQueue` batch processing.
-   **⚡ Real-Time Resonance**: Instantaneous communication across all your devices using [Soketi WebSockets](https://soketi.app/).
-   **🎨 Multimodal Alchemy**: High-speed image generation with **Grid Mode** 2x2 synthesis and 4K support.
-   **🤖 Multi-Platform Orchestration**: Fully integrated Discord and Telegram clients with unified history.

---

## ⚡ High-Performance Core

DreamBeesAI is built for speed and reliability, utilizing a custom infrastructure layer on top of SQLite to handle high-concurrency AI workloads:

-   **BufferedDbPool**: Implements an asynchronous **Write-Behind** strategy, batching database operations to minimize disk I/O and maximize throughput.
-   **SqliteQueue**: A memory-first background job system that supports pipelined batching (processing 500+ jobs at once) and automatic crash recovery.
-   **Agent Shadows**: Ensures isolated, consistent state for concurrent AI agents during transactional workflows.

---

## 🚀 Launching the Hive

### 1. Prerequisite Checklist
- **Node.js** v18+ & **npm**
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

### 2. Environment Setup
Clone the repository and create a `.env` file in the `backend/` directory:
```bash
GEMINI_API_KEY=your_key_here
SOKETI_APP_ID=app-id
# ... (See Configuration Guide for more)
```

### 3. Start Breathing Life into the App
```bash
# Terminal 1: WebSocket Server
./start-soketi.sh

# Terminal 2: The Brain (Backend)
cd backend && npm start

# Terminal 3: The Interface (Frontend)
cd frontend && npm run dev
```

Visit `http://localhost:5173` to enter the experience.

---

## 🏗️ The Hive Architecture

```mermaid
graph TD
    User((User)) -->|WebSocket| Frontend[Frontend - Vite/React]
    Frontend <-->|REST/WS| Backend[Backend - Express/TS]
    Discord[Discord Client] -->|Orchestrator| Backend
    Telegram[Telegram Client] -->|Orchestrator| Backend
    Backend <-->|Memory| BDB[(BroccoliDB Substrate)]
    Backend -->|Generation| Gemini[Gemini API - Nano Banana]
```

---

*DreamBeesAI is a community-driven project created by CardSorting/DreamBeesAI Contributors.*
