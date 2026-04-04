import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.js'
import ProtectedRoute from './components/ProtectedRoute.js'
import LoginPage from './pages/LoginPage.js'
import RunDetailPage from './pages/RunDetailPage.js'
import RunsPage from './pages/RunsPage.js'
import TestDetailPage from './pages/TestDetailPage.js'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<RunsPage />} />
            <Route path="runs/:runId" element={<RunDetailPage />} />
            <Route path="runs/:runId/tests/:testId" element={<TestDetailPage />} />
            <Route path="settings" element={<div>Settings placeholder</div>} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
