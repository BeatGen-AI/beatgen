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
  IconMenu2,
  IconX,
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

  const menuItems = [
    { text: 'Home', icon: <IconHomeFilled />, path: '/' },
    { text: 'Projects', icon: <IconFolder />, path: '/projects' },
    { text: 'Audio Tracks', icon: <IconMusic />, path: '/audio-tracks' },
    { text: 'Midi Tracks', icon: <IconPiano />, path: '/midi-tracks' },
    { text: 'Sampler Tracks', icon: <IconWaveSine />, path: '/sampler-tracks' },
    { text: 'Drum Tracks', icon: <IconDisc />, path: '/drum-tracks' },
  ];

  return (
    <div 
      className={`
        hidden md:flex fixed left-0 top-0 h-screen bg-white border-r border-gray-200 z-50 transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-64' : 'w-16'}
        flex-col
      `}
    >
        {/* Header */}
        <div className={`flex items-center p-4 border-b border-gray-200 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
          {isExpanded ? (
            <>
              <div className="flex items-center">
                <img src="/beatgen-favicon.png" alt="BeatGen" className="w-6 h-6 mr-2" />
                <span className="text-xl font-semibold" style={{ color: beatGenTitleColor }}>
                  BeatGen
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
              >
                <IconMenu2 className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="p-1"
            >
              <IconMenu2 className="w-5 h-5" />
            </Button>
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
                  <span className="text-left truncate">
                    {profile?.display_name || profile?.username || 'My Profile'}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" side="right" align="start">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {profile?.display_name || profile?.username || user?.email || 'User'}
                  </p>
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

          {/* Navigation Menu */}
          <nav className="space-y-1">
            {menuItems.map((item, index) => (
              <Button
                key={item.text}
                variant="ghost"
                className={`w-full ${isExpanded ? 'justify-start p-2' : 'justify-center p-2'}`}
                title={isExpanded ? undefined : item.text}
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
            ))}
          </nav>
        </div>

        {/* Footer */}
        <div className={`border-t border-gray-200 ${isExpanded ? 'p-4' : 'p-2'}`}>
          <Button
            variant="ghost"
            className={`w-full ${isExpanded ? 'justify-start p-2' : 'justify-center p-2'}`}
            title={isExpanded ? undefined : 'Logout'}
            onClick={async () => {
              await signOut();
              navigate({ to: '/login', replace: true });
            }}
          >
            <IconLogout className={`w-5 h-5 ${isExpanded ? 'mr-3' : ''}`} />
            {isExpanded && <span>Logout</span>}
          </Button>
        </div>
    </div>
  );
};

export default SimpleSidebar;