import { Outlet } from 'react-router-dom'
import { useServerEvents } from '../hooks/useServerEvents.js'
import TopNav from './TopNav.js'

export default function Layout() {
  useServerEvents()
  return (
    <div className="min-h-screen bg-tn-bg text-tn-fg">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
