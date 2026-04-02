import { useEffect, useState } from 'react'

interface Report {
  id: string
  reportUrl: string
  project?: string
  branch?: string
  commitSha?: string
  runId?: string
  uploadedAt: string
  status: 'passed' | 'failed' | 'timedout' | 'interrupted'
}

export default function App() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Report[]>
      })
      .then(setReports)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const openReport = (report: Report) => {
    // Open the Playwright HTML report (which includes the trace viewer) in a new tab.
    // It must be opened via HTTP — file:// URLs break the trace viewer's service worker.
    window.open(report.reportUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <p>Loading reports…</p>
  if (error) return <p>Error: {error}</p>

  return (
    <main>
      <h1>Playwright Cart</h1>
      {reports.length === 0 ? (
        <p>No reports uploaded yet.</p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li key={report.id}>
              <button type="button" onClick={() => openReport(report)}>
                {report.project ?? report.id} — {report.uploadedAt} — {report.status}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
