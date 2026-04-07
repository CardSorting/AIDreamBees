/**
 * Domain Logic: Prompt Processing & Command Parsing
 * Pure business rules extracted from Infrastructure layer
 */

export interface ParsedCommand {
  /** Type of command: dream, grid, or imagine */
  type: 'dream' | 'grid' | 'imagine';

  /** The content after the command prefix */
  content: string;

  /** Whether the input was a direct message (not a grid command) */
  isDirect: boolean;
}

export interface CommandValidationResult {
  /** Is the command valid? */
  valid: boolean;

  /** Human-readable error message if invalid */
  error?: string;

  /** Validated command type */
  type?: 'dream' | 'grid' | 'imagine';
}

export class PromptProcessor {
  /** Minimum length for a valid prompt */
  private static readonly MIN_PROMPT_LENGTH = 3;

  /** Maximum length for prompts */
  private static readonly MAX_PROMPT_LENGTH = 2000;

  /** Command prefixes recognized by the system */
  private static readonly COMMAND_PREFIXES: Record<
    string,
    { type: 'dream' | 'grid' | 'imagine'; length: number }
  > = {
    '/dream': { type: 'dream', length: 6 },
    '/grid': { type: 'grid', length: 5 },
    '/imagine': { type: 'imagine', length: 8 },
  };

  /**
   * Parse a user message into a structured command
   *
   * This is pure business logic - no I/O, no external dependencies
   */
  public static parseCommand(messageContent: string): ParsedCommand {
    // Trim whitespace
    const trimmed = messageContent.trim();

    // Check if it's a known command
    for (const [prefix, config] of Object.entries(PromptProcessor.COMMAND_PREFIXES)) {
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        // Extract content after the prefix
        const content = trimmed.slice(config.length).trim();
        return {
          type: config.type,
          content,
          isDirect: false,
        };
      }
    }

    // No recognized prefix - treat as direct dream
    return {
      type: 'dream',
      content: trimmed,
      isDirect: true,
    };
  }

  /**
   * Validate a prompt based on business rules
   *
   * Rules:
   * - Must be between 3 and 2000 characters
   * - Must contain only printable characters
   * - Must not be empty after trimming
   */
  public static validatePrompt(prompt: string): CommandValidationResult {
    // Check empty
    if (!prompt || prompt.trim().length === 0) {
      return {
        valid: false,
        error: 'Prompt cannot be empty',
      };
    }

    const trimmed = prompt.trim();

    // Check length
    if (trimmed.length < PromptProcessor.MIN_PROMPT_LENGTH) {
      return {
        valid: false,
        error: `Prompt is too short (minimum ${PromptProcessor.MIN_PROMPT_LENGTH} characters)`,
      };
    }

    if (trimmed.length > PromptProcessor.MAX_PROMPT_LENGTH) {
      return {
        valid: false,
        error: `Prompt is too long (maximum ${PromptProcessor.MAX_PROMPT_LENGTH} characters)`,
      };
    }

    // Check for only whitespace
    if (!/\S/.test(trimmed)) {
      return {
        valid: false,
        error: 'Prompt contains only whitespace',
      };
    }

    return {
      valid: true,
      type: 'dream',
    };
  }

  /**
   * Extract arguments from a grid command
   *
   * Example: /grid 2x2 high_detail "prompt text"
   * Returns: { gridSize: 2, options: { highDetail: true }, content: "prompt text" }
   */
  public static parseGridArguments(content: string): {
    gridSize?: number;
    options: Record<string, boolean>;
    prompt: string;
  } {
    const words = content.split(/\s+/);
    const options: Record<string, boolean> = {
      useGrid: true,
      highDetail: false,
      cinematic: false,
    };
    let gridSize: number | undefined;
    let prompt = content;

    // Check for grid size modifier (e.g., "2x2" or "3")
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase();
      const numMatch = word.match(/^\d+x\d+$/) || word.match(/^\d+$/);
      if (numMatch) {
        // This is the grid size, everything after is the prompt
        const sizeParts = word.split('x').map(Number);
        gridSize = sizeParts.length === 2 ? sizeParts[0] : sizeParts[0] || 4;
        prompt = words
          .slice(i + 1)
          .join(' ')
          .trim();
        break;
      }
    }

    return {
      gridSize,
      options,
      prompt,
    };
  }

  /**
   * Calculate backoff delay with exponential backoff
   *
   * Formula: Math.min(maxDelay, baseDelay * multiplier ^ attempt)
   */
  public static calculateRetryDelay(
    attempt: number,
    config: {
      baseDelayMs: number;
      multiplier: number;
      maxDelayMs: number;
    },
  ): number {
    const delay = config.baseDelayMs * config.multiplier ** attempt;
    return Math.min(delay, config.maxDelayMs);
  }

  /**
   * Safely truncate a prompt if it exceeds limits
   * Preserves the last ~100 characters to add an ellipsis
   */
  public static truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) return prompt;
    return `${prompt.slice(0, maxLength - 100)}...`;
  }
}

/**
 * Helper function for quick command parsing
 * Returns null if no valid command is found
 */
export function tryParseCommand(message: string): ParsedCommand | null {
  try {
    return PromptProcessor.parseCommand(message);
  } catch (_error) {
    return null;
  }
}

/**
 * Helper function for quick validation
 */
export function tryValidatePrompt(prompt: string): CommandValidationResult | null {
  try {
    return PromptProcessor.validatePrompt(prompt);
  } catch (_error) {
    return null;
  }
}
