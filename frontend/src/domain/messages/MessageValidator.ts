// Domain: Business logic - pure validation rules
// ============================================================================

import type { Message, SystemHealth } from './types';

/**
 * Validator for chat messages and system state
 * Zero I/O, pure business rules
 */
export class MessageValidator {
  /**
   * Validate if message carries sufficient confidence
   */
  static isMessageSound(message: Message): boolean {
    if (message.soundness === null || message.soundness === undefined) return false;
    return message.soundness >= 0.5; // Messages with <50% soundness are unreliable
  }

  /**
   * Check if message has been verified against substrate
   */
  static isMessageGrounded(message: Message): boolean {
    return message.isGrounded === true;
  }

  /**
   * Validate if sequence ID gap indicates a sync issue
   * Returns true if gap > 1 (potential data loss)
   */
  static hasSequenceGap(oldSeq: number, newSeq: number): boolean {
    return oldSeq > 0 && newSeq > oldSeq + 1;
  }

  /**
   * Extract suggestions from message if present
   */
  static extractSuggestions(message: Message): Array<{ label: string; action: string }> {
    if (!message.suggestions || message.suggestions.length === 0) return [];
    return message.suggestions.map((s: { label: string | null; action: string | null }) => ({
      label: s.label || '',
      action: s.action || '',
    }));
  }

  /**
   * Determine if system is in healthy state
   */
  static isSystemHealthy(health: SystemHealth): boolean {
    if (!health.health || health.violations === null) return false;
    return (
      health.health.toLowerCase() === 'healthy' && health.violations <= 5
    );
  }

  /**
   * Calculate message confidence for display
   * Returns percentage string
   */
  static getConfidencePercentage(message: Message): string {
    const confidence = message.soundness ?? 0.95;
    return `${Math.round(confidence * 100)}% CONFIDENT`;
  }

  /**
   * Validate if connection status is acceptable for a chat action
   */
  static isConnectionAcceptable(status: string): boolean {
    const acceptableStatuses = ['connected', 'unavailable', 'failed'];
    return acceptableStatuses.includes(status);
  }

  /**
   * Convert raw message type to display format
   */
  static getDisplayType(type: string | null): 'Assistant' | 'You' {
    return type === 'bot' ? 'Assistant' : 'You';
  }

  /**
   * Check if message has attachments for display
   */
  static hasAttachments(message: Message): boolean {
    return (message.images && message.images.length > 0) || (message.sourceImages && message.sourceImages.length > 0);
  }
}