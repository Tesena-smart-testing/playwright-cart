import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

export function useServerEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource('/api/events')

    es.addEventListener('run:created', () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    })

    es.addEventListener('run:updated', (e: MessageEvent) => {
      const { runId } = JSON.parse(e.data) as { runId: string }
      queryClient.invalidateQueries({ queryKey: ['run', runId] })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    })

    // Invalidate on reconnect to catch any events missed during disconnection
    es.addEventListener('open', () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    })

    return () => es.close()
  }, [queryClient])
}
