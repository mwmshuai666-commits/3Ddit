import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // 后端跑在 8080，前端 dev server 在 5173。
    // 用代理而不是在代码里写死绝对地址，这样生产环境只改 VITE_API_BASE
    // （见 .env.example）就能指向真正的域名，代码一行不用动。
    proxy: {
      '/api': {
        target: process.env.BT_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
