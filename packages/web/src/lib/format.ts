export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

export function formatExpiry(
  startedAt: string,
  retentionDays: number,
): { label: string; tier: 'green' | 'yellow' | 'red' } {
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000
  const deleteAt = new Date(startedAt).getTime() + retentionMs
  const timeLeft = deleteAt - Date.now()

  // Color tier — proportional to the configured retention period
  let tier: 'green' | 'yellow' | 'red'
  if (timeLeft > retentionMs * 0.25) {
    tier = 'green'
  } else if (timeLeft > retentionMs * 0.1) {
    tier = 'yellow'
  } else {
    tier = 'red'
  }

  // Display label — days → hours → minutes
  let label: string
  if (timeLeft >= 24 * 60 * 60 * 1000) {
    label = `${Math.floor(timeLeft / (24 * 60 * 60 * 1000))}d`
  } else if (timeLeft >= 60 * 60 * 1000) {
    label = `${Math.floor(timeLeft / (60 * 60 * 1000))}h`
  } else {
    const mins = Math.floor(timeLeft / 60_000)
    label = mins > 0 ? `${mins}m` : '< 1m'
  }

  return { label, tier }
}
