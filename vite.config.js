import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

// `vite preview` serves the same security headers as Vercel (vercel.json is the single source),
// so a too-strict Content-Security-Policy shows up locally before it ships.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
const siteHeaders = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));

export default {
  // Module workers: the preflight worker imports pdf.js as ES modules.
  worker: { format: 'es' },
  preview: { headers: siteHeaders },
  plugins: [
    VitePWA({
      // A new version takes over as soon as it is installed (skipWaiting + clientsClaim) and the page reloads
      // once onto it (src/pwa.js), so nobody keeps seeing an old version after a deploy.
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/pwa.js
      manifest: {
        name: 'KDP Book Studio: interior preflight',
        short_name: 'KDP Preflight',
        description: "Check a paperback interior PDF against Amazon KDP's printing rules. Your file never leaves your device.",
        start_url: '/',
        display: 'standalone',
        background_color: '#f3f2f7',
        theme_color: '#1d2633',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything needed to check a book offline: the app, the worker (pdf.js + pdf-lib, ~2.2 MB), the Inter font,
        // pdf.js's standard fonts (unembedded text) and image decoders (JPEG 2000, JBIG2).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}', 'pdfjs/standard_fonts/*', 'pdfjs/wasm/*'],
        // OCR files (public/ocr/, ~7 MB) are only needed for covers with text in the picture: cached on first use.
        globIgnores: ['ocr/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Character maps (CJK and other CID fonts, ~1.5 MB in ~170 files) are rarely needed:
        // cache each one the first time a book uses it.
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/pdfjs/cmaps/'),
          handler: 'CacheFirst',
          options: { cacheName: 'pdfjs-cmaps', expiration: { maxEntries: 200 } },
        }, {
          // Tesseract.js worker, engine and English model. File names don't change between versions, so the cache
          // name carries the tesseract.js major version: bump it when upgrading.
          urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'),
          handler: 'CacheFirst',
          options: { cacheName: 'ocr-tesseract-7', expiration: { maxEntries: 10 } },
        }],
      },
    }),
  ],
};
