import { apiClient } from './client';

// Types for admin API
export interface AdminUserSearch {
  id: string;
  email: string;
  username?: string | null;
  display_name?: string | null;
  created_at: string;
  credits?: {
    balance: number | string;
    monthly_allocation: number;
    subscription_tier: string;
    has_rollover: boolean;
    total_used: number;
    last_allocation_date: string;
    next_allocation_date: string | null;
    is_unlimited: boolean;
  } | null;
}

export interface AdminUserDetails {
  user: {
    id: string;
    email: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    created_at: string;
    updated_at: string;
  };
  credits?: {
    balance: number | string;
    monthly_allocation: number;
    subscription_tier: string;
    has_rollover: boolean;
    total_used: number;
    last_allocation_date: string;
    next_allocation_date: string | null;
    is_unlimited: boolean;
  } | null;
  recent_transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance_after: number;
    description: string;
    created_at: string;
    metadata: Record<string, any> | null;
  }>;
}

export interface AdminAddCreditsRequest {
  amount: number;
  description: string;
}

export interface AdminChangeTierRequest {
  new_tier: 'free' | 'starter' | 'creator' | 'pro';
}

export interface AdminAddCreditsResponse {
  success: boolean;
  message: string;
  credits: {
    balance: number | string;
    monthly_allocation: number;
    subscription_tier: string;
    has_rollover: boolean;
    total_used: number;
    last_allocation_date: string;
    next_allocation_date: string | null;
    is_unlimited: boolean;
  };
}

export interface AdminChangeTierResponse {
  success: boolean;
  message: string;
  credits: {
    balance: number | string;
    monthly_allocation: number;
    subscription_tier: string;
    has_rollover: boolean;
    total_used: number;
    last_allocation_date: string;
    next_allocation_date: string | null;
    is_unlimited: boolean;
  };
}

// Sound management types
export interface DrumSampleUploadData {
  file: File;
  display_name: string;
  kit_name: string;
  genre: string;
  category: string;
  description?: string;
}

export interface DrumSample {
  id: string;
  file_name: string;
  display_name: string;
  kit_name: string;
  genre: string;
  category: string;
  description?: string;
  file_format: string;
  file_size: number;
  storage_key: string;
  duration?: number;
  created_at: string;
  updated_at: string;
}

export interface DrumSampleUploadResponse {
  id: string;
  message: string;
  sample: DrumSample;
}

export const adminApi = {
  /**
   * Search for a user by email address
   */
  async searchUserByEmail(email: string): Promise<AdminUserSearch> {
    const response = await apiClient.get(`/admin/users/search`, {
      params: { email }
    });
    return response.data;
  },

  /**
   * Get detailed information about a user
   */
  async getUserDetails(userId: string): Promise<AdminUserDetails> {
    const response = await apiClient.get(`/admin/users/${userId}`);
    return response.data;
  },

  /**
   * Add credits to a user's account
   */
  async addCreditsToUser(
    userId: string, 
    request: AdminAddCreditsRequest
  ): Promise<AdminAddCreditsResponse> {
    const response = await apiClient.post(`/admin/users/${userId}/credits/add`, request);
    return response.data;
  },

  /**
   * Change a user's subscription tier
   */
  async changeUserTier(
    userId: string, 
    request: AdminChangeTierRequest
  ): Promise<AdminChangeTierResponse> {
    const response = await apiClient.patch(`/admin/users/${userId}/tier`, request);
    return response.data;
  },

  /**
   * Get a user's current credits status
   */
  async getUserCredits(userId: string) {
    const response = await apiClient.get(`/admin/users/${userId}/credits`);
    return response.data;
  },

  /**
   * Get a user's credit transaction history
   */
  async getUserCreditHistory(userId: string, limit: number = 50) {
    const response = await apiClient.get(`/admin/users/${userId}/credits/history`, {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Upload a drum sample to the public library
   */
  async uploadDrumSample(data: DrumSampleUploadData): Promise<DrumSampleUploadResponse> {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('display_name', data.display_name);
    formData.append('kit_name', data.kit_name);
    formData.append('genre', data.genre);
    formData.append('category', data.category);
    if (data.description) {
      formData.append('description', data.description);
    }

    const response = await apiClient.post('/admin/sounds/drum-samples', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Get all drum samples in the public library
   */
  async getAllDrumSamples(): Promise<DrumSample[]> {
    const response = await apiClient.get('/admin/sounds/drum-samples');
    return response.data;
  },

  /**
   * Delete a drum sample from the public library
   */
  async deleteDrumSample(sampleId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`/admin/sounds/drum-samples/${sampleId}`);
    return response.data;
  }
};