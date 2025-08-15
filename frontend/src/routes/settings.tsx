import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import SettingsPage from '../platform/pages/SettingsPage';
import { requireAuth } from '../platform/auth/auth-utils';
import { usePageTheme } from '../lib/theme-provider';

export const Route = createFileRoute('/settings')({
  component: SettingsComponent,

  ...requireAuth('/home'),
});

function SettingsComponent() {
  // Apply homepage theme for settings page
  usePageTheme('homepage');
  
  return <SettingsPage />;
} 