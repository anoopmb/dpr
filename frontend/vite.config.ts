import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'sw-push.js'],
      manifest: {
        name: 'DPR / Measurement Book System',
        short_name: 'DPR System',
        description: 'Daily Progress Report, Measurement Book, Billing and Expense tracking',
        theme_color: '#1677ff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        importScripts: ['/sw-push.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/support-centre\.html$/],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design'))
            return 'vendor-antd';
          if (id.includes('node_modules/recharts'))
            return 'vendor-charts';
          if (id.includes('node_modules/xlsx'))
            return 'vendor-xlsx';
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet'))
            return 'vendor-leaflet';
          if (id.includes('node_modules/@tanstack'))
            return 'vendor-query';
          if (id.includes('node_modules/react-router-dom'))
            return 'vendor-router';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/'))
            return 'vendor-react';
          if (
            id.includes('node_modules/dayjs') ||
            id.includes('node_modules/axios') ||
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/zod')
          )
            return 'vendor-utils';
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
