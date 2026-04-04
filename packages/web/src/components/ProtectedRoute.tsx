import { Navigate, Outlet } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useCurrentUser.js'

export default function ProtectedRoute() {
  const { user, isLoading } = useCurrentUser()
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tn-bg text-tn-muted">
        Loading...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
