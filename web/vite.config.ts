import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 是 project site（網址帶 repo 名稱子路徑），本地開發與 Vercel 之類的
// root 部署則不受影響（base 保持 '/'）。之後若換成自訂網域，把這個環境變數改掉即可。
const BASE_PATH = process.env.GITHUB_PAGES === 'true' ? '/ai-car-guide/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
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
        // 用相對路徑而非寫死 '/'，才能同時相容 root 部署與 GitHub Pages 的子路徑部署
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        // model 權重檔與 tesseract 資源體積大，交由任務 11 的自訂預載邏輯處理，
        // 不納入 service worker 的自動 precache 清單，避免安裝時強制下載全部資源
        globIgnores: ['model/**', '**/*.wasm', '**/*.traineddata*'],
      },
      devOptions: {
        // dev 模式下 SW 對 SPA 子路徑導覽的攔截規則容易誤判並洗版 console 警告，
        // 且會干擾開發時的即時重新整理；PWA/離線行為請改用 `npm run build && npm run preview` 驗證
        enabled: false,
      },
    }),
  ],
})
