import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.js'
import RunDetailPage from './pages/RunDetailPage.js'
import RunsPage from './pages/RunsPage.js'
import TestDetailPage from './pages/TestDetailPage.js'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RunsPage />} />
          <Route path="runs/:runId" element={<RunDetailPage />} />
          <Route path="runs/:runId/tests/:testId" element={<TestDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
