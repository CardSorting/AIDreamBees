import { ProcessingResult } from '@/src/domain/queue/JobTypes.js';

export interface AIProviderOptions {
  useGrid?: boolean;
}

export interface AIProvider {
  generate(prompt: string, options?: AIProviderOptions): Promise<ProcessingResult>;
}