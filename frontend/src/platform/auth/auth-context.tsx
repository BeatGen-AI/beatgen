import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  signIn as apiSignIn, 
  signUp as apiSignUp, 
  getUserProfile, 
  LoginResponse,
  UserProfile,
  signInWithGoogle
} from '../api/auth';
import { supabase } from '../../lib/supabase';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
}

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, username?: string) => Promise<{
    error: Error | null;
    success: boolean;
    message?: string;
  }>;
  signIn: (email: string, password: string) => Promise<{
    error: Error | null;
    success: boolean;
    message?: string;
  }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to decode JWT token (still needed for email/password login)
function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to fetch and set the user profile
  const fetchProfile = async () => {
    try {
      console.log('Fetching user profile...');
      const userProfile = await getUserProfile();
      setProfile(userProfile);
      return userProfile;
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
      return null;
    }
  };

  // Initialize auth following official Supabase pattern
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session?.user?.email || 'No session');
      setSession(session);
      if (session?.user) {
        // Store access token for API calls
        localStorage.setItem('access_token', session.access_token);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state change:', _event, session?.user?.email || 'No session');
      
      setSession(session);
      
      if (session?.user) {
        // User signed in
        localStorage.setItem('access_token', session.access_token);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
        });
      } else {
        // User signed out
        localStorage.removeItem('access_token');
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Separate effect for profile loading
  useEffect(() => {
    if (user && !profile) {
      fetchProfile().then(userProfile => {
        if (userProfile) {
          setProfile(userProfile);
          
          // Check if profile needs completion (OAuth users without username)  
          if (!userProfile.username && window.location.pathname !== '/complete-profile') {
            console.log('Profile incomplete, redirecting to complete-profile');
            window.location.href = '/complete-profile';
          }
        }
      }).catch(error => {
        console.error('Failed to fetch profile:', error);
      });
    }
  }, [user, profile]);

  const handleAuthResponse = (response: LoginResponse): User | null => {
    console.log('Processing auth response:', response);
    
    if (response.access_token) {
      console.log('Access token received, storing in localStorage');
      localStorage.setItem('access_token', response.access_token);
      
      const decodedToken = parseJwt(response.access_token);
      console.log('Decoded token:', decodedToken);
      
      if (decodedToken) {
        // Create a user object from the token
        const user = {
          id: decodedToken.sub || 'unknown',
          email: decodedToken.email || decodedToken.sub || '',
        };
        console.log('User created from token:', user);
        return user;
      } else {
        console.warn('Failed to decode token');
      }
    } else {
      console.warn('No access token in response');
    }
    
    return null;
  };

  const signUp = async (email: string, password: string, username?: string) => {
    try {
      console.log('Creating account with:', { email, username });
      
      const response = await apiSignUp(email, password, username);
      console.log('Signup response:', response);
      
      // Check if we have a message about email verification
      if (response.message) {
        return { 
          error: null, 
          success: true, 
          message: response.message 
        };
      }
      
      const user = handleAuthResponse(response);
      if (user) {
        setUser(user);
        
        // Load user profile after signup
        await fetchProfile(); // Use the new fetchProfile function
        
        return { error: null, success: true };
      }
      
      return { 
        error: new Error('Failed to create user: Invalid response from server'), 
        success: false 
      };
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // Provide detailed error information
      let errorMessage = 'Registration failed';
      let errorDetails = '';
      
      if (error.response) {
        // The server responded with an error
        const status = error.response.status;
        errorMessage = `Server error (${status})`;
        
        // Extract useful error details from the response
        if (error.response.data) {
          // Handle common registration errors
          if (status === 400 || status === 422) {
            // Validation errors
            const detail = error.response.data.detail;
            if (Array.isArray(detail)) {
              // Collect field errors
              errorDetails = detail.map(err => `${err.loc[1]}: ${err.msg}`).join(', ');
            } else {
              errorDetails = error.response.data.detail || error.response.data.message || '';
            }
            
            // Check for common cases
            if (errorDetails.toLowerCase().includes('email') && 
                errorDetails.toLowerCase().includes('exist')) {
              errorDetails = 'This email is already registered. Please use a different email or login.';
            }
          } else {
            errorDetails = error.response.data.detail || error.response.data.message || '';
          }
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'Network error: No response from server';
        errorDetails = 'Please check your connection and try again';
      } else {
        // Something went wrong in setting up the request
        errorMessage = error.message || 'Unknown error';
      }
      
      return { 
        error: error, 
        success: false,
        message: errorDetails || errorMessage
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Authenticating with:', { email });
      
      const response = await apiSignIn(email, password);
      console.log('Auth response:', response);
      
      const user = handleAuthResponse(response);
      if (user) {
        setUser(user);
        
        // Load user profile
        await fetchProfile(); // Use the new fetchProfile function
        
        return { error: null, success: true };
      }
      return { 
        error: new Error('Login failed: Invalid response from server'), 
        success: false 
      };
    } catch (error: any) {
      console.error('Authentication error:', error);
      
      // Provide detailed error information
      let errorMessage = 'Authentication failed';
      let errorDetails = '';
      
      if (error.response) {
        // Server responded with an error status code
        errorMessage = `Server error (${error.response.status})`;
        errorDetails = error.response.data?.detail || error.response.data?.message || '';
      } else if (error.request) {
        // Request was made but no response received (network error)
        errorMessage = 'Network error: No response from server';
        errorDetails = 'Please check your connection and try again';
      } else {
        // Something else went wrong
        errorMessage = error.message || 'Unknown error';
      }
      
      return { 
        error: new Error(`${errorMessage}${errorDetails ? ': ' + errorDetails : ''}`), 
        success: false,
        message: errorDetails || errorMessage
      };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
    }
    // The onAuthStateChange listener will handle clearing the state
  };

  const googleSignIn = async () => {
    try {
      await signInWithGoogle();
      // The redirect will happen, so we don't need to do anything else here
    } catch (error: any) {
      console.error('Google sign-in error:', error);
    }
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle: googleSignIn,
    signOut,
    refreshProfile: fetchProfile, // Expose fetchProfile as refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook for using auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}