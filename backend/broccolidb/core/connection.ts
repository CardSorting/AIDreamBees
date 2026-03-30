import { setDbPath } from '../infrastructure/db/Config.js';
import { dbPool } from '../infrastructure/db/BufferedDbPool.js';
import { AgentGitError } from './errors.js';

export interface AgentGitConfig {
  dbPath?: string;
}

export class Connection {
  constructor(config?: AgentGitConfig) {
    if (config?.dbPath) {
      setDbPath(config.dbPath);
    }
  }

  getPool() {
    return dbPool;
  }
}
