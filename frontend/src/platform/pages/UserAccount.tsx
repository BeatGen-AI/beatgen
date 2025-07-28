import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { Loader2, ArrowLeft, Edit, LogOut } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/auth-context';
import { useState } from 'react';

export default function UserAccount() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    await signOut();
    setIsLoading(false);
    navigate({ to: '/' });
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 md:p-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-bold">My Account</CardTitle>
            <Button 
              variant="default"
              onClick={() => navigate({ to: '/home' })}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Profile Information</h3>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Email:</span> {user?.email}</p>
              <p><span className="font-medium">Username:</span> {profile?.username || 'Not set'}</p>
              <p><span className="font-medium">Display Name:</span> {profile?.display_name || 'Not set'}</p>
              <p><span className="font-medium">Account Created:</span> {profile?.created_at ? new Date(profile.created_at).toLocaleString() : 'N/A'}</p>
            </div>
          </div>

          <Separator />
          
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <Button 
              variant="outline"
              disabled={isLoading}
              onClick={() => navigate({ to: '/account/edit' })}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Profile
            </Button>
            
            <Button 
              variant="destructive"
              disabled={isLoading}
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing Out...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}