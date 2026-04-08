// Infrastructure: Repository implementation - bridges Domain and storage
// ============================================================================

import { loadMessagesLocal, saveMessagesLocal } from '../../utils/persistence';
import type { MessageRepository, HistoryMessage, SystemHealth } from '../../domain/messages/types';

/**
 * Infrastructure implementation of MessageRepository
 * Handles all I/O operations: localStorage, file reading, network requests
 */
class MessageRepositoryImpl implements MessageRepository {
  private readonly API_BASE_URL: string;

  constructor(apiBaseUrl: string) {
    this.API_BASE_URL = apiBaseUrl;
  }

  async loadHistory(): Promise<HistoryMessage[]> {
    // Try localStorage first
    const localHistory = loadMessagesLocal();
    if (localHistory.length > 0) {
      return localHistory;
    }

    // Fallback to API
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/history`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to fetch history from API, using empty state:', error);
    }

    return [];
  }

  saveMessage(message: HistoryMessage): void {
    try {
      const currentMessages = loadMessagesLocal();
      saveMessagesLocal([...currentMessages, message]);
    } catch (error) {
      console.error('Failed to save message to localStorage:', error);
    }
  }

  saveMessages(messages: HistoryMessage[]): void {
    try {
      saveMessagesLocal(messages);
    } catch (error) {
      console.error('Failed to batch save messages:', error);
    }
  }

  async clearHistory(): Promise<void> {
    try {
      // Also sync with API
      await fetch(`${this.API_BASE_URL}/api/history`, { method: 'DELETE' });
      saveMessagesLocal([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw error;
    }
  }

  async fetchHealth(): Promise<SystemHealth> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/health`);
      if (response.ok) {
        return await response.json();
      }
      throw new Error(`Health check failed: ${response.statusText}`);
    } catch (error) {
      console.error('Failed to fetch health metrics:', error);
      throw error;
    }
  }

  async purgeMessages(): Promise<void> {
    try {
      await this.clearHistory();
    } catch (error) {
      console.error('Failed to purge messages:', error);
      throw error;
    }
  }

  validateMessage(message: Partial<Message>): boolean {
    // Basic validation: message content must exist for non-null messages
    if (message.user !== null && message.message === null && message.type === 'user') {
      return false;
    }
    if (message.type === 'bot' && (message.message === null || message.user === null)) {
      return false;
    }
    return true;
  }
}

export const createMessageRepository = (apiBaseUrl: string): MessageRepository => {
  return new MessageRepositoryImpl(apiBaseUrl);
};