export class TaskMutex {
  private static locks = new Map<string, Promise<void>>();

  /**
   * Acquires a lock for a specific key and executes the provided function exclusively.
   * Includes timeout protection to prevent deadlocks.
   */
  static async runExclusive<T>(key: string, fn: () => Promise<T>, timeoutMs: number = 60000): Promise<T> {
    const previous = this.locks.get(key) || Promise.resolve();
    
    let release: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });

    this.locks.set(key, previous.then(() => current));

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[TaskMutex] Lock acquisition timeout for ${key} after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      // Wait for previous OR timeout
      await Promise.race([previous, timeout]);
      return await fn();
    } finally {
      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
      release!();
    }
  }
}
