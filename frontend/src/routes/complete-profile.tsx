import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useState, useEffect } from 'react'
import { useAuth } from '../platform/auth/auth-context'

// Shadcn/ui and lucide-react imports
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import { Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react"

// Use environment variables for API URL
const isDev = import.meta.env.VITE_APP_ENV === 'dev' || import.meta.env.DEV;
const API_BASE_URL = isDev 
  ? import.meta.env.VITE_LOCAL_BACKEND_URL || '' 
  : import.meta.env.VITE_PROD_BACKEND_BASE_URL || 'https://api.beatgen.com';

// Create the route - this will render at the path '/complete-profile'
export const Route = createFileRoute('/complete-profile')({
  component: CompleteProfilePage,
  // Only allow authenticated users
  beforeLoad: async ({ navigate }) => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate({ to: '/login', replace: true });
      return false;
    }
    return {};
  }
})

function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  
  // Check if profile is already complete
  useEffect(() => {
    const checkProfileStatus = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          navigate({ to: '/login' });
          return;
        }

        const response = await fetch(`${API_BASE_URL}/auth/profile-status`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.profile_complete) {
            // Profile is already complete, redirect to home
            navigate({ to: '/home' });
          }
        }
      } catch (err) {
        console.error('Error checking profile status:', err);
      }
    };

    checkProfileStatus();
  }, [navigate]);

  // Debounced username availability check
  useEffect(() => {
    const checkUsername = async () => {
      if (!username || username.length < 3) {
        setUsernameAvailable(null);
        setCheckMessage(null);
        return;
      }

      setIsChecking(true);
      setUsernameAvailable(null);
      setCheckMessage(null);

      try {
        const response = await fetch(`${API_BASE_URL}/auth/check-username`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username }),
        });

        const data = await response.json();
        setUsernameAvailable(data.available);
        setCheckMessage(data.message);
      } catch (err) {
        console.error('Error checking username:', err);
        setCheckMessage('Error checking username availability');
      } finally {
        setIsChecking(false);
      }
    };

    const timeoutId = setTimeout(checkUsername, 500);
    return () => clearTimeout(timeoutId);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters long');
      return;
    }

    if (usernameAvailable === false) {
      setError('Username is not available');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        navigate({ to: '/login' });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/complete-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      });

      if (response.ok) {
        // Profile completed successfully
        await refreshProfile?.();
        navigate({ to: '/home' });
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to complete profile');
      }
    } catch (err) {
      console.error('Profile completion error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getUsernameIcon = () => {
    if (isChecking) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    if (usernameAvailable === true) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (usernameAvailable === false) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return null;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-[512px] mx-auto space-y-8 bg-card text-card-foreground p-6 sm:p-8 rounded-xl shadow-xl">
        <div>
          <h1 className="mt-6 text-center text-3xl font-extrabold">
            Complete Your Profile
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Choose a username to complete your BeatGen account setup
          </p>
          {user?.email && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Signed in as: <span className="font-medium">{user.email}</span>
            </p>
          )}
        </div>
        
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="username">Username</Label>
            <div className="mt-1 relative">
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full pr-10"
                placeholder="Choose a unique username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                disabled={isLoading}
                autoFocus
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                {getUsernameIcon()}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Username can only contain lowercase letters, numbers, and underscores
            </p>
            {checkMessage && (
              <p className={`text-xs mt-1 ${usernameAvailable ? 'text-green-600' : 'text-red-600'}`}>
                {checkMessage}
              </p>
            )}
          </div>

          <div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isChecking || usernameAvailable === false || !username}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing Profile...
                </>
              ) : (
                'Complete Profile'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}