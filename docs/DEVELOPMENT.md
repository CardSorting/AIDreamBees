# 🛠️ Development Guide

Welcome to the **DreamBeesAI** development hive! This document provides information for contributors looking to extend or modify the platform.

---

## 🎨 An Invitation to the Hive

Whether you're a seasoned developer or just starting your journey, your contributions are what keep the DreamBeesAI hive buzzing with life. We believe that **the best ideas for creative AI come from the dreamers who use it.** 

Don't be afraid to break things or ask questions! This is a playground for innovation. If you have an idea for a new feature, a better way to structure the cognitive substrate, or even just a cleaner way to write a CSS rule, we want to hear from you.

> [!TIP]
> Use the [Issue Tracker](https://github.com/CardSorting/DreamBeesAI/issues) to suggest new ideas or report bugs. Every bee makes a difference!

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

---

## ⚡ High-Performance Infrastructure

AIDreamBees uses a custom infrastructure layer to ensure high performance with SQLite.

### Using `dbPool` (BufferedDbPool)
Instead of direct database access, use the `dbPool` for all write operations. It automatically batches and flushes changes.

```typescript
import { dbPool } from './infrastructure/db/BufferedDbPool';

// Standard push (asynchronous, will be batched)
await dbPool.push({
  type: 'insert',
  table: 'messages',
  values: { content: 'Hello' },
  layer: 'domain'
});

// Transactional work (agent-specific shadow)
await dbPool.runTransaction(async (agentId) => {
  await dbPool.push({ ... }, agentId);
  const data = await dbPool.selectWhere('table', { column: 'id', value: 1 }, agentId);
  // ...
});
```

### Using `SqliteQueue`
For background tasks, use the `SqliteQueue`. It is optimized for high-throughput batching.

```typescript
import { SqliteQueue } from './infrastructure/queue/SqliteQueue';

const queue = new SqliteQueue<MyPayload>();

// Enqueue a job
await queue.enqueue({ data: '...' });

// Process jobs individually
queue.process(async (job) => {
  console.log(job.payload);
}, { concurrency: 50 });

// Process jobs in batches (highly recommended for performance)
queue.processBatch(async (jobs) => {
  console.log(`Processing ${jobs.length} jobs`);
}, { batchSize: 500 });
```
