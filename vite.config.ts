/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages などサブパスで配信するときは VITE_BASE=/リポジトリ名/ でビルド
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'img/*.webp'],
      manifest: {
        name: 'ちょうむしポイント',
        short_name: 'ちょうむし',
        description: 'かぞくで むしさがし！ ポイントを きろくする アプリ',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#bfe6a0',
        theme_color: '#4f9a2f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,png,svg,mp3}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          { // Japanese font subsets: cache on first use instead of precaching all of them
            urlPattern: ({ url }) => url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        // never cache Supabase API / auth traffic
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
