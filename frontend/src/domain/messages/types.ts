// Domain: Pure models and contracts - zero external dependencies
// ============================================================================

/**
 * Basic message structure representing both user and bot communication
 * All types are nullable to support history loading states
 */
export interface Message {
  id: string | null;
  user: string | null;
  message: string | null;
  type: 'bot' | 'user' | null;
  timestamp: string | null;
  images: string[] | null;
  sourceImages: string[] | null;
  soundness: number | null;
  isGrounded: boolean | null;
  suggestions: Suggestion[] | null;
}

/**
 * Immutable suggestion object for follow-up actions
 */
export interface Suggestion {
  id: string | null;
  label: string | null;
  action: string | null;
}

/**
 * Health metrics for the backend system
 */
export interface SystemHealth {
  entropy: number | null;
  health: string | null;
  violations: number | null;
  nodeCount: number | null;
  uptime?: number | null;
  systemLoad?: number | null;
  substrateStability?: number | null;
}

/**
 * Raw backend data type for message persistence
 * Differs from Message to separate backend contract from domain model
 */
export interface HistoryMessage {
  id: string;
  user: string;
  message: string;
  type: 'bot' | 'user';
  timestamp: string;
  images: string[];
  sourceImages?: string[];
  soundness?: number;
  isGrounded?: boolean;
  suggestions?: Suggestion[];
}

/**
 * Real-time socket message from Pusher
 */
export interface BotMessageData {
  user: string;
  message: string;
  images?: string[];
  sourceImages?: string[];
  soundness?: number;
  isGrounded?: boolean;
  sequenceId: number;
}

/**
 * Chat configuration for the current session
 */
export interface ChatConfig {
  useGrid: boolean;
  maxHistory: number;
}