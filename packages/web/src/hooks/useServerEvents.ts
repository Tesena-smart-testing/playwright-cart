import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

export function useServerEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource('/api/events')

    es.addEventListener('error', () => {
      es.close()
    })

    es.addEventListener('run:created', () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      queryClient.invalidateQueries({ queryKey: ['runTimeline'] })
    })

    es.addEventListener('run:updated', (e: MessageEvent) => {
      const { runId } = JSON.parse(e.data) as { runId: string }
      queryClient.invalidateQueries({ queryKey: ['run', runId] })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      queryClient.invalidateQueries({ queryKey: ['runTimeline'] })
    })

    // run:complete is emitted as run:updated when status transitions to terminal
    // Invalidate chart data on reconnect to catch missed events
    es.addEventListener('open', () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      queryClient.invalidateQueries({ queryKey: ['runTimeline'] })
      queryClient.invalidateQueries({ queryKey: ['testHistory'] })
    })

    return () => es.close()
  }, [queryClient])
}
