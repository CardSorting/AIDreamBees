export type ProviderType = 'gemini' | 'openai' | 'anthropic';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  isActive: boolean;
  isValid: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderRequest {
  name: string;
  type: ProviderType;
  apiKey: string;
}

export interface UpdateProviderRequest {
  name?: string;
  apiKey?: string;
  isActive?: boolean;
}

export interface ProviderValidationResponse {
  id: string;
  isValid: boolean;
  message: string;
}

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export const PROVIDER_ICONS: Record<ProviderType, string> = {
  gemini: '🔮',
  openai: '🤖',
  anthropic: '🧠',
};
