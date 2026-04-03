interface Props {
  error: { message: string; stack?: string }
}

export default function ErrorBlock({ error }: Props) {
  return (
    <div className="rounded-lg border border-tn-red/30 bg-tn-red/10 p-4">
      <p className="mb-2 text-sm font-medium text-tn-red">{error.message}</p>
      {error.stack && (
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-tn-muted">
          {error.stack}
        </pre>
      )}
    </div>
  )
}
