import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostHogProvider } from 'posthog-js/react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';

// Import the generated route tree
import { routeTree } from './routeTree.gen';

// Import MUI fonts
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
// Studio import removed - it's loaded via routes now
// import Studio from './studio/Studio';

// Import AuthProvider
import { AuthProvider } from './platform/auth/auth-context';
// Import our custom Theme Provider
import { ThemeProvider } from './lib/theme-provider';
// Import UserProvider
import { UserProvider } from './platform/context/UserContext';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10, // 10 minutes - increased for better caching
      gcTime: 1000 * 60 * 30, // 30 minutes - keep in cache longer (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on component mount if data is fresh
      retry: 2, // Retry failed requests twice
    },
  },
});

// Create the router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: {
    queryClient,
  },
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// When used directly (not through the loader)
if (document.getElementById('root')) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={{
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          defaults: '2025-05-24',
          capture_exceptions: true,
          debug: import.meta.env.MODE === "development",
        }}
      >
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <UserProvider>
              <ThemeProvider>
                <RouterProvider router={router} />
              </ThemeProvider>
            </UserProvider>
          </AuthProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </React.StrictMode>
  );
}

// Keep track of roots to allow for proper cleanup
const rootRegistry: Record<string, ReactDOM.Root> = {};

// Studio mounting functions removed - Studio is now loaded via routes
// const mountStudio = (elementId: string) => { ... };

// Studio mounting functions removed - Studio is now loaded via routes
// All studio mounting/unmounting logic has been removed since the Studio
// is now loaded through the routing system at /studio