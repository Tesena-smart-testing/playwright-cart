import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../lib/api.js'

export function useCurrentUser() {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min
  })
  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAdmin: query.data?.role === 'admin',
  }
}
