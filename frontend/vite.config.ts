import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import fs from 'fs'
import https from 'https'
import type { IncomingMessage } from 'http'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// Removed srcPath check as it was causing issues in Vercel build environment
// const srcPath = path.resolve(__dirname, '../src')
// console.log('Source path exists:', fs.existsSync(srcPath))

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  // Every variable from the env files and the process environment (process env wins).
  const env = { ...loadEnv(mode, __dirname, ''), ...process.env };

  // Asset URLs are built from VITE_SUPABASE_URL (src/platform/config/supabase.ts). A build
  // without it would ship a frontend whose instruments and samples cannot load, so fail
  // the build instead of the app.
  if (command === 'build' && !env.VITE_SUPABASE_URL) {
    throw new Error('VITE_SUPABASE_URL must be set to the Supabase project URL for production builds.');
  }

  // Dev-server switches, all optional; the defaults keep the HTTPS localhost setup.
  // DEV_SERVER_HTTPS=false serves plain HTTP (e.g. behind a TLS-terminating preview proxy).
  if (env.DEV_SERVER_HTTPS !== undefined && !['true', 'false'].includes(env.DEV_SERVER_HTTPS)) {
    throw new Error(`DEV_SERVER_HTTPS must be "true" or "false", got "${env.DEV_SERVER_HTTPS}"`);
  }
  const devHttps = isDev && env.DEV_SERVER_HTTPS !== 'false';
  // DEV_SERVER_ALLOWED_HOSTS: "all", or a comma-separated host list (".example.com" matches subdomains).
  const allowedHosts = env.DEV_SERVER_ALLOWED_HOSTS === undefined
    ? undefined
    : env.DEV_SERVER_ALLOWED_HOSTS === 'all'
      ? true
      : env.DEV_SERVER_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean);
  // DEV_SUPABASE_PROXY_TARGET: proxy /storage/v1 to a Supabase stack (pairs with an empty
  // VITE_SUPABASE_URL), so public assets load same-origin, including through remote previews.
  // API prefixes served by the backend. Some share a name with SPA routes (/projects,
  // /credits), so browser page navigations (GET asking for HTML) bypass the proxy and get
  // the app; API calls from axios/fetch (JSON) go to the backend.
  const backendTarget = {
    target: 'https://localhost:8000',
    changeOrigin: true,
    secure: false, // the local backend uses the self-signed frontend/.cert pair
    agent: new https.Agent({ minVersion: 'TLSv1.2' }),
    bypass: (req: IncomingMessage) =>
      req.method === 'GET' && req.headers.accept?.includes('text/html') ? req.url : undefined,
  };
  const backendProxy = Object.fromEntries(
    ['/auth', '/users', '/projects', '/sounds', '/soundfonts', '/drum-samples', '/assistant',
      '/health', '/subscriptions', '/webhooks', '/credits'].map((prefix) => [prefix, backendTarget])
  );
  const supabaseProxy = env.DEV_SUPABASE_PROXY_TARGET
    ? { '/storage/v1': { target: env.DEV_SUPABASE_PROXY_TARGET, changeOrigin: true } }
    : {};

  return {
    envPrefix: ['VITE_', 'DEV_VITE_', 'PROD_VITE_'], // Allow VITE_, DEV_VITE_, and PROD_VITE_ prefixes
    plugins: [
      react(),
      tailwindcss(),
      tanstackRouter(),
    ],
    define: {
      // Provide browser-compatible values for Node.js globals
      'process.env': JSON.stringify({}),
      // Set NODE_ENV based on mode
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || (isDev ? 'development' : 'production')),
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: '@src', replacement: path.resolve(__dirname, 'src') },
        { find: '@core', replacement: path.resolve(__dirname, 'src/core') },
        { find: '@components', replacement: path.resolve(__dirname, 'src/components') },
        { find: '@constants', replacement: path.resolve(__dirname, 'src/constants') },
        { find: '@utils', replacement: path.resolve(__dirname, 'src/utils') },
        { find: '@api', replacement: path.resolve(__dirname, 'src/api') }
      ]
    },
    server: {
      port: 5173, // Default Vite port
      ...(allowedHosts === undefined ? {} : { allowedHosts }),
      proxy: {
        ...supabaseProxy,
        ...backendProxy,
      },
      https: devHttps ? {
        key: fs.readFileSync(path.resolve(__dirname, '.cert/key.pem')),
        cert: fs.readFileSync(path.resolve(__dirname, '.cert/cert.pem'))
      } : undefined, // HTTPS only for dev server
      host: true // This is important to expose the server to the network for local dev
    },
    // Log resolved paths for debugging
    optimizeDeps: {
      include: ['react', 'react-dom'],
      exclude: []
    },
    // Special handling for audio files
    assetsInclude: ['**/*.wav', '**/*.mp3', '**/*.ogg', '**/*.midi', '**/*.mid'],
    build: {
      outDir: 'dist',
      sourcemap: true, // Consider setting to false or 'hidden' for production
      rollupOptions: {
        output: {
          // Use hashed filenames for cache busting in production
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  }
})