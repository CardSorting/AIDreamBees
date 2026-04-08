// Domain: Repository interface - defines how domain interacts with data
// ============================================================================

import type { Message, HistoryMessage, SystemHealth } from './types';

/**
 * Repository contract for message persistence and retrieval
 * Isolation of storage details - no implementation here
 */
export interface MessageRepository {
  /**
   * Load all chat history from storage (or fetch from API)
   * Returns raw HistoryMessage[] which is converted to Message[] by consumer
   */
  loadHistory(): Promise<HistoryMessage[]>;

  /**
   * Save a single message to storage
   */
  saveMessage(message: HistoryMessage): void;

  /**
   * Save multiple messages (batch operation)
   */
  saveMessages(messages: HistoryMessage[]): void;

  /**
   * Clear all chat history
   */
  clearHistory(): Promise<void>;

  /**
   * Fetch system health metrics
   */
  fetchHealth(): Promise<SystemHealth>;

  /**
   * Delete all messages
   */
  purgeMessages(): Promise<void>;

  /**
   * Validate if message is complete and valid
   */
  validateMessage(message: Partial<Message>): boolean;
}