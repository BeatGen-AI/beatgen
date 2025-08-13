import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  IconMenu2,
  IconUserCircle,
  IconHome,
  IconFolder,
  IconSettings,
  IconLogout,
  IconSparkles,
  IconCoins,
} from '@tabler/icons-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { useAuth } from '../auth/auth-context';
import { PricingDialog, PlanBadge } from './subscription';
import { CreditsDisplay } from './credits/CreditsDisplay';
import { useUser } from '../context/UserContext';

const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];

const MobileTopNav: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, profile, user } = useAuth();
  const { subscription } = useUser();
  const [showPricingDialog, setShowPricingDialog] = useState(false);
  const currentPlan = subscription?.plan || null;

  const menuItems = [
    { text: 'Home', icon: <IconHome className="w-4 h-4" />, path: '/' },
    { text: 'Projects', icon: <IconFolder className="w-4 h-4" />, path: '/projects' },
    { text: 'Settings', icon: <IconSettings className="w-4 h-4" />, path: '/settings' },
  ];

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700 z-40 flex items-center justify-between px-4">
      {/* Left side - Menu dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <IconMenu2 className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {menuItems.map((item, index) => (
            <DropdownMenuItem 
              key={item.text}
              onClick={() => navigate({ to: item.path })}
              className="flex items-center"
            >
              {React.cloneElement(item.icon, {
                style: { color: logoColors[index % logoColors.length] }
              })}
              <span className="ml-2" style={{ color: logoColors[index % logoColors.length] }}>
                {item.text}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setShowPricingDialog(true)}
            className="flex items-center"
          >
            <IconSparkles className="w-4 h-4" style={{ color: '#e539a9' }} />
            <span className="ml-2" style={{ color: '#e539a9', fontWeight: 600 }}>Upgrade</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => navigate({ to: '/credits' })}
            className="flex items-center"
          >
            <IconCoins className="w-4 h-4" style={{ color: '#f59e0b' }} />
            <span className="ml-2">Credits</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={async () => {
              await signOut();
              navigate({ to: '/home', replace: true });
            }}
            className="flex items-center"
          >
            <IconLogout className="w-4 h-4" />
            <span className="ml-2">Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Center - App title */}
      <div className="flex items-center">
        <img src="/beatgen-favicon.png" alt="BeatGen" className="w-6 h-6 mr-2" />
        <span className="text-lg font-semibold" style={{ color: logoColors[3] }}>
          BeatGen
        </span>
      </div>

      {/* Right side - Profile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="p-1">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.display_name || profile.username || 'User Avatar'} 
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <IconUserCircle className="w-7 h-7" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {profile?.display_name || profile?.username || user?.email || 'User'}
                </p>
                <PlanBadge tier={currentPlan?.tier} />
              </div>
              <p className="text-xs text-gray-500">
                {user?.email || 'No email available'}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* Credits Display */}
          <div className="px-2 py-1">
            <CreditsDisplay />
          </div>
          
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate({ to: '/profile' })}>
            <IconUserCircle className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: '/settings' })}>
            <IconSettings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={async () => {
              await signOut();
              navigate({ to: '/home', replace: true });
            }}
          >
            <IconLogout className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Pricing Dialog */}
      <PricingDialog 
        open={showPricingDialog} 
        onOpenChange={setShowPricingDialog} 
      />
    </div>
  );
};

export default MobileTopNav;