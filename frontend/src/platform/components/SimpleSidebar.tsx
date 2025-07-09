import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  IconHomeFilled,
  IconFolder,
  IconMusic,
  IconPiano,
  IconWaveSine,
  IconDisc,
  IconUserCircle,
  IconSettings,
  IconLogout,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { useAuth } from '../auth/auth-context';
import { PricingDialog, PlanBadge } from './subscription';
import { useSubscriptionStore, selectCurrentPlan } from '../stores/subscriptionStore';
import { CreditsDisplay } from './credits/CreditsDisplay';
import { useEffect } from 'react';

export const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];

const myProfileColor = '#c63ba6';
const beatGenTitleColor = logoColors[3]; // Purple for BeatGen title

interface SimpleSidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
}

const SimpleSidebar: React.FC<SimpleSidebarProps> = ({ 
  isExpanded, 
  onToggle
}) => {
  const navigate = useNavigate();
  const { signOut, profile, user } = useAuth();
  const [showPricingDialog, setShowPricingDialog] = useState(false);
  const fetchStatus = useSubscriptionStore(state => state.fetchStatus);
  const currentPlan = useSubscriptionStore(selectCurrentPlan);
  
  // Fetch subscription status when component mounts
  useEffect(() => {
    if (user) {
      fetchStatus();
    }
  }, [user, fetchStatus]);

  const menuItems = [
    { text: 'Home', icon: <IconHomeFilled />, path: '/' },
    { text: 'Projects', icon: <IconFolder />, path: '/projects' },
    { text: 'Audio Tracks', icon: <IconMusic />, path: '/audio-tracks' },
    { text: 'Midi Tracks', icon: <IconPiano />, path: '/midi-tracks' },
    { text: 'Sampler Tracks', icon: <IconWaveSine />, path: '/sampler-tracks' },
    { text: 'Drum Tracks', icon: <IconDisc />, path: '/drum-tracks' },
    { text: 'Credits', icon: <IconCoins />, path: '/credits' },
  ];

  return (
    <TooltipProvider>
      <div 
        className={`
          hidden md:flex fixed left-0 top-0 h-screen bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-700 z-50 transition-all duration-300 ease-in-out
          ${isExpanded ? 'w-64' : 'w-16'}
          flex-col
        `}
      >
        {/* Header */}
        <div className={`flex items-center p-4 border-b border-gray-200 dark:border-neutral-700 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
          {isExpanded ? (
            <>
              <div className="flex items-center">
                <img src="/beatgen-favicon.png" alt="BeatGen" className="w-6 h-6 mr-2" />
                <span className="text-xl font-semibold" style={{ color: beatGenTitleColor }}>
                  BeatGen
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggle}
                  >
                    <IconLayoutSidebarLeftCollapse className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Collapse Sidebar</p>
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggle}
                  className="p-1"
                >
                  <IconLayoutSidebarLeftExpand className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Expand Sidebar</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 flex flex-col ${isExpanded ? 'p-4' : 'p-2'}`}>
          {/* User Profile Section */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`w-full ${isExpanded ? 'justify-start p-2' : 'justify-center p-2'} mb-4`}
                title={isExpanded ? undefined : (profile?.display_name || profile?.username || 'My Profile')}
              >
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={profile.display_name || profile.username || 'User Avatar'} 
                    className={`w-6 h-6 rounded-full object-cover ${isExpanded ? 'mr-2' : ''}`}
                  />
                ) : (
                  <IconUserCircle className={`w-6 h-6 ${isExpanded ? 'mr-2' : ''}`} />
                )}
                {isExpanded && (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-left truncate">
                      {profile?.display_name || profile?.username || 'My Profile'}
                    </span>
                    <PlanBadge tier={currentPlan?.tier} className="ml-auto" />
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" side="right" align="start">
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
                  navigate({ to: '/login', replace: true });
                }}
              >
                <IconLogout className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Credits Display */}
          <CreditsDisplay />

          {/* Navigation Menu */}
          <nav className="space-y-1">
            {menuItems.map((item, index) => {
              const menuButton = (
                <Button
                  key={item.text}
                  variant="ghost"
                  className={`w-full ${isExpanded ? 'justify-start p-2' : 'justify-center p-2'}`}
                  onClick={() => {
                    navigate({ to: item.path });
                  }}
                >
                  {React.cloneElement(item.icon, {
                    className: `w-5 h-5 ${isExpanded ? 'mr-3' : ''}`,
                    style: { color: logoColors[index % logoColors.length] }
                  })}
                  {isExpanded && (
                    <span style={{ color: logoColors[index % logoColors.length] }}>
                      {item.text}
                    </span>
                  )}
                </Button>
              );

              // Wrap with tooltip only when collapsed
              if (!isExpanded) {
                return (
                  <Tooltip key={item.text}>
                    <TooltipTrigger asChild>
                      {menuButton}
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{item.text}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return menuButton;
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className={`border-t border-gray-200 dark:border-neutral-700 ${isExpanded ? 'p-4' : 'p-2'} space-y-2`}>
          {/* Upgrade Button */}
          {!isExpanded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  className="w-full justify-center p-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  onClick={() => setShowPricingDialog(true)}
                >
                  <IconSparkles className="w-5 h-5 text-white" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Upgrade to Premium</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="default"
              className="w-full justify-start p-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              onClick={() => setShowPricingDialog(true)}
            >
              <IconSparkles className="w-5 h-5 mr-3 text-white" />
              <span className="text-white font-semibold">Upgrade</span>
            </Button>
          )}
          
          {/* Logout Button */}
          {!isExpanded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-center p-2"
                  onClick={async () => {
                    await signOut();
                    navigate({ to: '/login', replace: true });
                  }}
                >
                  <IconLogout className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Logout</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start p-2"
              onClick={async () => {
                await signOut();
                navigate({ to: '/login', replace: true });
              }}
            >
              <IconLogout className="w-5 h-5 mr-3" />
              <span>Logout</span>
            </Button>
          )}
        </div>
      </div>
      
      {/* Pricing Dialog */}
      <PricingDialog 
        open={showPricingDialog} 
        onOpenChange={setShowPricingDialog} 
      />
    </TooltipProvider>
  );
};

export default SimpleSidebar;