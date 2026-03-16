import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  cacheDir: '.vite-cache/renderer',
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
  },
  optimizeDeps: {
    force: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: ['**/dist-electron/**', '**/release/**'],
    },
  },
})
