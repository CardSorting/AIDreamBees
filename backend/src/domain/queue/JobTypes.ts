/**
 * Domain Types for Queue Job Processing
 * Pure TypeScript types without infrastructure dependencies
 */

export interface MessageDestination {
  platform: 'discord' | 'telegram';
  channelId: string;
  threadId?: string;
}

export interface JobPayload {
  prompt: string;
  history: Array<{ role: string; content: string }>;
  images: string[];
  useGrid: boolean;
  userId: string;
}

export interface ProcessingResult {
  success: boolean;
  textParts: string[];
  images: string[];
  userId?: string;
}

export interface DreamJob {
  id: string;
  payload: JobPayload;
  destination: MessageDestination;
  createdAt: number;
  updatedAt: number;
}