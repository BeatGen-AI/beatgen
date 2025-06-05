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
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-12 bg-white/20 dark:bg-neutral-900/20 backdrop-blur-md border-t border-gray-200 dark:border-neutral-700 z-40">
      <div className="flex items-center justify-around h-full px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          if (item.isCreateButton) {
            return (
              <div key={item.text} className="flex flex-col items-center justify-center h-full relative">
                <Button
                  onClick={() => navigate({ to: item.path })}
                  className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-lg"
                  style={{ minWidth: '64px' }}
                >
                  <Icon 
                    className="w-8 h-8 mb-1"
                    style={{ color: item.color }}
                  />
                  <span 
                    className="text-xs font-normal leading-none"
                    style={{ 
                      color: item.color,
                      fontSize: '8px'
                    }}
                  >
                    {item.text}
                  </span>
                </Button>
              </div>
            );
          }

          return (
            <Button
              key={item.text}
              variant="ghost"
              onClick={() => navigate({ to: item.path })}
              className={`flex flex-col items-center justify-center p-0 h-full min-w-0 flex-1 gap-0 ${
                active ? 'bg-gray-100 dark:bg-neutral-800' : ''
              }`}
            >
              <Icon 
                className="w-5 h-5"
                style={{ color: active ? item.color : '#6B7280' }}
              />
              <span 
                className={`text-xs ${active ? 'font-medium' : 'font-normal'} leading-none`}
                style={{ 
                  color: active ? item.color : '#6B7280',
                  fontSize: '9px'
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