import { createWriteStream, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import archiver from 'archiver'

export function buildTestId(titlePath: string[], retry: number): string {
  const slug = titlePath.map((p) => p.replace(/[^a-z0-9]/gi, '-').toLowerCase()).join('--')
  return retry > 0 ? `${slug}-retry${retry}` : slug
}

export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return []

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].sort()
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function uploadWithRetry(
  fn: () => Promise<Response>,
  retries: number,
  delay: number,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fn()
      if (res.ok) return
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[playwright-cart] upload failed after ${retries} retries: ${err}`)
        return
      }
      await sleep(delay * 2 ** attempt)
    }
  }
}

export class Semaphore {
  private count: number
  private queue: Array<() => void> = []

  constructor(concurrency: number) {
    this.count = concurrency
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--
      return Promise.resolve()
    }
    return new Promise((resolve) => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.count++
    }
  }
}

export async function zipDirectory(dir: string): Promise<Buffer> {
  const zipPath = join(tmpdir(), `pct-report-${Date.now()}.zip`)
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    out.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(out)
    archive.directory(dir, false)
    void archive.finalize()
  })
  const buf = readFileSync(zipPath)
  rmSync(zipPath)
  return buf
}
