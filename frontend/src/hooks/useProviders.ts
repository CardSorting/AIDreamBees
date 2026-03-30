import { useState, useEffect, useCallback } from 'react';
import type {
  Provider,
  CreateProviderRequest,
  UpdateProviderRequest,
  ProviderValidationResponse,
} from '../types/provider';

const API_BASE_URL = 'http://localhost:3001';

export interface UseProvidersReturn {
  providers: Provider[];
  isLoading: boolean;
  error: string | null;
  fetchProviders: () => Promise<void>;
  createProvider: (data: CreateProviderRequest) => Promise<Provider>;
  updateProvider: (id: string, data: UpdateProviderRequest) => Promise<Provider>;
  deleteProvider: (id: string) => Promise<void>;
  validateProvider: (id: string) => Promise<ProviderValidationResponse>;
}

export function useProviders(): UseProvidersReturn {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/providers`);
      if (!response.ok) {
        throw new Error('Failed to fetch providers');
      }
      const data = await response.json();
      setProviders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createProvider = useCallback(async (data: CreateProviderRequest): Promise<Provider> => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create provider');
    }

    const newProvider = await response.json();
    setProviders((prev) => [newProvider, ...prev]);
    return newProvider;
  }, []);

  const updateProvider = useCallback(async (id: string, data: UpdateProviderRequest): Promise<Provider> => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update provider');
    }

    const updatedProvider = await response.json();
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? updatedProvider : p))
    );
    return updatedProvider;
  }, []);

  const deleteProvider = useCallback(async (id: string): Promise<void> => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/providers/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete provider');
    }

    setProviders((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const validateProvider = useCallback(async (id: string): Promise<ProviderValidationResponse> => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/providers/${id}/validate`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to validate provider');
    }

    const result = await response.json();
    
    // Update the provider's validation status in the local state
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isValid: result.isValid } : p))
    );

    return result;
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return {
    providers,
    isLoading,
    error,
    fetchProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    validateProvider,
  };
}