import { Link, useParams } from 'react-router-dom'
import AttachmentList from '../components/AttachmentList.js'
import ErrorBlock from '../components/ErrorBlock.js'
import TestHeader from '../components/TestHeader.js'
import { useTest } from '../hooks/useTest.js'

export default function TestDetailPage() {
  const { runId, testId } = useParams<{ runId: string; testId: string }>()
  const { data: test, isLoading, error } = useTest(runId!, testId!)

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-tn-muted">
          {error.name === 'NotFoundError' ? 'Test not found.' : error.message}
        </p>
        <Link
          to={`/runs/${runId}`}
          className="text-tn-blue hover:text-tn-purple"
        >
          ← Back to run
        </Link>
      </div>
    )
  }

  if (!test) return null

  return (
    <div>
      <Link
        to={`/runs/${runId}`}
        className="mb-4 inline-block text-sm text-tn-blue hover:text-tn-purple"
      >
        ← Back to run
      </Link>
      <TestHeader test={test} />
      {test.errors.length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-tn-muted">
            Errors
          </h3>
          {test.errors.map((err, i) => (
            <ErrorBlock key={i} error={err} />
          ))}
        </div>
      )}
      {test.annotations.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tn-muted">
            Annotations
          </h3>
          <div className="space-y-1">
            {test.annotations.map((ann, i) => (
              <div key={i} className="text-sm text-tn-fg">
                <span className="text-tn-blue">[{ann.type}]</span>
                {ann.description && (
                  <span className="ml-2 text-tn-muted">{ann.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <AttachmentList
        runId={runId!}
        testId={testId!}
        attachments={test.attachments}
      />
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 rounded bg-tn-highlight" />
      <div className="h-20 rounded-lg bg-tn-highlight" />
      <div className="h-32 rounded-lg bg-tn-highlight" />
    </div>
  )
}
