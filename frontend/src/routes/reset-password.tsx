import { createFileRoute, useNavigate } from '@tanstack/react-router'
import React, { useState, useEffect } from 'react'
import { updatePasswordWithToken } from '../platform/api/auth'

// Shadcn/ui and lucide-react imports
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import { Loader2, AlertCircle, CheckCircle2, KeyRound } from "lucide-react"

// Create the route - this will render at the path '/reset-password'
export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
  // Don't use publicRoute here - we need to allow access even with recovery token
  beforeLoad: async ({ location }) => {
    // ALWAYS clear any existing auth token to prevent auto-login
    localStorage.removeItem('access_token');
    
    // Check if this is a recovery flow or an error
    const hash = location.hash || window.location.hash;
    const isRecovery = hash.includes('type=recovery');
    const hasError = hash.includes('error=') || hash.includes('error_code=');
    
    // Allow access if:
    // 1. It's a recovery flow
    // 2. There's an error to display
    // 3. We have a stored token from a previous attempt
    const hasStoredToken = sessionStorage.getItem('reset_token');
    
    if (!isRecovery && !hasError && !hasStoredToken) {
      // No valid reason to be on this page
      window.location.href = '/home';
    }
  },
})

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    // IMPORTANT: Prevent any auto-login behavior on this page
    const currentAccessToken = localStorage.getItem('access_token');
    if (currentAccessToken) {
      console.log('Clearing access token to prevent auto-login on reset-password page');
      localStorage.removeItem('access_token');
    }
    
    // Check if we have a valid token from Supabase
    const checkToken = async () => {
      try {
        // Supabase redirects with the token in the URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');
        const error = hashParams.get('error');
        const errorCode = hashParams.get('error_code');
        const errorDescription = hashParams.get('error_description');
        
        // Check for errors first
        if (error || errorCode) {
          let errorMessage = 'Password reset failed';
          
          if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
            errorMessage = 'This password reset link has expired. Please request a new one.';
          } else if (errorDescription) {
            errorMessage = decodeURIComponent(errorDescription.replace(/\+/g, ' '));
          }
          
          setError(errorMessage);
          setIsValidToken(false);
          
          // Clean the URL to remove error params
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }
        
        if (accessToken && type === 'recovery') {
          // Store the token temporarily for the password update
          sessionStorage.setItem('reset_token', accessToken);
          setIsValidToken(true);
          
          // Clean the URL to remove token from being visible
          window.history.replaceState(null, '', window.location.pathname);
        } else if (!sessionStorage.getItem('reset_token')) {
          // No token in URL or session storage
          setError('Invalid or missing reset token. Please request a new password reset.');
        } else {
          // We have a stored token from a previous load
          setIsValidToken(true);
        }
      } catch (err) {
        console.error('Token validation error:', err);
        setError('Failed to validate reset token. Please request a new password reset.');
      } finally {
        setCheckingToken(false);
      }
    };

    checkToken();
    
    // Cleanup function to ensure we don't leave tokens around
    return () => {
      // Don't clear the reset_token here as it might be needed for form submission
    };
  }, []);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    const complexityCount = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

    if (complexityCount < 3) {
      return 'Password must contain at least 3 of the following: uppercase letters, lowercase letters, numbers, and special characters';
    }

    return null;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password complexity
    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const resetToken = sessionStorage.getItem('reset_token');
      if (!resetToken) {
        throw new Error('Reset token not found');
      }

      // Use the updatePasswordWithToken function
      await updatePasswordWithToken(password, resetToken);

      setSuccess(true);
      sessionStorage.removeItem('reset_token');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate({ to: '/home' });
      }, 3000);
    } catch (err: any) {
      console.error('Password reset error:', err);
      
      // Log the full error for debugging
      console.log('Full error object:', err);
      console.log('Error response:', err.response);
      
      // Extract the most helpful error message
      let errorMessage = 'Failed to reset password';
      
      // Check all possible error locations
      if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.response?.data?.error_description) {
        errorMessage = err.response.data.error_description;
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data) {
        // Sometimes the error is just a string in data
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else {
          // Log the entire data object to see what's there
          console.log('Error data:', err.response.data);
          errorMessage = JSON.stringify(err.response.data);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Remove status code prefix if present (e.g., "500: " or "400: ")
      errorMessage = errorMessage.replace(/^\d{3}:\s*/, '');
      
      // Make certain error messages more user-friendly
      if (errorMessage.toLowerCase().includes('expired')) {
        errorMessage = 'This password reset link has expired. Please request a new one.';
      } else if (errorMessage.toLowerCase().includes('invalid')) {
        errorMessage = 'This password reset link is invalid. Please request a new one.';
      } else if (errorMessage.toLowerCase().includes('already used')) {
        errorMessage = 'This password reset link has already been used. Please request a new one.';
      } else if (errorMessage.toLowerCase().includes('same as the old')) {
        errorMessage = 'New password must be different from your current password.';
      } else if (errorMessage.toLowerCase().includes('identical')) {
        errorMessage = 'New password cannot be the same as your current password.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">Validating reset token...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-white dark:bg-black">
      <div className="w-full max-w-md">
        <div className="bg-card text-card-foreground rounded-lg shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              Reset Your Password
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your new password below
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Password Reset Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success ? (
            <Alert className="bg-green-100 border-green-400 text-green-700">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>
                Your password has been reset successfully. Redirecting to login...
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Enter your new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading || !isValidToken}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading || !isValidToken}
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Password requirements:</p>
                <ul className="list-disc list-inside ml-2">
                  <li>At least 8 characters long</li>
                  <li>Must contain at least 3 of the following:</li>
                  <ul className="list-disc list-inside ml-4">
                    <li>Uppercase letters (A-Z)</li>
                    <li>Lowercase letters (a-z)</li>
                    <li>Numbers (0-9)</li>
                    <li>Special characters (!@#$%^&*)</li>
                  </ul>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !isValidToken}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </form>
          )}

          <div className="text-center text-sm">
            <Button
              variant="link"
              className="text-primary hover:underline p-0"
              onClick={() => navigate({ to: '/home' })}
            >
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}