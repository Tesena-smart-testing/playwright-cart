import { useQuery } from '@tanstack/react-query'
import { fetchRun } from '../lib/api.js'

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => fetchRun(runId),
  })
}
