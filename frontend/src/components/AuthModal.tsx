import React, { useState } from 'react';
import { useAuth } from '../platform/auth/auth-context';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Loader2, AlertCircle } from 'lucide-react';
import PasswordResetModal from '../platform/components/PasswordResetModal';

interface AuthModalProps {
  initialTab?: 'login' | 'register';
}

export default function AuthModal({ initialTab = 'login' }: AuthModalProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Register state  
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    
    try {
      const result = await signIn(loginEmail, loginPassword);
      if (!result.success) {
        setLoginError(result.error?.message || 'Invalid credentials');
      }
    } catch (err) {
      setLoginError('An error occurred. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (registerPassword !== confirmPassword) {
      setRegisterError('Passwords do not match');
      return;
    }
    
    setRegisterLoading(true);
    setRegisterError(null);
    
    try {
      const result = await signUp(registerEmail, registerPassword, registerUsername);
      if (!result.success) {
        setRegisterError(result.error?.message || 'Failed to create account');
      }
    } catch (err) {
      setRegisterError('An error occurred. Please try again.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setGoogleLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop with very subtle blur */}
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
      
      {/* Modal - using fixed positioning and overflow-y-auto for the container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md bg-background rounded-lg shadow-lg border border-border">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-center mb-6">Welcome to BeatGen</h2>
            
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login" className="mt-4">
                {loginError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-email">Username or Email</Label>
                    <Input
                      id="login-email"
                      name="login-email"
                      type="text"
                      placeholder="Username or Email"
                      autoComplete="username email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={loginLoading || googleLoading}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      name="login-password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={loginLoading || googleLoading}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm text-primary hover:underline p-0 h-auto"
                      onClick={() => setShowPasswordReset(true)}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginLoading || googleLoading}
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register" className="mt-4">
                {registerError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{registerError}</AlertDescription>
                  </Alert>
                )}
                
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      name="register-email"
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                      disabled={registerLoading || googleLoading}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      name="register-username"
                      type="text"
                      placeholder="Choose a username"
                      autoComplete="username"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      required
                      disabled={registerLoading || googleLoading}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      name="register-password"
                      type="password"
                      placeholder="Create a password"
                      autoComplete="new-password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      required
                      disabled={registerLoading || googleLoading}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={registerLoading || googleLoading}
                      className="w-full"
                    />
                  </div>
                  
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registerLoading || googleLoading}
                  >
                    {registerLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            
            <div className="relative my-4">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                OR
              </span>
            </div>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogleAuth}
              disabled={loginLoading || registerLoading || googleLoading}
            >
              {googleLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Continue with Google'
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Password Reset Modal */}
      <PasswordResetModal
        open={showPasswordReset}
        onOpenChange={setShowPasswordReset}
      />
    </>
  );
}