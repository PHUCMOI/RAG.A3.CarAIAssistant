import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { AppHeader } from '../shared/components/AppHeader'
import { AppFooter } from '../shared/components/AppFooter'
import HomePage from '../pages/HomePage'
import CarCatalogPage from '../pages/CarCatalogPage'
import CarDetailPage from '../pages/CarDetailPage'
import ComparePage from '../pages/ComparePage'
import DealersPage from '../pages/DealersPage'
import ChatPage from '../pages/ChatPage'
import SourceDetailPage from '../pages/SourceDetailPage'
import AdminDataPage from '../pages/AdminDataPage'
import RagSettingsPage from '../pages/RagSettingsPage'

function Layout() {
  return <div className="website-shell"><AppHeader /><main><Outlet /></main><AppFooter /></div>
}

export function AppRouter() {
  return <BrowserRouter><Routes><Route element={<Layout />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/cars" element={<CarCatalogPage />} />
    <Route path="/cars/:carId" element={<CarDetailPage />} />
    <Route path="/compare" element={<ComparePage />} />
    <Route path="/dealers" element={<DealersPage />} />
    <Route path="/chat" element={<ChatPage />} />
    <Route path="/sources/:sourceId" element={<SourceDetailPage />} />
    <Route path="/admin/data" element={<AdminDataPage />} />
    <Route path="/admin/rag" element={<RagSettingsPage />} />
    <Route path="*" element={<div className="page narrow"><div className="state-card"><h1>404</h1><p>Trang bạn tìm không tồn tại.</p></div></div>} />
  </Route></Routes></BrowserRouter>
}
