import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';

  return {
    envPrefix: ['VITE_', 'DEV_VITE_', 'PROD_VITE_'], // Allow VITE_, DEV_VITE_, and PROD_VITE_ prefixes
    plugins: [
      react(),
      tailwindcss(),
      TanStackRouterVite(),
    ],
    define: {
      'process.env': JSON.stringify({}),
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
      port: 5173,
      host: true,
      proxy: {
        '/auth': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/users': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/projects/': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/sounds': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/soundfonts': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/drum-samples': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/assistant': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/health': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/subscriptions': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/webhooks': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/credits/': {
          target: 'http://localhost:8000',
          changeOrigin: true
        }
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
      exclude: []
    },
    assetsInclude: ['**/*.wav', '**/*.mp3', '**/*.ogg', '**/*.midi', '**/*.mid'],
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  }
})
