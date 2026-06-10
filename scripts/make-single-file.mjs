// Inline the Vite build into one self-contained HTML file, then wrap it in a
// Supabase Edge Function (supabase/edge-function-app.ts) that serves it.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist', import.meta.url).pathname
let html = readFileSync(join(dist, 'index.html'), 'utf8')
const assets = readdirSync(join(dist, 'assets'))

const jsFile = assets.find((f) => f.endsWith('.js'))
const cssFile = assets.find((f) => f.endsWith('.css'))
if (!jsFile || !cssFile) throw new Error('expected exactly one js and one css asset')

const js = readFileSync(join(dist, 'assets', jsFile), 'utf8')
  // a literal </script> inside the bundle would terminate the inline tag early
  .replace(/<\/script/gi, '<\\/script')
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8')

html = html
  .replace(new RegExp(`<script type="module"[^>]*${jsFile.replace(/[.[\]]/g, '\\$&')}[^>]*></script>`),
    () => `<script type="module">${js}</script>`)
  .replace(new RegExp(`<link rel="stylesheet"[^>]*${cssFile.replace(/[.[\]]/g, '\\$&')}[^>]*>`),
    () => `<style>${css}</style>`)
  .replace(/<link rel="modulepreload"[^>]*>/g, '')

if (html.includes(jsFile) || html.includes(cssFile)) throw new Error('asset reference still present after inlining')

writeFileSync(join(dist, 'app-single.html'), html)

const fn = `// Supabase Edge Function: serves the Essay Annotator app.
// Create a function (e.g. named "app") in the dashboard, paste this file,
// deploy, and DISABLE "Enforce JWT verification" in the function settings
// so the browser can load it without auth headers.
const HTML = ${JSON.stringify(html)};

Deno.serve(() =>
  new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
);
`
writeFileSync(new URL('../supabase/edge-function-app.ts', import.meta.url).pathname, fn)
console.log(`single-file HTML: ${(html.length / 1024).toFixed(0)} KB → dist/app-single.html + supabase/edge-function-app.ts`)
