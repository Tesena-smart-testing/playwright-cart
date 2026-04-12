import { cpSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

let pkgPath
try {
  pkgPath = require.resolve('playwright-core/package.json')
} catch {
  console.error('copy-trace-viewer: playwright-core not found. Run pnpm install.')
  process.exit(1)
}

const traceViewerSrc = join(dirname(pkgPath), 'lib', 'vite', 'traceViewer')
const traceViewerDest = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'trace-viewer',
)

try {
  cpSync(traceViewerSrc, traceViewerDest, { recursive: true })
} catch (err) {
  console.error(`copy-trace-viewer: failed to copy from ${traceViewerSrc}`)
  console.error(err.message)
  process.exit(1)
}

console.log('Trace viewer assets copied.')
