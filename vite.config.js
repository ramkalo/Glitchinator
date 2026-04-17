import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// When deploying to GitHub Pages the site lives at /repo-name/.
// Set VITE_BASE env var in your GitHub Actions workflow (or .env) to match.
// For a custom domain (or username.github.io root), leave it as '/'.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  root: '.',
  base,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    open: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',

      // Files from public/ to include in the service worker precache
      includeAssets: ['favicon.ico', 'retroinator-icon.svg', 'apple-touch-icon-180x180.png', '*.png'],

      manifest: {
        name: 'Retroinator',
        short_name: 'Retroinator',
        description: 'Retro photo effects editor — grain, VHS, CRT, and more.',
        theme_color: '#0a0a1a',
        background_color: '#0a0a1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['photo', 'utilities'],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Precache all compiled JS/CSS/HTML + fonts
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // Cache Google Fonts at runtime (JetBrains Mono etc.)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
