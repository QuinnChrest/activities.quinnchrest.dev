import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so one build works at the custom domain root and at
  // https://<user>.github.io/<repo>/. (Hash routing keeps every page at the same path.)
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  // MapLibre's worker is an ES module.
  worker: { format: 'es' },
  // MapLibre alone is ~1.2 MB minified (~350 KB gzipped); that's expected for a map site.
  build: { chunkSizeWarningLimit: 1500 },
})
