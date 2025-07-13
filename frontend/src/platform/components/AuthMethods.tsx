import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Loader2, AlertCircle, Key, Mail, Plus, Unlink } from 'lucide-react';
import { getUserIdentities, addPassword, linkIdentity, unlinkIdentity, IdentitiesResponse } from '../api/auth';

interface AuthMethodsProps {
  className?: string;
}

const AuthMethods: React.FC<AuthMethodsProps> = ({ className }) => {
  const [identities, setIdentities] = useState<IdentitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Add password dialog state
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addingPassword, setAddingPassword] = useState(false);

  const fetchIdentities = async () => {
    try {
      setLoading(true);
      const data = await getUserIdentities();
      setIdentities(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load authentication methods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIdentities();
  }, []);

  const hasEmailAuth = identities?.identities.some(id => id.provider === 'email') || false;
  const hasGoogleAuth = identities?.identities.some(id => id.provider === 'google') || false;

  const handleAddPassword = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setAddingPassword(true);
    setError(null);

    try {
      await addPassword(password);
      setSuccess('Password added successfully! You can now sign in with your email and password.');
      setShowAddPassword(false);
      setPassword('');
      setConfirmPassword('');
      await fetchIdentities();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add password');
    } finally {
      setAddingPassword(false);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      const result = await linkIdentity('google');
      window.location.href = result.url;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to link Google account');
    }
  };

  const handleUnlinkIdentity = async (identityId: string) => {
    if (identities && identities.identities.length <= 1) {
      setError('Cannot remove your only authentication method');
      return;
    }

    try {
      await unlinkIdentity(identityId);
      setSuccess('Authentication method removed successfully');
      await fetchIdentities();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove authentication method');
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Authentication Methods</CardTitle>
        <CardDescription>
          Manage how you sign in to your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-100 border-green-400 text-green-700">
            <AlertCircle className="h-4 w-4 text-green-500" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {/* Email/Password Auth */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Email & Password</p>
                <p className="text-sm text-muted-foreground">
                  {hasEmailAuth ? 'Sign in with your email and password' : 'Not configured'}
                </p>
              </div>
            </div>
            {!hasEmailAuth && (
              <Dialog open={showAddPassword} onOpenChange={setShowAddPassword}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Password
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Password Authentication</DialogTitle>
                    <DialogDescription>
                      Add a password to sign in with your email address
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter a secure password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowAddPassword(false)}
                      disabled={addingPassword}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddPassword}
                      disabled={addingPassword || !password || !confirmPassword}
                    >
                      {addingPassword ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        'Add Password'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Google Auth */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <div>
                <p className="font-medium">Google</p>
                <p className="text-sm text-muted-foreground">
                  {hasGoogleAuth ? 'Sign in with your Google account' : 'Not connected'}
                </p>
              </div>
            </div>
            {!hasGoogleAuth && (
              <Button size="sm" variant="outline" onClick={handleLinkGoogle}>
                <Plus className="h-4 w-4 mr-1" />
                Connect
              </Button>
            )}
          </div>
        </div>

        {identities && identities.identities.length > 1 && (
          <p className="text-sm text-muted-foreground mt-4">
            You have multiple authentication methods configured. You can sign in with any of them.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AuthMethods;