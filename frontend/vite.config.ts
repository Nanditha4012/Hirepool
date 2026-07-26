import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env vars (including ones without the VITE_ prefix) so we can read
  // VITE_APP_NAME here at config-evaluation time — vite-plugin-pwa's `manifest`
  // option is static and evaluated when this file runs, not at request time,
  // so `import.meta.env` is not available here.
  const env = loadEnv(mode, process.cwd(), '')
  const appName = env.VITE_APP_NAME || 'Hirepool'

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: appName,
          short_name: appName,
          theme_color: '#0A66C2',
          background_color: '#FFFFFF',
          display: 'standalone',
          icons: [
            // NOTE: these are placeholder references only — actual PNG binaries
            // for pwa-192x192.png / pwa-512x512.png must be dropped into
            // frontend/public/ before this manifest produces an installable PWA.
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
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  }
})
