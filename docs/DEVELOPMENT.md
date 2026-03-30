# 🛠️ Development Guide

Welcome to the DreamBeesAI development hive! This document provides information for contributors looking to extend or modify the platform.

---

## 📁 Directory Structure

The project is split into a monorepo-style structure:

```text
/
├── backend/            # Express.js Server (TS)
│   ├── broccolidb/    # Core substrate logic & CLI
│   ├── core/         # Bot Orchestrators (Discord/Telegram)
│   ├── infrastructure/# Third-party client implementations
│   ├── routes/       # API route definitions
│   └── server.ts      # Main entry point
├── frontend/           # React Web Client (Vite)
│   ├── src/
│   │   ├── components/ # Atomic UI components
│   │   ├── hooks/      # Soketi & Data hooks
│   │   └── App.tsx     # Main application shell
├── docs/               # Technical Documentation
└── start-soketi.sh     # WebSocket server helper script
```

---

## 📜 Development Scripts

### Root Level
-   `npm run dev`: (Optional) If you've set up a root runner, otherwise see below.

### Backend (`/backend`)
-   `npm start`: Launches the server with `tsx` (TypeScript Execution).
-   `npm run setup`: Initializes necessary database tables.
-   `npm run substrate:cli`: Enters the interactive BroccoliDB CLI for auditing cognitive nodes.

### Frontend (`/frontend`)
-   `npm run dev`: Starts the Vite development server.
-   `npm run build`: Compiles the production React application.

---

## 🎨 UI & Styling

The frontend uses **Framer Motion** for animations and **Vanilla CSS** for high-performance styling.
-   **Color Palette**: Controlled via CSS variables in `index.css`.
-   **Animations**: All "Thinking" states and message bubbles use Framer Motion for smooth transitions.
-   **Icons**: Provided by `lucide-react`.

---

## 🧪 Contribution Workflow

1.  **Branching**: Create a feature branch from `main`.
2.  **Linting**: Run `npx @biomejs/biome check` (if installed) or ensure code follows the existing style.
3.  **Testing**: Currently, manual verification via `api/health` and the Web UI is recommended.
4.  **Resonance**: Ensure any new logic preserves the "Cognitive Substrate" integrity (BroccoliDB).

---

## 🥦 BroccoliDB Audit Logs

When developing, check `backend/combined.log` for cognitive audit trails and Soketi broadcast confirmations.
To view the database directly, you can use any SQLite browser on `backend/nano_banana.db`.
