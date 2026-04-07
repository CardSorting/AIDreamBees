import type { Kysely } from "kysely";

type Schema = any;

export type Increment = { _type: "increment"; value: number };

export type WhereCondition =
  | { column: string; value: unknown; operator?: string; shardId?: string }
  | { column: string; value: unknown[]; operator: "IN"; shardId?: string };

export type WriteOp =
  | {
      type: "insert" | "upsert";
      table: string;
      values: Record<string, unknown>;
      where?: WhereCondition;
      conflictTarget?: string;
      agentId?: string;
      shardId?: string;
    }
  | {
      type: "update";
      table: string;
      values: Record<string, unknown> | Increment;
      where: WhereCondition | WhereCondition[];
      agentId?: string;
      shardId?: string;
    }
  | { type: "delete"; table: string; where: WhereCondition; agentId?: string; shardId?: string };

export class BufferedDbPool {
  private shards = new Map<string, {
    activeBuffer: Map<string, WriteOp[]>;
    inFlightBuffer: Map<string, WriteOp[]>;
    activeIndex: Map<string, Map<string, WriteOp>>;
    activeIndexById: Map<string, Map<string, WriteOp>>;
    activeSize: number;
    latencies: Map<string, number[]>;
  }>();
  private agentShadows: Map<string, { ops: WriteOp[]; affectedFiles: Set<string>; lastUpdated: number }>;
  private stateMutex: boolean = false;
  private stateLockResolve: ((value: boolean) => void) | null = null;
  private flushMutex: boolean = false;
  private flushLockResolve: ((value: boolean) => void) | null = null;
  private flushInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private parameterBuffer: Array<unknown> = [];

  constructor() {
    this.agentShadows = new Map();
    this.startFlushLoop();
    console.log("[BufferedDbPool] Initialized.");
  }

  public static increment(value: number): Increment {
    return { _type: "increment", value };
  }

  private queueState(callback: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      const run = async () => {
        await callback();
        resolve();
      };
      run();
    });
  }

  private releaseState(): void {
    if (this.stateLockResolve) {
      this.stateMutex = false;
      this.stateLockResolve(false);
      this.stateLockResolve = null;
    }
  }

  private acquireState(): Promise<void> {
    return new Promise((resolve) => {
      const attempt = () => {
        if (this.stateMutex === false) {
          this.stateMutex = true;
          this.stateLockResolve = resolve;
        } else {
          setTimeout(attempt, 10);
        }
      };
      attempt();
    });
  }

  private releaseFlush(): void {
    if (this.flushLockResolve) {
      this.flushMutex = false;
      this.flushLockResolve(false);
      this.flushLockResolve = null;
    }
  }

  private acquireFlush(): Promise<void> {
    return new Promise((resolve) => {
      const attempt = () => {
        if (this.flushMutex === false) {
          this.flushMutex = true;
          this.flushLockResolve = resolve;
        } else {
          setTimeout(attempt, 10);
        }
      };
      attempt();
    });
  }

  private startFlushLoop() {
    this.flushInterval = setInterval(() => this.flush(), 1000);
    this.cleanupInterval = setInterval(() => this.cleanupShadows(), 30000);
    console.log("[BufferedDbPool] Flush loop started.");
  }

  private cleanupShadows() {
    const now = Date.now();
    const SHADOW_EXPIRATION = 5 * 60 * 1000;
    for (const [agentId, shadow] of this.agentShadows.entries()) {
      if (now - shadow.lastUpdated > SHADOW_EXPIRATION) {
        this.agentShadows.delete(agentId);
      }
    }
  }

  public getShard(id: string = "main") {
    let s = this.shards.get(id);
    if (!s) {
      s = {
        activeBuffer: new Map(),
        inFlightBuffer: new Map(),
        activeIndex: new Map(),
        activeIndexById: new Map(),
        activeSize: 0,
        latencies: new Map(),
      };
      this.shards.set(id, s);
    }
    return s;
  }

  public async getDb(shardId: string = "main") {
    // Placeholder - actual DB connection would go here
    // In a real implementation, this would connect to SQLite using kysely or similar
    return null as Kysely<Schema>;
  }

  public async getRawDb(shardId: string = "main") {
    return null;
  }

  public async beginWork(agentId: string) {
    await this.acquireState();
    try {
      if (!this.agentShadows.has(agentId)) {
        this.agentShadows.set(agentId, {
          ops: [],
          affectedFiles: new Set(),
          lastUpdated: Date.now(),
        });
      }
    } finally {
      this.releaseState();
    }
  }

  public async push(op: WriteOp, agentId?: string, affectedFile?: string) {
    const startTime = performance.now();
    const ops = [op];
    for (const o of ops) {
      if (agentId) o.agentId = agentId;
      o.hasIncrements = o.values ? Object.values(o.values).some((v) => "_type" in v) : false;
      if (o.type === "update" && o.where && !Array.isArray(o.where) && o.where.column === "id") {
        o.dedupKey = `${o.table}:${o.where.value}`;
      }
    }

    if (agentId) {
      const shadow = this.agentShadows.get(agentId);
      if (shadow) {
        shadow.ops.push(...ops);
        if (affectedFile) shadow.affectedFiles.add(affectedFile);
        shadow.lastUpdated = Date.now();
      }
    } else {
      for (const o of ops) {
        const shard = this.getShard(o.shardId || "main");
        let tableBuffer = shard.activeBuffer.get(o.table);
        if (!tableBuffer) {
          tableBuffer = [];
          shard.activeBuffer.set(o.table, tableBuffer);
        }
        tableBuffer.push(o);
        shard.activeSize++;
      }
    }

    this.getShard(op.shardId || "main").latencies.set("enqueue", [
      ...(this.getShard(op.shardId || "main").latencies.get("enqueue") || []),
      performance.now() - startTime,
    ]);
  }

  public async commitWork(agentId: string) {
    await this.acquireState();
    try {
      const shadow = this.agentShadows.get(agentId);
      this.agentShadows.delete(agentId);
      if (shadow) {
        for (const op of shadow.ops) {
          await this.push(op);
        }
      }
    } finally {
      this.releaseState();
    }
  }

  private applyOpsToResults(
    table: string,
    opBuffer: Map<string, WriteOp[]> | Map<never, never>,
    opIndex: Map<string, Map<string, WriteOp>> | undefined,
    results: Record<string, unknown>[],
    conditions: WhereCondition[],
    shardId: string
  ) {
    const shard = this.getShard(shardId);
    let opBufferData: Map<string, WriteOp[]> = opBuffer as Map<string, WriteOp[]>;
    
    const tableOps = opBufferData.get(table);
    if (!tableOps) return;

    const index = opIndex?.get(table);
    if (!index) return;

    for (const op of tableOps) {
      const ids = ("where" in op && op.where && Array.isArray(op.where.value))
        ? op.where.value
        : [op.where?.value];
      
      const status = "values" in op ? (op.values as Record<string, unknown>).status : undefined;

      for (const jobId of ids) {
        if (status) {
          index.get(`status:${status}`)?.delete(String(jobId));
        }
        index.set(String(jobId), op);
      }
    }

    const filteredOps = [...tableOps.values()].flat();
    for (const op of filteredOps) {
      const isInsert = op.type === "insert" || op.type === "upsert";
      const where = Array.isArray(op.where) ? op.where : [op.where];
      
      const matches = where.some((c) => {
        if (c.operator === "IN" && Array.isArray(c.value)) {
          return c.column.replace(".table", "") === table;
        }
        if (c.operator === "=" && c.column.replace(".table", "") === table) {
          return true;
        }
        return false;
      });

      if (matches && isInsert) {
        results.push(op.values as Record<string, unknown>);
      }
    }
  }

  public async selectWhere<T extends keyof Schema>(
    table: T,
    where: WhereCondition | WhereCondition[],
    agentId?: string,
    options?: { orderBy?: { column: string; direction: "asc" | "desc" }; limit?: number; shardId?: string },
  ): Promise<Schema[T][]> {
    const shardId = options?.shardId || "main";
    const shard = this.getShard(shardId);
    const conditions = Array.isArray(where) ? where : [where];
    const db = await this.getDb(shardId);

    const release = await this.acquireState();
    try {
      // Load from DB
      let query = (db as any).selectFrom(table as never).selectAll();
      conditions.forEach((c) => {
        const col = c.column.replace(".table", "");
        query = query.where(col, c.operator || "=", c.value);
      });
      const diskResults = query.execute() as Record<string, unknown>[];

      // Apply memory buffers
      const finalResults = [...diskResults];
      this.applyOpsToResults(
        table as string,
        shard.inFlightBuffer,
        shard.activeIndex,
        finalResults,
        conditions,
        shardId
      );
      this.applyOpsToResults(
        table as string,
        shard.activeBuffer,
        shard.activeIndexById,
        finalResults,
        conditions,
        shardId
      );

      if (agentId) {
        const shadow = this.agentShadows.get(agentId);
        if (shadow) {
          this.applyOpsToResults(
            table as string,
            new Map([["queue_jobs", shadow.ops.filter((o) => o.table === "queue_jobs")]]),
            undefined,
            finalResults,
            conditions,
            shardId
          );
        }
      }

      return finalResults as Schema[T][];
    } finally {
      release();
    }
  }

  public async selectOne<T extends keyof Schema>(
    table: T,
    where: WhereCondition | WhereCondition[],
    agentId?: string,
    options?: { shardId?: string },
  ): Promise<Schema[T] | null> {
    const results = await this.selectWhere(table, where, agentId, { ...options, limit: 1 });
    return (results[0] as Schema[T]) || null;
  }

  public async flush() {
    const releaseFlush = await this.acquireFlush();
    const startTime = Date.now();
    try {
      const activeShards: Array<ReturnType<typeof this.getShard>> = [];
      const releaseState = await this.acquireState();
      try {
        for (const shard of this.shards.values()) {
          if (shard.activeSize > 0) {
            // Shadow swap will be handled in commitWork
            activeShards.push(shard);
          }
        }
      } finally {
        releaseState();
      }

      if (activeShards.length === 0) return;

      console.log(`[BufferedDbPool] Flushing ${activeShards.length} active shards.`);
      const totalOps = activeShards.reduce((sum, s) => sum + s.activeSize, 0);
      console.log(`[BufferedDbPool] Total operations to flush: ${totalOps}`);

      for (const shard of activeShards) {
        shard.activeSize = 0;
        shard.activeBuffer.forEach((ops, table) => shard.inFlightBuffer.set(table, ops));
        shard.activeBuffer.clear();
      }

      const duration = Date.now() - startTime;
      const throughput = totalOps > 0 ? Math.round(totalOps / (duration / 1000 || 0.001)) : 0;
      console.log(`[BufferedDbPool] Flush complete: ${totalOps} ops in ${duration}ms (${throughput} ops/sec)`);
    } finally {
      this.releaseFlush();
    }
  }

  public async stop() {
    console.log("[BufferedDbPool] Powering down...");
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.flushInterval = null;
    this.cleanupInterval = null;

    try {
      await this.flush();
      console.log("[BufferedDbPool] Shutdown complete.");
    } catch (e) {
      console.error("[BufferedDbPool] Flush error during shutdown:", e);
    }

    this.agentShadows.clear();
    this.shards.clear();
    this.parameterBuffer = [];
  }
}

export const dbPool = new BufferedDbPool();