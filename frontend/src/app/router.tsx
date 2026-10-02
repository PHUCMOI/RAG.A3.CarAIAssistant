import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout, CustomerLayout } from "./SiteLayouts";

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

export function AppRouter() {
  return (
    <BrowserRouter>
      <OrdersSession>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/orders" replace />} />
            <Route path="login" element={<LoginPage admin />} />
            <Route path="orders" element={<OrdersPage admin />} />
            <Route path="orders/new" element={<NewOrderPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage admin />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="data" element={<AdminDataPage />} />
            <Route path="rag" element={<RagSettingsPage />} />
            <Route
              path="*"
              element={
                <div className="page">
                  <h1>Không tìm thấy trang quản trị</h1>
                </div>
              }
            />
          </Route>
          <Route element={<CustomerLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/account/orders" element={<OrdersPage />} />
            <Route
              path="/account/orders/:orderId"
              element={<OrderDetailPage />}
            />
            <Route path="/" element={<HomePage />} />
            <Route path="/cars" element={<CarCatalogPage />} />
            <Route path="/cars/:carId" element={<CarDetailPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/dealers" element={<DealersPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/sources/:sourceId" element={<SourceDetailPage />} />
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
