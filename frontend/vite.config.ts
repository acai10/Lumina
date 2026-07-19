import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL needs no `define` here: Vite natively exposes VITE_-prefixed
// variables from both the process environment (docker-compose) and .env files,
// and shared/api/client.ts provides the http://localhost:8000 fallback. A
// `define` would be evaluated before .env files are loaded and silently
// override them.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['h5wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest dependencies into their own chunks so the browser can
        // cache and parse them independently of the app code. Three.js in particular
        // is large and rarely changes — keeping it separate means app edits don't
        // bust its cache, and chunks load in parallel with the main bundle.
        // NOTE: h5wasm is intentionally NOT listed here. It is imported only by
        // h5.worker.ts (the Web Worker), which Vite bundles separately. Listing it
        // as a main-thread manualChunk previously shipped a duplicate ~4.4 MB copy.
        manualChunks: {
          three: ['three'],
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
