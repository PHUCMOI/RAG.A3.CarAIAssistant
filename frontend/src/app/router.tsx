import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { AppHeader } from "../shared/components/AppHeader";
import { AppFooter } from "../shared/components/AppFooter";
import HomePage from "../pages/HomePage";
import CarCatalogPage from "../pages/CarCatalogPage";
import CarDetailPage from "../pages/CarDetailPage";
import ComparePage from "../pages/ComparePage";
import DealersPage from "../pages/DealersPage";
import ChatPage from "../pages/ChatPage";
import SourceDetailPage from "../pages/SourceDetailPage";
import AdminDataPage from "../pages/AdminDataPage";
import { OrdersSession } from "../features/orders/Session";
import {
  LoginPage,
  OrdersPage,
  NewOrderPage,
  CustomersPage,
  OrderDetailPage,
} from "../features/orders/OrdersPages";
import RagSettingsPage from "../pages/RagSettingsPage";

function Layout() {
  return (
    <div className="website-shell">
      <AppHeader />
      <main>
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <OrdersSession>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/account/orders" element={<OrdersPage />} />
            <Route
              path="/account/orders/:orderId"
              element={<OrderDetailPage />}
            />
            <Route path="/admin/orders" element={<OrdersPage admin />} />
            <Route path="/admin/orders/new" element={<NewOrderPage />} />
            <Route
              path="/admin/orders/:orderId"
              element={<OrderDetailPage admin />}
            />
            <Route path="/admin/customers" element={<CustomersPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/cars" element={<CarCatalogPage />} />
            <Route path="/cars/:carId" element={<CarDetailPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/dealers" element={<DealersPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/sources/:sourceId" element={<SourceDetailPage />} />
            <Route path="/admin/data" element={<AdminDataPage />} />
            <Route path="/admin/rag" element={<RagSettingsPage />} />
            <Route
              path="*"
              element={
                <div className="page narrow">
                  <div className="state-card">
                    <h1>404</h1>
                    <p>Trang bạn tìm không tồn tại.</p>
                  </div>
                </div>
              }
            />
          </Route>
        </Routes>
      </OrdersSession>
    </BrowserRouter>
  );
}
