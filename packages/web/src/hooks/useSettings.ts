import { useQuery } from '@tanstack/react-query'
import { fetchSettings } from '../lib/api.js'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 5 * 60_000, // settings change rarely
  })
}
