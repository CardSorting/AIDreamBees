import * as crypto from 'node:crypto';
import { type Kysely, type Transaction, sql } from 'kysely';
import { type Schema, getDb } from './Config.js';

// Production-grade Mutex implementation
class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  constructor(public name: string) {}

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => resolve(() => this.release()));
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

export type DbLayer = 'domain' | 'infrastructure' | 'ui' | 'plumbing';

type WhereCondition = {
  column: string;
  value: string | number | string[] | number[] | null;
  operator?: '=' | '<' | '>' | '<=' | '>=' | '!=' | 'IN' | 'in';
};

export type Increment = { _type: 'increment'; value: number };

export type WriteOp = {
  type: 'insert' | 'update' | 'delete' | 'upsert';
  table: keyof Schema;
  values?: Record<string, unknown | Increment>;
  where?: WhereCondition | WhereCondition[];
  conflictTarget?: string | string[]; // For upserts
  agentId?: string;
  layer?: DbLayer;
};

const LAYER_PRIORITY: Record<DbLayer, number> = {
  domain: 0,
  infrastructure: 1,
  ui: 2,
  plumbing: 3,
};

function normalizeWhere(where: WhereCondition | WhereCondition[] | undefined): WhereCondition[] {
  if (!where) return [];
  return Array.isArray(where) ? where : [where];
}

/**
 * BufferedDbPool provides a high-performance, asynchronous write-behind layer
 * over SQLite. It batches operations, manages agent-specific uncommitted state,
 * and ensures data consistency between in-memory buffers and on-disk storage.
 */
export class BufferedDbPool {
  private globalBuffer: WriteOp[] = [];
  private inFlightOps: WriteOp[] = [];
  private agentShadows = new Map<
    string,
    { ops: WriteOp[]; affectedFiles: Set<string>; lastUpdated: number }
  >();
  private stateMutex = new Mutex('DbStateMutex');
  private flushMutex = new Mutex('DbFlushMutex');
  private flushInterval: NodeJS.Timeout | null = null;
  private db: Kysely<Schema> | null = null;

  constructor() {
    this.startFlushLoop();
  }

  private async ensureDb(): Promise<Kysely<Schema>> {
    if (!this.db) {
      const db = await getDb();
      // Additional performance optimizations for this connection
      await sql`PRAGMA cache_size = -64000;`.execute(db); // 64MB cache
      await sql`PRAGMA temp_store = MEMORY;`.execute(db);
      this.db = db;
    }
    return this.db;
  }

  private flushTimeout: NodeJS.Timeout | null = null;

  private scheduleFlush(delay = 100) {
    if (this.flushTimeout) return;
    this.flushTimeout = setTimeout(async () => {
      try {
        await this.flush();
      } finally {
        this.flushTimeout = null;
        // If there's still work, schedule another flush
        const release = await this.stateMutex.acquire();
        try {
          if (this.globalBuffer.length > 0) {
            this.scheduleFlush(100);
          }
        } finally {
          release();
        }
      }
    }, delay);
  }

  private cleanupInterval: NodeJS.Timeout | null = null;

  private startFlushLoop() {
    this.scheduleFlush(1000); // Periodic check every second as a fallback
    this.flushInterval = setInterval(() => this.scheduleFlush(1000), 1000);

    // Memory safety: cleanup expired agent shadows every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupShadows(), 30000);
  }

  private async cleanupShadows() {
    const release = await this.stateMutex.acquire();
    try {
      const now = Date.now();
      const SHADOW_EXPIRATION = 5 * 60 * 1000; // 5 minutes
      for (const [agentId, shadow] of this.agentShadows.entries()) {
        if (now - shadow.lastUpdated > SHADOW_EXPIRATION) {
          console.warn(`[DbPool] Expiring inactive agent shadow: ${agentId}`);
          this.agentShadows.delete(agentId);
        }
      }
    } finally {
      release();
    }
  }

  public async beginWork(agentId: string) {
    const release = await this.stateMutex.acquire();
    try {
      if (!this.agentShadows.has(agentId)) {
        this.agentShadows.set(agentId, {
          ops: [],
          affectedFiles: new Set(),
          lastUpdated: Date.now(),
        });
      }
    } finally {
      release();
    }
  }

  public async push(op: WriteOp, agentId?: string, affectedFile?: string) {
    return this.pushBatch([op], agentId, affectedFile);
  }

  public async pushBatch(ops: WriteOp[], agentId?: string, affectedFile?: string) {
    let shouldFlush = false;
    const release = await this.stateMutex.acquire();
    try {
      // Backpressure: If global buffer is excessively large, log warning and potentially block
      if (this.globalBuffer.length > 2000) {
        console.warn(
          `[DbPool] High backpressure: globalBuffer length is ${this.globalBuffer.length}`,
        );
        // Optionally: yield or throw if the system is truly overwhelmed
      }

      if (agentId) {
        const shadow =
          this.agentShadows.get(agentId) ??
          ({
            ops: [],
            affectedFiles: new Set<string>(),
            lastUpdated: Date.now(),
          } as { ops: WriteOp[]; affectedFiles: Set<string>; lastUpdated: number });
        for (const op of ops) {
          shadow.ops.push({ ...op, agentId });
        }
        if (affectedFile) shadow.affectedFiles.add(affectedFile);
        shadow.lastUpdated = Date.now();
        this.agentShadows.set(agentId, shadow);
      } else {
        this.globalBuffer.push(...ops);
      }
      shouldFlush = this.globalBuffer.length > 50;
    } finally {
      release();
    }

    if (shouldFlush) {
      this.scheduleFlush(0); // Immediate flush
    } else {
      this.scheduleFlush(100); // Debounced flush
    }
  }

  /**
   * Commits an agent's work, moving their private shadow buffer to the global
   * flush buffer and scheduling an immediate flush.
   */
  public async commitWork(agentId: string) {
    let shadowOpsCount = 0;

    const release = await this.stateMutex.acquire();
    try {
      const shadow = this.agentShadows.get(agentId);
      this.agentShadows.delete(agentId);
      if (shadow && shadow.ops.length > 0) {
        shadowOpsCount = shadow.ops.length;
        this.globalBuffer.push(...shadow.ops);
      }
    } finally {
      release();
    }

    if (shadowOpsCount > 0) {
      this.scheduleFlush(0); // Trigger flush asynchronously to avoid nested mutex acquisition
    }
  }

  public async rollbackWork(agentId: string) {
    const release = await this.stateMutex.acquire();
    try {
      this.agentShadows.delete(agentId);
    } finally {
      release();
    }
  }

  public async runTransaction<T>(callback: (agentId: string) => Promise<T>): Promise<T> {
    const agentId = `trx-${crypto.randomUUID()}`;
    await this.beginWork(agentId);
    try {
      const result = await callback(agentId);
      await this.commitWork(agentId);
      return result;
    } catch (e) {
      await this.rollbackWork(agentId);
      throw e;
    }
  }

  /**
   * Flushes all buffered operations to disk in a single transaction.
   * Handles bulk inserts, upserts, and complex updates with increment support.
   * Optimized for high throughput with reduced mutex contention.
   */
  public async flush() {
    // Fast path: check without mutex first
    if (this.globalBuffer.length === 0 && this.inFlightOps.length === 0) return;

    const releaseFlush = await this.flushMutex.acquire();
    let opsToFlush: WriteOp[] = [];
    const startTime = Date.now();

    try {
      // Double-check after acquiring flush mutex
      const releaseState = await this.stateMutex.acquire();
      try {
        if (this.globalBuffer.length === 0) return;

        opsToFlush = this.globalBuffer.sort((a, b) => {
          const pA = LAYER_PRIORITY[a.layer ?? 'plumbing'];
          const pB = LAYER_PRIORITY[b.layer ?? 'plumbing'];
          return pA - pB;
        });
        this.globalBuffer = [];
        this.inFlightOps = opsToFlush;
      } finally {
        releaseState();
      }

      const db = await this.ensureDb();
      let totalFlushed = 0;

      await db.transaction().execute(async (trx) => {
        const processedGroups = this.groupOps(opsToFlush);

        for (const group of processedGroups) {
          const first = group[0];
          if (!first) continue;
          const table = first.table;

          if (group.length > 1 && first.type === 'insert') {
            totalFlushed += await this.executeBulkInsert(trx, table, group);
          } else if (group.length > 1 && first.type === 'update') {
            // Batch updates when possible
            totalFlushed += await this.executeBulkUpdate(trx, table, group);
          } else {
            for (const op of group) {
              await this.executeSingleOp(trx, op);
              totalFlushed++;
            }
          }
        }
      });

      const duration = Date.now() - startTime;
      const throughput = Math.round(totalFlushed / (duration / 1000));
      if (duration > 100 || totalFlushed > 50) {
        console.log(
          `[DbPool] Flush completed: ${totalFlushed} ops in ${duration}ms (${throughput} ops/sec, buffer: ${this.globalBuffer.length})`,
        );
      }

      const releaseStateClear = await this.stateMutex.acquire();
      try {
        this.inFlightOps = [];
      } finally {
        releaseStateClear();
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const isRetryable =
        err.code === 'SQLITE_BUSY' ||
        err.code === 'SQLITE_LOCKED' ||
        err.message?.includes('deadlock');

      if (isRetryable) {
        console.warn(`[DbPool] Flush failed (retryable), restoring ops to buffer: ${err.message}`);
      } else {
        console.error(
          `[DbPool] Flush failed (fatal), some operations may be lost: ${err.message}`,
          e,
        );
      }

      const releaseState = await this.stateMutex.acquire();
      try {
        if (isRetryable) {
          // Re-insert failing ops at the beginning of the buffer to maintain some order
          this.globalBuffer = [...opsToFlush, ...this.globalBuffer];
        }
        this.inFlightOps = [];
      } finally {
        releaseState();
      }
      if (isRetryable) throw e; // Propagate for immediate re-schedule if desired
    } finally {
      releaseFlush();
    }
  }

  /**
   * Execute batch updates for improved throughput.
   * Groups updates by their column values for efficient bulk operations.
   */
  private async executeBulkUpdate(
    trx: Transaction<Schema>,
    table: keyof Schema,
    group: WriteOp[],
  ): Promise<number> {
    if (group.length === 0) return 0;

    // Optimization: If all updates are the same set of values and targeting a list of IDs via 'id IN (...)'
    // This is common for queue status updates (e.g., status='done' for a batch of jobs)
    const first = group[0];
    const canBatchIntoSingleStatement = group.every(
      (op) =>
        JSON.stringify(op.values) === JSON.stringify(first.values) &&
        op.where &&
        !Array.isArray(op.where) &&
        op.where.column === 'id' &&
        (op.where.operator === '=' || op.where.operator === undefined),
    );

    if (canBatchIntoSingleStatement && first.where && !Array.isArray(first.where)) {
      const ids = group.map((op) => (op.where as WhereCondition).value);
      const valuesWithNoIncrements: Record<string, unknown> = {};
      const increments: Record<string, number> = {};

      for (const [k, v] of Object.entries(first.values || {})) {
        if (this.isIncrement(v)) {
          increments[k] = v.value;
        } else {
          valuesWithNoIncrements[k] = v;
        }
      }

      let query = trx.updateTable(table);
      const sets: Record<string, unknown> = { ...valuesWithNoIncrements };
      for (const [k, v] of Object.entries(increments)) {
        sets[k] = sql`${sql.ref(k)} + ${v}`;
      }

      await query
        .set(sets as never)
        .where('id' as any, 'in', ids as any)
        .execute();
      return group.length;
    }

    // Fallback: Parallel execution for heterogeneous updates
    const promises: Promise<void>[] = [];
    for (const op of group) {
      promises.push(this.executeSingleOp(trx, op));
    }
    await Promise.all(promises);
    return group.length;
  }

  /**
   * Selects rows from a table, merging on-disk results with uncommitted
   * operations from the global buffer and agent shadows.
   */
  public async selectWhere<T extends keyof Schema>(
    table: T,
    where: WhereCondition | WhereCondition[],
    agentId?: string,
    options?: {
      orderBy?: { column: keyof Schema[T]; direction: 'asc' | 'desc' };
      limit?: number;
    },
  ): Promise<Schema[T][]> {
    const release = await this.stateMutex.acquire();
    try {
      const db = await this.ensureDb();
      const conditions = normalizeWhere(where);

      let query = (db as any).selectFrom(table).selectAll();
      for (const cond of conditions) {
        const opStr = cond.operator || '=';
        if (Array.isArray(cond.value)) {
          query = query.where(cond.column, 'in', cond.value);
        } else {
          query = query.where(cond.column, opStr, cond.value);
        }
      }

      if (options?.orderBy) {
        query = query.orderBy(options.orderBy.column, options.orderBy.direction);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const diskResults = (await query.execute()) as Schema[T][];

      const applyOps = (ops: WriteOp[], target: Schema[T][]) => {
        for (const op of ops) {
          if (op.table !== table) continue;

          const applyValues = (existing: unknown, newValues: Record<string, unknown>) => {
            const next = { ...(existing as Record<string, unknown>) };
            for (const [k, v] of Object.entries(newValues)) {
              if (this.isIncrement(v)) {
                next[k] = (Number(next[k]) || 0) + v.value;
              } else {
                next[k] = v;
              }
            }
            return next as Schema[T];
          };

          const opWhere = normalizeWhere(op.where);
          const matches = (r: unknown) => {
            const row = r as Record<string, unknown>;
            if (opWhere.length === 0) return false;
            return opWhere.every((c) => {
              const val = row[c.column];
              const opStr = c.operator || '=';
              if (opStr === '=') return val === c.value;
              if (opStr === '!=') return val !== c.value;
              if (opStr === '>') return Number(val) > Number(c.value);
              if (opStr === '<') return Number(val) < Number(c.value);
              if (opStr === '>=') return Number(val) >= Number(c.value);
              if (opStr === '<=') return Number(val) <= Number(c.value);
              if (opStr === 'IN' && Array.isArray(c.value)) return (c.value as any[]).includes(val);
              return false;
            });
          };

          if (op.type === 'insert' && op.values) {
            target.push({ ...op.values } as unknown as Schema[T]);
          } else if (op.type === 'upsert' && op.values) {
            const pkMatch = (r: unknown) => {
              const row = r as Record<string, unknown>;
              if (opWhere.length > 0) return matches(row);
              return (
                row.id !== undefined &&
                (op.values as Record<string, unknown>).id !== undefined &&
                row.id === (op.values as Record<string, unknown>).id
              );
            };
            const existingIdx = target.findIndex(pkMatch);
            if (existingIdx >= 0) {
              target[existingIdx] = applyValues(target[existingIdx], op.values as any);
            } else {
              target.push({ ...op.values } as unknown as Schema[T]);
            }
          } else if (op.type === 'update' && op.values) {
            for (let i = 0; i < target.length; i++) {
              if (matches(target[i])) {
                target[i] = applyValues(target[i], op.values as any);
              }
            }
          } else if (op.type === 'delete') {
            for (let i = target.length - 1; i >= 0; i--) {
              if (matches(target[i])) {
                target.splice(i, 1);
              }
            }
          }
        }
      };

      let finalResults = [...diskResults];
      applyOps(this.inFlightOps, finalResults);
      applyOps(this.globalBuffer, finalResults);
      if (agentId) {
        const shadow = this.agentShadows.get(agentId);
        if (shadow) {
          applyOps(shadow.ops, finalResults);
        }
      }

      // Final pass for sorting/limiting on merged results
      if (options?.orderBy) {
        const col = options.orderBy.column as string;
        const dir = options.orderBy.direction;
        finalResults.sort((a: unknown, b: unknown) => {
          const valA = (a as Record<string, any>)[col];
          const valB = (b as Record<string, any>)[col];
          if (valA === undefined || valB === undefined) return 0;
          if (valA === null || valB === null) return 0;
          if (valA < valB) return dir === 'asc' ? -1 : 1;
          if (valA > valB) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      if (options?.limit) {
        finalResults = finalResults.slice(0, options.limit);
      }

      return finalResults;
    } finally {
      release();
    }
  }

  public async selectOne<T extends keyof Schema>(
    table: T,
    where: WhereCondition | WhereCondition[],
    agentId?: string,
  ): Promise<Schema[T] | null> {
    const results = await this.selectWhere(table, where, agentId);
    return results.length > 0 ? (results[results.length - 1] as Schema[T]) : null;
  }

  public static increment(value: number): Increment {
    return { _type: 'increment', value };
  }

  // --- Private Helpers ---

  private groupOps(ops: WriteOp[]): WriteOp[][] {
    // Coalesce updates if they target the same row and have no increments
    const coalescedOps: WriteOp[] = [];
    const updateCache = new Map<string, number>(); // table:pk -> index in coalescedOps

    for (const op of ops) {
      if (op.type === 'update' && op.where && !Array.isArray(op.where) && op.where.operator === '=') {
        const pk = `${op.table}:${op.where.column}:${op.where.value}`;
        const hasIncrements = Object.values(op.values || {}).some((v) => this.isIncrement(v));

        if (!hasIncrements && updateCache.has(pk)) {
          const idx = updateCache.get(pk)!;
          coalescedOps[idx].values = { ...coalescedOps[idx].values, ...op.values };
          continue;
        } else if (!hasIncrements) {
          updateCache.set(pk, coalescedOps.length);
        }
      }
      coalescedOps.push(op);
    }

    const groups: WriteOp[][] = [];
    let currentGroup: WriteOp[] = [];

    for (const op of coalescedOps) {
      if (op.type === 'insert' && op.values) {
        if (currentGroup.length > 0 && currentGroup[0]!.table === op.table) {
          currentGroup.push(op);
        } else {
          if (currentGroup.length > 0) groups.push(currentGroup);
          currentGroup = [op];
        }
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [];
        groups.push([op]);
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
  }

  private async executeBulkInsert(
    trx: Transaction<Schema>,
    table: keyof Schema,
    group: WriteOp[],
  ): Promise<number> {
    const firstOp = group[0];
    if (!firstOp?.values) return 0;

    const columnCount = Object.keys(firstOp.values).length || 1;
    const CHUNK_SIZE = Math.max(1, Math.floor(950 / columnCount));
    let flushed = 0;

    for (let i = 0; i < group.length; i += CHUNK_SIZE) {
      const chunk = group.slice(i, i + CHUNK_SIZE);
      const values = chunk
        .map((op) => op.values)
        .filter((v): v is Record<string, unknown> => v !== undefined);
      await trx.insertInto(table).values(values as never).execute();
      flushed += chunk.length;
    }
    return flushed;
  }

  private isIncrement(value: unknown): value is Increment {
    return (
      typeof value === 'object' &&
      value !== null &&
      '_type' in value &&
      (value as Increment)._type === 'increment'
    );
  }

  private async executeSingleOp(trx: Transaction<Schema>, op: WriteOp) {
    const conditions = normalizeWhere(op.where);
    const table = op.table;

    if (op.type === 'insert' && op.values) {
      await trx.insertInto(table).values(op.values as never).execute();
    } else if (op.type === 'upsert' && op.values) {
      const valuesWithNoIncrements: Record<string, unknown> = {};
      const increments: Record<string, number> = {};
      for (const [k, v] of Object.entries(op.values)) {
        if (this.isIncrement(v)) {
          increments[k] = v.value;
        } else {
          valuesWithNoIncrements[k] = v;
        }
      }

      await trx
        .insertInto(table)
        .values(valuesWithNoIncrements as never)
        .onConflict((oc) => {
          let conflictTarget = op.conflictTarget;
          if (!conflictTarget) {
            conflictTarget = conditions.length > 0 ? conditions.map((c) => c.column) : ['id'];
          }

          const updateSet: Record<string, unknown> = { ...valuesWithNoIncrements };
          for (const [k, v] of Object.entries(increments)) {
            updateSet[k] = sql`${sql.ref(k)} + ${v}`;
          }

          if (Array.isArray(conflictTarget)) {
            return oc
              .columns(conflictTarget as ReadonlyArray<string> as any)
              .doUpdateSet(updateSet as any);
          }
          return oc.column(conflictTarget as string as any).doUpdateSet(updateSet as any);
        })
        .execute();
    } else if (op.type === 'update' && op.values) {
      let query = trx.updateTable(table);
      const sets: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(op.values)) {
        if (this.isIncrement(v)) {
          sets[k] = sql`${sql.ref(k)} + ${v.value}`;
        } else {
          sets[k] = v;
        }
      }
      query = query.set(sets as never);
      for (const cond of conditions) {
        const opStr = (cond.operator === 'IN' ? 'in' : cond.operator || '=') as any;
        query = query.where(cond.column as any, opStr, cond.value);
      }
      await query.execute();
    } else if (op.type === 'delete') {
      let query = trx.deleteFrom(table);
      for (const cond of conditions) {
        const opStr = (cond.operator === 'IN' ? 'in' : cond.operator || '=') as any;
        query = query.where(cond.column as any, opStr, cond.value);
      }
      await query.execute();
    }
  }

  public async stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    // Attempt final flush
    try {
      await this.flush();
    } catch (e) {
      console.error('[DbPool] Final flush failed during stop:', e);
    }
  }

  /**
   * Export performance metrics.
   */
  public getMetrics() {
    return {
      globalBufferSize: this.globalBuffer.length,
      inFlightOpsSize: this.inFlightOps.length,
      activeShadows: this.agentShadows.size,
    };
  }
}

export const dbPool = new BufferedDbPool();
