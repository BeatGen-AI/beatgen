import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/auth-context';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Loader2, AlertCircle, UserCircle, Save, ArrowLeft, UploadCloud } from 'lucide-react';
import { updateUserProfile, UserProfile, uploadAvatar } from '../api/auth';
import { useNavigate } from '@tanstack/react-router';

const ProfilePage: React.FC = () => {
  const { profile, loading: authLoading, user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const uploadResponse = await uploadAvatar(selectedFile);
        newAvatarUrl = uploadResponse.avatar_url;
        setPreviewUrl(newAvatarUrl);
        setSelectedFile(null);
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
      await updateUserProfile(updatedData);
      setSuccess('Profile updated successfully!');
      if (refreshProfile) await refreshProfile();
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
    <div className="container mx-auto max-w-2xl py-8 px-4 sm:px-6 lg:px-8">
      <div className="bg-card text-card-foreground p-6 sm:p-8 rounded-xl shadow-xl">
        <div className="flex flex-col items-center space-y-4 mb-6">
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
          <div>
            <h1 className="text-2xl font-bold text-center">User Profile</h1>
            <p className="text-muted-foreground text-center">Manage your account settings.</p>
          </div>
        </div>

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
              <Button 
                  variant="outline" 
                  onClick={handleLogout} 
                  disabled={isLoading}
                >
                  Logout
                </Button>
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
      </div>
    </div>
  );
};

export default ProfilePage;
