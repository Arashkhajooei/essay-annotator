import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works under any path (GitHub Pages subdirectory)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // single JS chunk so the build can be inlined into one HTML file
    // (served by the Supabase Edge Function)
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
