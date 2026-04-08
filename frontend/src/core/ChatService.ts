// Core: Orchestration - coordinates domain logic with infrastructure
// ============================================================================

import type { Message, HistoryMessage, SystemHealth, ChatConfig } from '../domain/messages/types';
import type { MessageRepository } from '../domain/messages/MessageRepository';
import type { MessageValidator } from '../domain/messages/MessageValidator';
import { BotMessageData, Suggestion } from '../domain/messages/types';

/**
 * Status of network connection
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'unavailable' | 'failed';

/**
 * State management for chat service
 */
export interface ChatState {
  messages: Message[];
  systemHealth: SystemHealth & { lastSync?: number };
  connectionStatus: ConnectionStatus;
  isThinking: boolean;
  errorStatus: string | null;
  isHistoryLoading: boolean;
  isSidebarOpen: boolean;
  input: string;
  selectedImage: string | null;
  lastSequenceId: number;
}

/**
 * ChatService orchestrates the entire chat flow
 * Coordinates domain validation with infrastructure operations
 * Emits state changes for UI consumption
 */
interface ChatEventListener {
  (state: ChatState): void;
}

export class ChatService {
  private repository: MessageRepository;
  private validator: MessageValidator;
  private config: ChatConfig;
  private state: ChatState;
  private listeners: Set<ChatEventListener> = new Set();

  // Pusher/state management references
  private pusher: any = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    repository: MessageRepository,
    validator: MessageValidator,
    config: ChatConfig,
    initialStatus: ConnectionStatus = 'connecting'
  ) {
    this.repository = repository;
    this.validator = validator;
    this.config = config;
    this.state = {
      messages: [],
      systemHealth: { entropy: null, health: null, violations: null, nodeCount: null },
      connectionStatus: initialStatus,
      isThinking: false,
      errorStatus: null,
      isHistoryLoading: true,
      isSidebarOpen: false,
      input: '',
      selectedImage: null,
      lastSequenceId: 0,
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: ChatEventListener): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notify(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  /**
   * Get current state snapshot
   */
  getState(): ChatState {
    return { ...this.state };
  }

  /**
   * Bootstrap service with initial data load
   */
  async bootstrap(isReconnect: boolean = false): Promise<void> {
    try {
      if (!isReconnect && this.state.messages.length === 0) {
        this.state.isHistoryLoading = true;
        this.notify();
        
        // Warm start from localStorage
        const localHistory = (await this.repository.loadHistory()) as HistoryMessage[];
        if (localHistory.length > 0) {
          this.state.messages = this.convertedMessages(localHistory);
        }
        this.state.isHistoryLoading = false;
      }

      // Fetch health and latest messages
      const [health, history] = await Promise.all([
        this.repository.fetchHealth(),
        this.repository.loadHistory(),
      ]);

      const newMessages = history.length > 0
        ? this.convertedMessages(history)
        : this.state.messages;

      this.state.messages = newMessages;
      this.state.systemHealth = { ...health, lastSync: Date.now() };
      this.state.errorStatus = null;
      this.state.isHistoryLoading = false;

      this.notify();
    } catch (error) {
      console.error('Bootstrap error:', error);
      this.state.errorStatus = 'Connection failed. Retrying...';
      this.state.isHistoryLoading = false;
      
      if (!isReconnect) {
        setTimeout(() => this.bootstrap(true), 5000);
      }
      this.notify();
    }
  }

  /**
   * Convert server-side HistoryMessage to client Message
   */
  private convertedMessages(history: HistoryMessage[]): Message[] {
    return history.map((msg) => ({
      id: msg.id,
      user: msg.user,
      message: msg.message,
      type: msg.type,
      timestamp: msg.timestamp,
      images: msg.images || [],
      sourceImages: msg.sourceImages || [],
      soundness: msg.soundness ?? undefined,
      isGrounded: msg.isGrounded ?? false,
      suggestions: msg.suggestions ?? [],
    }));
  }

  /**
   * Send user message to chat
   */
  async sendMessage(text: string, imageData?: string): Promise<void> {
    if (!text.trim() && !imageData || this.state.connectionStatus !== 'connected') {
      return;
    }

    const userMsgId = Date.now().toString();
    const userMessage: Message = {
      id: userMsgId,
      user: 'You',
      message: text,
      type: 'user',
      timestamp: new Date().toISOString(),
      images: imageData ? [imageData] : [],
      sourceImages: null,
      soundness: null,
      isGrounded: null,
      suggestions: null,
    };

    // Update state immediately
    this.state.messages = [...this.state.messages, userMessage];
    this.notify();

    try {
      const response = await fetch(`${process.env.API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          images: imageData ? [imageData] : [],
          history: this.state.messages.slice(-this.config.maxHistory),
          useGrid: this.config.useGrid,
        }),
      });

      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    } catch (error) {
      console.error('Chat failed:', error);
      this.state.errorStatus = 'Connection interrupted. Please check your network.';
    }
  }

  /**
   * Handle real-time bot message from Pusher
   */
  handleBotMessage(data: BotMessageData & { sequenceId: number }): void {
    try {
      this.validateSequence(data.sequenceId);

      const botMessage: Message = {
        id: Date.now().toString(),
        user: data.user,
        message: data.message,
        type: 'bot',
        timestamp: new Date().toISOString(),
        images: data.images || [],
        sourceImages: data.sourceImages || [],
        soundness: data.soundness ?? undefined,
        isGrounded: data.isGrounded ?? false,
        suggestions: null,
      };

      this.state.messages = [...this.state.messages, botMessage];
      this.repository.saveMessage(botMessage as HistoryMessage);
      this.notify();
    } catch (error) {
      console.error('Failed to process bot message:', error);
    }
  }

  /**
   * Handle suggestion update
   */
  handleSuggestions(suggestions: Suggestion[], sequenceId?: number): void {
    try {
      if (sequenceId) this.validateSequence(sequenceId);

      const lastBotMsg = [...this.state.messages].reverse().find((m) => m.type === 'bot');
      if (lastBotMsg) {
        this.state.messages = this.state.messages.map((msg) =>
          msg.id === lastBotMsg.id ? { ...msg, suggestions } : msg
        );
        this.notify();
      }
    } catch (error) {
      console.error('Failed to process suggestions:', error);
    }
  }

  /**
   * Handle system health update
   */
  handleSystemHealth(health: SystemHealth, sequenceId: number): void {
    try {
      this.validateSequence(sequenceId);
      this.state.systemHealth = { ...health, lastSync: Date.now() };
      this.notify();
    } catch (error) {
      console.error('Failed to process system health:', error);
    }
  }

  /**
   * Handle bot thinking state
   */
  handleThinking(isThinking: boolean, sequenceId?: number): void {
    try {
      if (sequenceId) this.validateSequence(sequenceId);
      this.state.isThinking = isThinking;
      this.notify();
    } catch (error) {
      console.error('Failed to process thinking state:', error);
    }
  }

  /**
   * Handle connection status change
   */
  handleConnectionStatus(status: ConnectionStatus): void {
    this.state.connectionStatus = status;
    
    if (status === 'connected') {
      console.log('Connection established, triggering re-bootstrap');
      this.bootstrap(true);
    }
    
    this.notify();
  }

  /**
   * Close connection and cleanup resources
   */
  destroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    if (this.pusher) {
      this.pusher.disconnect();
    }
  }

  /**
   * Validate sequence ID and handle gaps
   */
  private validateSequence(newSeq: number): void {
    if (this.state.lastSequenceId > 0 && newSeq > this.state.lastSequenceId + 1) {
      console.warn(
        `[SYNC GAP] Detected sequence jump: ${this.state.lastSequenceId} -> ${newSeq}. Triggering full re-sync.`
      );
      this.bootstrap(true);
    }
    this.state.lastSequenceId = newSeq;
  }

  /**
   * Toggle connection fallback (polling)
   */
  get pollingActive(): boolean {
    return !!this.pollingInterval;
  }

  /**
   * Set polling interval for offline mode
   */
  setPolling(active: boolean, intervalMs: number = 10000): void {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = active
      ? setInterval(() => {
          console.log('[FALLBACK] Polling for updates...');
          this.bootstrap(true);
        }, intervalMs)
      : null;
  }

  // State mutators for UI controls
  setInput(value: string): void {
    this.state.input = value;
    this.notify();
  }

  setSelectedImage(image: string | null): void {
    this.state.selectedImage = image;
    this.notify();
  }

  setSidebarOpen(open: boolean): void {
    this.state.isSidebarOpen = open;
    this.notify();
  }

  clearError(): void {
    this.state.errorStatus = null;
    this.notify();
  }

  setGridMode(useGrid: boolean): void {
    this.config.useGrid = useGrid;
  }

  clearChat(): void {
    // Will be implemented by UI layer via repository
  }
}