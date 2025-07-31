import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Loader2, AlertCircle, UserCircle, Save, ArrowLeft, UploadCloud, CreditCard } from 'lucide-react';
import { addPassword, UserProfile } from '../api/auth';
import { useNavigate } from '@tanstack/react-router';
import { SubscriptionStatus } from '../components/subscription';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useUser } from '../context/UserContext';
import { FadeCard, FadeCardHeader, FadeCardTitle, FadeCardDescription, FadeCardContent } from '../../components/ui/fade-card';

const ProfilePage: React.FC = () => {
  const { user, signOut } = useAuth();
  const { profile, profileLoading: authLoading, updateProfile, uploadUserAvatar } = useUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Add password functionality
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addingPassword, setAddingPassword] = useState(false);
  const [passwordDialogError, setPasswordDialogError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '');
      setDisplayName(profile.display_name || '');
      setPreviewUrl(profile.avatar_url || null);
    }
  }, [profile]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      const currentPreview = URL.createObjectURL(file);
      setPreviewUrl(currentPreview);
      return () => URL.revokeObjectURL(currentPreview);
    }
  };

  const handleAddPassword = async () => {
    // Clear previous dialog errors
    setPasswordDialogError(null);

    if (password !== confirmPassword) {
      setPasswordDialogError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setPasswordDialogError('Password must be at least 6 characters');
      return;
    }

    setAddingPassword(true);

    try {
      await addPassword(password);
      setSuccess('Password added successfully! You can now sign in with your email and password.');
      setShowAddPassword(false);
      setPassword('');
      setConfirmPassword('');
      setPasswordDialogError(null);
    } catch (err: any) {
      setPasswordDialogError(err.response?.data?.detail || 'Failed to add password');
    } finally {
      setAddingPassword(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    if (!profile) {
      setError('Profile data not available.');
      setIsLoading(false);
      return;
    }

    let newAvatarUrl: string | undefined = undefined;

    if (selectedFile) {
      try {
        const uploadResponse = await uploadUserAvatar(selectedFile);
        if (uploadResponse) {
          newAvatarUrl = uploadResponse.avatar_url;
          setPreviewUrl(newAvatarUrl);
          setSelectedFile(null);
        } else {
          setError('Failed to upload avatar.');
          setIsLoading(false);
          return;
        }
      } catch (uploadError: any) {
        setError(uploadError.response?.data?.detail || uploadError.message || 'Failed to upload avatar.');
        setIsLoading(false);
        return;
      }
    }

    const updatedData: Partial<UserProfile> = {};
    if (username !== profile.username) {
      updatedData.username = username;
    }
    if (displayName !== profile.display_name) {
      updatedData.display_name = displayName;
    }
    if (newAvatarUrl && newAvatarUrl !== profile.avatar_url) {
      updatedData.avatar_url = newAvatarUrl;
    }

    if (Object.keys(updatedData).length === 0) {
      setSuccess('No changes to save.');
      setIsLoading(false);
      return;
    }

    if (updatedData.username !== undefined && !updatedData.username.trim()) {
      setError('Username cannot be empty.');
      setIsLoading(false);
      return;
    }

    try {
      const result = await updateProfile(updatedData);
      if (result) {
        setSuccess('Profile updated successfully!');
      } else {
        setError('Failed to update profile.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update profile.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (selectedFile && previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, selectedFile]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-center">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            User not logged in or profile not found. Please{' '}
            <Button variant="link" onClick={() => window.location.href = '/login'}>login</Button>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <div className="container mx-auto max-w-4xl py-12 px-4 sm:px-6 lg:px-8">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Section */}
        <FadeCard className="p-6 sm:p-8">
          <FadeCardHeader>
            <div className="flex flex-col items-center space-y-4">
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/gif"
                className="hidden"
              />
              <div 
                className="relative w-32 h-32 rounded-full cursor-pointer group ring-2 ring-offset-2 ring-primary ring-offset-background"
                onClick={() => fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <img 
                    src={previewUrl} 
                    alt="Profile" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="w-full h-full text-muted-foreground" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <UploadCloud className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
            <FadeCardTitle className="text-center">User Profile</FadeCardTitle>
            <FadeCardDescription className="text-center">Manage your account settings.</FadeCardDescription>
          </FadeCardHeader>
          <FadeCardContent>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="default" className="mb-4 bg-green-100 border-green-400 text-green-700">
            <AlertCircle className="h-4 w-4 text-green-500" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleProfileUpdate} className="space-y-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              disabled
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground pt-1">Email cannot be changed.</p>
          </div>

          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1"
              placeholder="Your unique username"
            />
          </div>

          <div>
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1"
              placeholder="Your public display name"
            />
          </div>

          {/* Add Password button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddPassword(true)}
              className="w-full"
            >
              Add Password Authentication
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Add a password to sign in with your email address (if you don't already have one)
            </p>
          </div>
          
          <div className="flex justify-between items-center pt-4">
            <Button 
              variant="outline" 
              onClick={() => navigate({ to: '/home'})}
              disabled={isLoading}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="flex space-x-3">
              {/* <Button 
                  variant="outline" 
                  onClick={handleLogout} 
                  disabled={isLoading}
                >
                  Logout
                </Button> */}
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
          </FadeCardContent>
        </FadeCard>

        {/* Subscription Section */}
        <div className="h-fit">
          <SubscriptionStatus />
        </div>
      </div>

      {/* Add Password Dialog */}
      <Dialog open={showAddPassword} onOpenChange={(open) => {
        setShowAddPassword(open);
        if (!open) {
          // Clear form and errors when dialog closes
          setPassword('');
          setConfirmPassword('');
          setPasswordDialogError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Password Authentication</DialogTitle>
            <DialogDescription>
              Set a password to sign in with your email address
            </DialogDescription>
          </DialogHeader>
          {passwordDialogError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{passwordDialogError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a secure password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
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
    </div>
  );
};

export default ProfilePage;
