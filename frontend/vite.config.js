import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'MiCartera',
        short_name: 'MiCartera',
        description: 'Seguimiento de cartera de inversiones argentina',
        theme_color: '#080a0d',
        background_color: '#080a0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  server: {
    port: 5173,
    host: true,   // expone en 0.0.0.0 → accesible desde cualquier dispositivo en la misma red WiFi
    // En desarrollo, el frontend proxea las llamadas al backend local.
    // El teléfono solo habla con Vite; Vite reenvía /api al backend transparentemente.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
