import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '智能檢車',
        short_name: '智能檢車',
        description: '引導式車損檢測拍照系統',
        theme_color: '#1e293b',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        // model 權重檔與 opencv/tesseract 資源體積大，交由任務 11 的自訂預載邏輯處理，
        // 不納入 service worker 的自動 precache 清單，避免安裝時強制下載全部資源
        globIgnores: ['model/**', '**/*.wasm', '**/*.traineddata*'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
