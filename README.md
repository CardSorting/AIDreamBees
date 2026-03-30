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

## ⚡ Performance: The High-Speed Engine

DreamBeesAI isn't a standard chat app—it's built like a high-performance engine. We use a custom-built infrastructure layer that makes SQLite feel as fast as a powerhouse like Redis, while keeping everything simple and local in a single file.

- **📬 The Task Butler (`SqliteQueue`)**: Think of this as a high-speed inbox. It manages all background tasks—like generating images or processing messages—without ever slowing down the main conversation. It's **Memory-First**, meaning it works at the speed of RAM, but it's **Hardened**, so if the power goes out, it remembers exactly where it left off.
- **📚 The Smart Storage Manager (`BufferedDbPool`)**: Instead of writing to the hard drive every single time a small change happens (which is slow), this "Storage Manager" collects many small updates and writes them all at once in a single, efficient burst. This **Write-Behind** strategy keeps the app feeling snappy even under heavy load.
- **🛡️ Private Workspaces (`Agent Shadows`)**: Every AI agent gets its own "scratchpad" to think and work. Their changes only become permanent once they're finished, ensuring everything stays consistent and organized.

### ⚡ Verified Benchmarks (50k Stress Test)
| Component | Throughput | Latency (p95) |
| :--- | :--- | :--- |
| **BroccoliDB (`BufferedDbPool`)** | **~97,000 ops/sec** | < 0.4ms (Enqueue) |
| **Task Butler (`SqliteQueue`)** | **~38,000 jobs/sec** | 516ms (Flush/Cycle) |

> [!NOTE]
> These results were achieved on a standard machine using SQLite's Write-Ahead Logging (WAL) and our custom O(1) in-memory merging engine.


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
    User((User)) -->|WebSocket| Frontend[Web UI - Vite/React]
    Frontend <-->|Real-time| Soketi[Soketi WS]
    Soketi <-->|Broadcast| Backend[Backend - Node.ts]
    
    subgraph "High-Performance Brain"
        Backend -->|Schedule Job| Queue["SqliteQueue (~38k/sec)"]
        Queue -->|Write-Behind| DBManager["BufferedDbPool (~97k/sec)"]
        DBManager <-->|O(1) Merge| BDB[("BroccoliDB - Cognitive Substrate")]
    end
    
    Backend -->|Generation| Gemini[Gemini API - Nano Banana]
    Discord[Discord Client] --> Backend
    Telegram[Telegram Client] --> Backend
```

---

*DreamBeesAI is a community-driven project created by CardSorting/DreamBeesAI Contributors.*
