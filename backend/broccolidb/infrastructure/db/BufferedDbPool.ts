/**
 * Re-export BufferedDbPool and dbPool from the pool directory
 * Provides cleaner import path for external consumers
 */
export { BufferedDbPool, dbPool } from './pool/index.js';
export type { Increment, WhereCondition, WriteOp } from './pool/index.js';