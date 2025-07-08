import { create } from 'zustand';
import { subscriptionApi, SubscriptionStatus } from '../api/subscriptions';

interface SubscriptionStore {
  // State
  status: SubscriptionStatus | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  cancelSubscription: (atPeriodEnd?: boolean) => Promise<void>;
  clearError: () => void;
  resetStore: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  // Initial state
  status: null,
  isLoading: false,
  error: null,

  // Fetch subscription status
  fetchStatus: async () => {
    console.log('subscriptionStore: Starting to fetch subscription status...');
    set({ isLoading: true, error: null });
    try {
      const status = await subscriptionApi.getStatus();
      console.log('subscriptionStore: Received status:', status);
      set({ status, isLoading: false });
    } catch (error) {
      console.error('subscriptionStore: Error fetching status:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch subscription status',
        isLoading: false 
      });
    }
  },

  // Cancel subscription
  cancelSubscription: async (atPeriodEnd = true) => {
    console.log('subscriptionStore: Canceling subscription...');
    set({ isLoading: true, error: null });
    try {
      const response = await subscriptionApi.cancelSubscription(atPeriodEnd);
      console.log('subscriptionStore: Cancellation response:', response);
      
      // Immediately fetch the updated status
      const status = await subscriptionApi.getStatus();
      set({ status, isLoading: false });
    } catch (error) {
      console.error('subscriptionStore: Error canceling subscription:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to cancel subscription',
        isLoading: false 
      });
      throw error; // Re-throw to allow component to handle
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset store
  resetStore: () => set({
    status: null,
    isLoading: false,
    error: null,
  }),
}));

// Helper selectors
export const selectIsSubscribed = (state: SubscriptionStore) => 
  state.status?.status === 'active' || state.status?.status === 'trialing';

export const selectCurrentPlan = (state: SubscriptionStore) => 
  state.status?.plan || null;

export const selectIsTrialing = (state: SubscriptionStore) => 
  state.status?.status === 'trialing';