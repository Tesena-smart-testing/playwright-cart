import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.js'
import ProtectedRoute from './components/ProtectedRoute.js'
import ChartDetailPage from './pages/ChartDetailPage.js'
import ChartsPage from './pages/ChartsPage.js'
import LoginPage from './pages/LoginPage.js'
import RunDetailPage from './pages/RunDetailPage.js'
import RunsPage from './pages/RunsPage.js'
import SettingsPage from './pages/SettingsPage.js'
import TestDetailPage from './pages/TestDetailPage.js'
import TestReliabilityPage from './pages/TestReliabilityPage.js'

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
            <Route path="settings" element={<SettingsPage />} />
            <Route path="charts" element={<ChartsPage />} />
            <Route path="charts/test-reliability" element={<TestReliabilityPage />} />
            <Route path="charts/:chartId" element={<ChartDetailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
