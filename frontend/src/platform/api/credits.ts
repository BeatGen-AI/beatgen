import { apiClient } from './client';

export interface CreditsStatus {
  balance: number | string; // Can be "unlimited" for pro users
  monthly_allocation: number;
  subscription_tier: string;
  has_rollover: boolean;
  total_used: number;
  last_allocation_date: string;
  next_allocation_date: string | null;
  is_unlimited: boolean;
}

export interface UseCreditsRequest {
  amount: number;
  description: string;
  metadata?: Record<string, any>;
}

export interface UseCreditsResponse {
  success: boolean;
  balance: number | string;
  is_unlimited: boolean;
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
  metadata: Record<string, any> | null;
}

export const creditsApi = {
  async getStatus(): Promise<CreditsStatus> {
    const response = await apiClient.get('/credits/status');
    return response.data;
  },

  async useCredits(request: UseCreditsRequest): Promise<UseCreditsResponse> {
    const response = await apiClient.post('/credits/use', request);
    return response.data;
  },

  async getHistory(limit: number = 50): Promise<CreditTransaction[]> {
    const response = await apiClient.get('/credits/history', {
      params: { limit }
    });
    return response.data;
  },
};