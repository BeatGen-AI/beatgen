import React from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import {
  IconMusic,
  IconPiano,
  IconWaveSine,
  IconDisc,
  IconPlus,
} from '@tabler/icons-react';
import { Button } from "../../components/ui/button";

const logoColors = [
  '#e539a9', // Bright Pink
  '#c63ba6', // Magenta
  '#a93fbf', // Dark Violet
  '#8247d8', // Purple
  '#6050e0', // Indigo
  '#4160e2', // Blue
];

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { 
      text: 'Audio', 
      icon: IconMusic, 
      path: '/audio-tracks',
      color: logoColors[2] // Audio Tracks color
    },
    { 
      text: 'MIDI', 
      icon: IconPiano, 
      path: '/midi-tracks',
      color: logoColors[3] // MIDI Tracks color
    },
    { 
      text: 'Create', 
      icon: IconPlus, 
      path: '/studio',
      color: '#ffffff', // White for the create button
      isCreateButton: true
    },
    { 
      text: 'Sampler', 
      icon: IconWaveSine, 
      path: '/sampler-tracks',
      color: logoColors[4] // Sampler Tracks color
    },
    { 
      text: 'Drums', 
      icon: IconDisc, 
      path: '/drum-tracks',
      color: logoColors[5] // Drum Tracks color
    },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-40">
      <div className="flex items-center justify-around h-full px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          if (item.isCreateButton) {
            return (
              <Button
                key={item.text}
                onClick={() => navigate({ to: item.path })}
                className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-lg"
                style={{ minWidth: '48px' }}
              >
                <Icon 
                  className="w-6 h-6"
                  style={{ color: item.color }}
                />
              </Button>
            );
          }

          return (
            <Button
              key={item.text}
              variant="ghost"
              onClick={() => navigate({ to: item.path })}
              className={`flex flex-col items-center justify-center p-1 h-full min-w-0 flex-1 ${
                active ? 'bg-gray-100 dark:bg-gray-800' : ''
              }`}
            >
              <Icon 
                className={`w-5 h-5 ${active ? 'mb-1' : 'mb-0.5'}`}
                style={{ color: active ? item.color : '#6B7280' }}
              />
              <span 
                className={`text-xs ${active ? 'font-medium' : 'font-normal'}`}
                style={{ 
                  color: active ? item.color : '#6B7280',
                  fontSize: '10px'
                }}
              >
                {item.text}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileBottomNav;