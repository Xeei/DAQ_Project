import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/munyin-dashboard/',
    build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          react:    ['react', 'react-dom'],
        }
      }
    }
  }
})
