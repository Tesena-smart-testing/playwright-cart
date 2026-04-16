import { useQuery } from '@tanstack/react-query'
import { fetchTestHistory } from '../lib/api.js'

export function useTestHistory(testId: string | null, limit = 50, branch?: string) {
  return useQuery({
    queryKey: ['testHistory', testId, limit, branch],
    queryFn: () => fetchTestHistory(testId as string, limit, branch),
    enabled: testId !== null,
    staleTime: 60_000,
  })
}
