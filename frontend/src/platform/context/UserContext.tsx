import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserProfile, getUserProfile, updateUserProfile, uploadAvatar } from '../api/auth';
import { CreditsStatus, creditsApi, CreditTransaction } from '../api/credits';
import { subscriptionApi, SubscriptionStatus } from '../api/subscriptions';
import { useAuth } from '../auth/auth-context';

interface UserContextState {
  // User profile data
  profile: UserProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  
  // Credits data
  credits: CreditsStatus | null;
  creditsLoading: boolean;
  creditsError: string | null;
  
  // Credits history (optional - loaded on demand)
  creditsHistory: CreditTransaction[] | null;
  creditsHistoryLoading: boolean;
  creditsHistoryError: string | null;
  
  // Subscription data
  subscription: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  subscriptionError: string | null;
  
  // Methods
  refreshProfile: () => Promise<UserProfile | null>;
  refreshCredits: () => Promise<CreditsStatus | null>;
  refreshCreditsHistory: (limit?: number) => Promise<CreditTransaction[] | null>;
  refreshSubscription: () => Promise<SubscriptionStatus | null>;
  updateProfile: (profile: Partial<UserProfile>) => Promise<UserProfile | null>;
  uploadUserAvatar: (file: File) => Promise<{ avatar_url: string } | null>;
  refreshAll: () => Promise<void>;
}

const UserContext = createContext<UserContextState | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
  autoRefreshInterval?: number; // in milliseconds, default 2 minutes (less frequent)
}

export const UserProvider: React.FC<UserProviderProps> = ({ 
  children, 
  autoRefreshInterval = 120000 // 2 minutes instead of 30 seconds
}) => {
  const { user, loading: authLoading } = useAuth();
  
  // User profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  // Credits state
  const [credits, setCredits] = useState<CreditsStatus | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  
  // Credits history state
  const [creditsHistory, setCreditsHistory] = useState<CreditTransaction[] | null>(null);
  const [creditsHistoryLoading, setCreditsHistoryLoading] = useState(false);
  const [creditsHistoryError, setCreditsHistoryError] = useState<string | null>(null);
  
  // Subscription state
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // Refresh profile data
  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      console.log('Refreshing user profile...');
      const userProfile = await getUserProfile();
      console.log('Profile refreshed successfully:', userProfile);
      setProfile(userProfile);
      return userProfile;
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
      setProfileError(error instanceof Error ? error.message : 'Failed to fetch profile');
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // Refresh credits data
  const refreshCredits = useCallback(async (): Promise<CreditsStatus | null> => {
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      console.log('Refreshing credits status...');
      const creditsStatus = await creditsApi.getStatus();
      console.log('Credits refreshed successfully:', creditsStatus);
      setCredits(creditsStatus);
      return creditsStatus;
    } catch (error) {
      console.error('Failed to refresh credits:', error);
      setCreditsError(error instanceof Error ? error.message : 'Failed to fetch credits');
      return null;
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  // Refresh credits history
  const refreshCreditsHistory = useCallback(async (limit: number = 50): Promise<CreditTransaction[] | null> => {
    try {
      setCreditsHistoryLoading(true);
      setCreditsHistoryError(null);
      console.log('Refreshing credits history...');
      const history = await creditsApi.getHistory(limit);
      console.log('Credits history refreshed successfully:', history);
      setCreditsHistory(history);
      return history;
    } catch (error) {
      console.error('Failed to refresh credits history:', error);
      setCreditsHistoryError(error instanceof Error ? error.message : 'Failed to fetch credits history');
      return null;
    } finally {
      setCreditsHistoryLoading(false);
    }
  }, []);

  // Refresh subscription data
  const refreshSubscription = useCallback(async (): Promise<SubscriptionStatus | null> => {
    try {
      setSubscriptionLoading(true);
      setSubscriptionError(null);
      console.log('Refreshing subscription status...');
      const subscriptionStatus = await subscriptionApi.getStatus();
      console.log('Subscription refreshed successfully:', subscriptionStatus);
      setSubscription(subscriptionStatus);
      return subscriptionStatus;
    } catch (error) {
      console.error('Failed to refresh subscription:', error);
      setSubscriptionError(error instanceof Error ? error.message : 'Failed to fetch subscription');
      return null;
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  // Update profile
  const updateProfile = useCallback(async (profileData: Partial<UserProfile>): Promise<UserProfile | null> => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      console.log('Updating user profile...');
      const updatedProfile = await updateUserProfile(profileData);
      console.log('Profile updated successfully:', updatedProfile);
      setProfile(updatedProfile);
      return updatedProfile;
    } catch (error) {
      console.error('Failed to update profile:', error);
      setProfileError(error instanceof Error ? error.message : 'Failed to update profile');
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // Upload avatar
  const uploadUserAvatar = useCallback(async (file: File): Promise<{ avatar_url: string } | null> => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      console.log('Uploading avatar...');
      const result = await uploadAvatar(file);
      console.log('Avatar uploaded successfully:', result);
      
      // Update the profile with the new avatar URL
      if (profile) {
        setProfile({ ...profile, avatar_url: result.avatar_url });
      }
      
      return result;
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      setProfileError(error instanceof Error ? error.message : 'Failed to upload avatar');
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, [profile]);

  // Refresh essential data only - no auto-credits fetching
  const refreshAll = useCallback(async (): Promise<void> => {
    console.log('Refreshing essential user data...');
    // Only refresh profile and subscription automatically
    await Promise.all([
      refreshProfile(),
      refreshSubscription()
    ]);
    // Credits will be fetched manually when needed via refreshCredits()
  }, [refreshProfile, refreshSubscription]);

  // Reset state when user logs out
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setCredits(null);
      setCreditsHistory(null);
      setSubscription(null);
      setProfileError(null);
      setCreditsError(null);
      setCreditsHistoryError(null);
      setSubscriptionError(null);
      setProfileLoading(false);
      setCreditsLoading(false);
      setCreditsHistoryLoading(false);
      setSubscriptionLoading(false);
    }
  }, [user]);

  // Initial data fetch - only when user is authenticated and auth is not loading
  useEffect(() => {
    if (user && !authLoading) {
      refreshAll();
    }
  }, [user, authLoading, refreshAll]);

  // Auto-refresh logic - disabled for now to reduce DB load
  // Credits should be fetched manually when needed
  // Subscription can be fetched on-demand as well
  // useEffect(() => {
  //   if (autoRefreshInterval > 0 && user && !authLoading) {
  //     const interval = setInterval(() => {
  //       console.log('Auto-refreshing subscription data...');
  //       refreshSubscription();
  //     }, autoRefreshInterval);
  //     return () => clearInterval(interval);
  //   }
  // }, [autoRefreshInterval, user, authLoading, refreshSubscription]);

  const value: UserContextState = {
    // User profile
    profile,
    profileLoading,
    profileError,
    
    // Credits
    credits,
    creditsLoading,
    creditsError,
    
    // Credits history
    creditsHistory,
    creditsHistoryLoading,
    creditsHistoryError,
    
    // Subscription
    subscription,
    subscriptionLoading,
    subscriptionError,
    
    // Methods
    refreshProfile,
    refreshCredits,
    refreshCreditsHistory,
    refreshSubscription,
    updateProfile,
    uploadUserAvatar,
    refreshAll,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextState => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export default UserContext;