import { useQuery } from '@tanstack/react-query'
import { fetchRunTimeline, type TimelineParams } from '../lib/api.js'

export function useRunTimeline(params: TimelineParams, enabled = true) {
  return useQuery({
    queryKey: ['runTimeline', params],
    queryFn: () => fetchRunTimeline(params),
    staleTime: 60_000,
    enabled,
  })
}
