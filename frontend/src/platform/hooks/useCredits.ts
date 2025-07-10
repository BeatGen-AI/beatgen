import { useState, useEffect, useCallback } from 'react';
import { creditsApi, CreditsStatus } from '../api/credits';

export const useCredits = () => {
  const [credits, setCredits] = useState<CreditsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const status = await creditsApi.getStatus();
      setCredits(status);
    } catch (err) {
      console.error('Failed to fetch credits:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch credits');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch credits on mount
  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Refetch credits every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchCredits, 30000);
    return () => clearInterval(interval);
  }, [fetchCredits]);

  return {
    credits,
    isLoading,
    error,
    refetchCredits: fetchCredits,
  };
};