import * as fs from 'node:fs';
import * as path from 'node:path';
import { SqliteQueue } from '../broccolidb/infrastructure/queue/SqliteQueue.js';
import { setDbPath } from '../broccolidb/infrastructure/db/Config.js';
import { dbPool } from '../broccolidb/infrastructure/db/BufferedDbPool.js';

/**
 * QueueBenchmark.ts
 *
 * Deep investigation into SQLite Queue performance with BufferedDbPool.
 * Optimized for maximum throughput with pipelining and batch processing.
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
  const jsOps = Math.round(TOTAL_ITEMS / ((endJs - startJs) / 1000));
  console.log(`JS Array (In-Memory Baseline): ${endJs - startJs}ms (~${jsOps.toLocaleString()} ops/sec)`);

  // 2. Buffered SqliteQueue - Enqueue
  const sqliteQueue = new SqliteQueue<{ data: string }>();
  
  const startEnqueue = Date.now();
  await sqliteQueue.enqueueBatch(Array.from({ length: TOTAL_ITEMS }, () => ({ payload: { data: 'test' } })));
  await dbPool.flush(); 
  const endEnqueue = Date.now();
  const enqueueOps = Math.round(TOTAL_ITEMS / ((endEnqueue - startEnqueue) / 1000));
  console.log(`SqliteQueue (Buffered Enqueue): ${endEnqueue - startEnqueue}ms (~${enqueueOps.toLocaleString()} ops/sec)`);

  // 3. Optimized process() with pipelining (individual job handler)
  const sqliteQueue2 = new SqliteQueue<{ data: string }>();
  await sqliteQueue2.enqueueBatch(Array.from({ length: TOTAL_ITEMS }, () => ({ payload: { data: 'test' } })));
  await dbPool.flush();

  const startProcess = Date.now();
  let processedCount = 0;
  await new Promise<void>((resolve) => {
    sqliteQueue2.process(
      async () => {
        processedCount++;
        if (processedCount === TOTAL_ITEMS) {
          resolve();
        }
      },
      { 
        concurrency: 500,           // Higher concurrency for pipelining
        batchSize: 500,             // Larger dequeue batches
        pollIntervalMs: 1,          // Fast polling
        completionFlushMs: 1,       // Aggressive completion batching
      },
    );
  });
  const endProcess = Date.now();
  sqliteQueue2.stop();
  await dbPool.flush();
  const processOps = Math.round(TOTAL_ITEMS / ((endProcess - startProcess) / 1000));
  console.log(`SqliteQueue (Optimized process()): ${endProcess - startProcess}ms (~${processOps.toLocaleString()} ops/sec)`);

  // 4. NEW: processBatch() - True batch processing for maximum throughput
  const sqliteQueue3 = new SqliteQueue<{ data: string }>();
  await sqliteQueue3.enqueueBatch(Array.from({ length: TOTAL_ITEMS }, () => ({ payload: { data: 'test' } })));
  await dbPool.flush();

  const startBatchProcess = Date.now();
  let batchProcessedCount = 0;
  await new Promise<void>((resolve) => {
    sqliteQueue3.processBatch(
      async (jobs) => {
        // Batch handler receives array of jobs - process all at once
        batchProcessedCount += jobs.length;
        if (batchProcessedCount >= TOTAL_ITEMS) {
          resolve();
        }
      },
      { 
        batchSize: 1000,            // Large batches for fewer transactions
        maxInFlightBatches: 5,      // Pipeline multiple batches
        pollIntervalMs: 1,
        completionFlushMs: 1,
      },
    );
  });
  const endBatchProcess = Date.now();
  sqliteQueue3.stop();
  await dbPool.flush();
  const batchProcessOps = Math.round(TOTAL_ITEMS / ((endBatchProcess - startBatchProcess) / 1000));
  console.log(`SqliteQueue (NEW processBatch()): ${endBatchProcess - startBatchProcess}ms (~${batchProcessOps.toLocaleString()} ops/sec)`);

  // Summary with improvement metrics
  console.log('\n=== PERFORMANCE SUMMARY ===');
  console.log(`Baseline (JS Array):        ${jsOps.toLocaleString().padStart(10)} ops/sec`);
  console.log(`Buffered Enqueue:           ${enqueueOps.toLocaleString().padStart(10)} ops/sec`);
  console.log(`Optimized process():        ${processOps.toLocaleString().padStart(10)} ops/sec`);
  console.log(`NEW processBatch():         ${batchProcessOps.toLocaleString().padStart(10)} ops/sec`);
  
  const improvement = Math.round((processOps / 29499) * 100);
  const batchImprovement = Math.round((batchProcessOps / 29499) * 100);
  console.log(`\nImprovement over original: ${improvement}% (process), ${batchImprovement}% (processBatch)`);

  console.log('\n--- Optimization Highlights ---');
  console.log('✓ Pipelined dequeueing: Overlap next batch fetch with current processing');
  console.log('✓ Reduced mutex contention: Fast-path buffer checks, coalesced flushes');
  console.log('✓ Aggressive batching: 500-1000 job batches reduce transaction overhead');
  console.log('✓ processBatch(): True batch processing - handler receives job[] not individual jobs');
  console.log('✓ Adaptive completion flushing: Immediate flush at batch size, debounced otherwise');

  await dbPool.stop();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

runBenchmark().catch(console.error);
