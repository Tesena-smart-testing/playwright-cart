import { createRequire } from 'module'
import { cpSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const pkgPath = require.resolve('playwright-core/package.json')
const traceViewerSrc = join(dirname(pkgPath), 'lib', 'vite', 'traceViewer')
const traceViewerDest = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'trace-viewer',
)

cpSync(traceViewerSrc, traceViewerDest, { recursive: true })
console.log('Trace viewer assets copied.')
