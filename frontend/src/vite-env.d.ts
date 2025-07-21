/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public PostHog Project API key */
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  /** Public PostHog instance host URL */
  readonly VITE_PUBLIC_POSTHOG_HOST: string;
  // add other environment variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}