import { useQuery } from '@tanstack/react-query'
import { fetchTestSearch } from '../lib/api.js'

export function useTestSearch(q: string, project?: string) {
  return useQuery({
    queryKey: ['testSearch', q, project],
    queryFn: () => fetchTestSearch(q, project),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
}
