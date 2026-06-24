import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Unique id per build, baked into the bundle and written to dist/version.json.
// The running app polls version.json and offers a reload when they differ.
const BUILD_ID = String(Date.now())

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      closeBundle() {
        writeFileSync(resolve('dist/version.json'), JSON.stringify({ build: BUILD_ID }))
      },
    },
  ],
  build: {
    // single JS chunk so the build can be inlined into one HTML file
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
