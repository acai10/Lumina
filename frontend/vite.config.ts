import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? 'http://localhost:8000'),
  },
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
        manualChunks: {
          three: ['three'],
          h5wasm: ['h5wasm'],
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
