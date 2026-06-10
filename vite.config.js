import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works under any path (GitHub Pages subdirectory)
export default defineConfig({
  plugins: [react()],
  base: './',
})
