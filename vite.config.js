import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, copyFileSync } from 'node:fs'
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
        // GitHub Pages serves 404.html for any unknown deep-link path under the
        // project page. Ship it as a copy of the freshly-built index.html so those
        // entry points boot the CURRENT build (with the update banner) instead of a
        // stale 404.html pinned to old hashed asset names.
        copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'))
      },
    },
  ],
  build: {
    // single JS chunk so the build can be inlined into one HTML file
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
