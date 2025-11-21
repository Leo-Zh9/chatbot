import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    proxy: {
      '/api/chat': {
        target: 'http://44.200.240.201:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chat/, '/api/chat'),
      },
    },
  },
})
