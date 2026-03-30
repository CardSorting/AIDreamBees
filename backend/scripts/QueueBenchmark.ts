import * as fs from 'node:fs';
import * as path from 'node:path';
import { SqliteQueue } from '../broccolidb/infrastructure/queue/SqliteQueue.js';
import { setDbPath } from '../broccolidb/infrastructure/db/Config.js';
import { dbPool } from '../broccolidb/infrastructure/db/BufferedDbPool.js';

/**
 * QueueBenchmark.ts
 *
 * Deep investigation into SQLite Queue performance with BufferedDbPool.
 */

async function runBenchmark() {
  const TOTAL_ITEMS = 10000;
  console.log(`\n=== Queue Deep Investigation Benchmark with BufferedDbPool (${TOTAL_ITEMS} items) ===\n`);

  const dbPath = path.resolve('/tmp', 'benchmark_buffered.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  setDbPath(dbPath);

  // 1. JS Baseline (Memory Array)
  const jsQueue: { id: number; payload: { data: string } }[] = [];
  const startJs = Date.now();
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    jsQueue.push({ id: i, payload: { data: 'test' } });
  }
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    jsQueue.shift();
  }
  const endJs = Date.now();
  console.log(
    `JS Array (In-Memory Baseline): ${endJs - startJs}ms (~${Math.round(TOTAL_ITEMS / ((endJs - startJs) / 1000))} ops/sec)`,
  );

  // 2. Buffered SqliteQueue
  const sqliteQueue = new SqliteQueue<{ data: string }>();
  
  // Enqueue
  const startEnqueue = Date.now();
  await sqliteQueue.enqueueBatch(Array.from({ length: TOTAL_ITEMS }, () => ({ payload: { data: 'test' } })));
  await dbPool.flush(); 
  const endEnqueue = Date.now();
  console.log(
    `SqliteQueue (Buffered Enqueue): ${endEnqueue - startEnqueue}ms (~${Math.round(TOTAL_ITEMS / ((endEnqueue - startEnqueue) / 1000))} ops/sec)`,
  );

  // Process Loop Performance
  const startProcess = Date.now();
  let processedCount = 0;
  await new Promise<void>((resolve) => {
    sqliteQueue.process(
      async () => {
        processedCount++;
        if (processedCount === TOTAL_ITEMS) {
          resolve();
        }
      },
      { concurrency: 100, batchSize: 1000, pollIntervalMs: 1 },
    );
  });
  const endProcess = Date.now();
  sqliteQueue.stop();
  await dbPool.flush();
  console.log(
    `SqliteQueue (Buffered process() loop): ${endProcess - startProcess}ms (~${Math.round(TOTAL_ITEMS / ((endProcess - startProcess) / 1000))} ops/sec)`,
  );

  console.log('\n--- Production Hardening Notes ---');
  console.log(' - BufferedDbPool offloads write transactions to a background loop.');
  console.log(' - Batching dequeueing and processing remains critical for throughput.');
  console.log(' - The combination of WAL mode, BufferedDbPool, and batching provides massive throughput.');

  await dbPool.stop();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

runBenchmark().catch(console.error);
