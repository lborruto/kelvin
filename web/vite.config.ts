import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

const api = process.env.KELVIN_API ?? 'http://127.0.0.1:8000';
const proxy = { '/api': { target: api, changeOrigin: false }, '/mcp': { target: api, changeOrigin: false } };

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: { __KELVIN_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      // SvelteKit builds with a relative base ('./'): without an absolute base the app registers
      // './sw.js' and links './manifest.webmanifest', which break on deep links like /rooms/x.
      base: '/',
      scope: '/',
      registerType: 'autoUpdate',
      kit: { adapterFallback: 'index.html', spa: true },
      manifest: {
        // A stable identity: the installed PWA stays the same app if start_url ever changes.
        id: '/',
        name: 'Kelvin',
        short_name: 'Kelvin',
        // The manifest is static: it keeps the product default, French. The installed app's name
        // and description do not follow the runtime language (Réglages › Langue); the UI does.
        description: 'Le chauffage de la maison',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0B0B0D',
        theme_color: '#050506',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['client/**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/mcp(\/|$)/]
      }
    }),
    ...(process.env.VITEST ? [svelteTesting()] : [])],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts']
  }
});
