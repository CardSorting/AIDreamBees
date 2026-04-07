import database from "better-sqlite3";
import type { Kysely } from "kysely";

export interface Schema {
  message: {
    id: string;
    user: string;
    message: string;
    type: string;
    timestamp: string;
    images: string[];
    sourceImages?: string[];
    soundness?: number;
  };
  queue_jobs: {
    id: string;
    payload: string;
    status: "pending" | "processing" | "done" | "failed";
    priority: number;
    attempts: number;
    maxAttempts: number;
    runAt: number;
    error?: string | null;
    createdAt: number;
    updatedAt: number;
  };
  queue_settings: {
    key: string;
    value: string;
    updatedAt: number;
  };
}

const dbPath = process.env.DB_PATH || "./ DreamBeesAI_BroccoliDB.db";

function getDb(shardId: string = "main") {
  // In a real implementation, this would connect to SQLite using better-sqlite3
  // For now, we'll use a placeholder
  const sqlite = database(dbPath, { verbose: false });
  return sqlite;
}

function getRawDb(shardId: string = "main") {
  return getDb(shardId) as unknown as Database<Database.Schema>;
}

export function getSchema() {
  return Schema;
}

export const { getDb, getRawDb, Schema } = { getDb, getRawDb, Schema };