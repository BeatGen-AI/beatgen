import { apiClient } from './client';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  message?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OAuthRedirectResponse {
  url: string;
}

export const signUp = async (email: string, password: string, username?: string): Promise<LoginResponse> => {
  const response = await apiClient.post('/auth/signup', { email, password, username });
  return response.data;
};

export const signIn = async (email: string, password: string): Promise<LoginResponse> => {
  // OAuth2 requires x-www-form-urlencoded format with username/password fields
  const formData = new URLSearchParams();
  formData.append('username', email);  // OAuth2 uses 'username' even for email
  formData.append('password', password);

  const response = await apiClient.post('/auth/login', formData.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  return response.data;
};

export const requestPasswordReset = async (email: string, redirectTo?: string): Promise<void> => {
  await apiClient.post('/auth/forgot-password', { 
    email, 
    redirect_to: redirectTo 
  });
};

export const updatePasswordWithToken = async (password: string, token: string): Promise<void> => {
  // Send the recovery token as a custom header without modifying localStorage
  await apiClient.post('/auth/reset-password', 
    { password },
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
};

export const getUserProfile = async (): Promise<UserProfile> => {
  const response = await apiClient.get('/users/me');
  return response.data;
};

export const updateUserProfile = async (profile: Partial<UserProfile>): Promise<UserProfile> => {
  const response = await apiClient.patch('/users/me', profile);
  return response.data;
};

export const uploadAvatar = async (file: File): Promise<{ avatar_url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await apiClient.post('/users/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  
  return response.data;
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await apiClient.post('/users/me/password', {
    current_password: currentPassword,
    new_password: newPassword
  });
};

export const signInWithGoogle = async (): Promise<void> => {
  const { supabase } = await import('../../lib/supabase');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  });
  
  if (error) {
    throw new Error(`Google sign-in failed: ${error.message}`);
  }
};

// OAuth callback is now handled automatically by Supabase client-side

// Password management for OAuth users
export const addPassword = async (password: string): Promise<{ message: string }> => {
  const response = await apiClient.post('/auth/add-password', { password });
  return response.data;
};