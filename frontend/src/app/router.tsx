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
import { useLocation } from "react-router-dom";
function AssistantRedirect() { const location = useLocation(); return <Navigate to={"/chat" + location.search} replace />; }
import { SupportList, SupportDetail } from "../features/account/SupportPages";
import RagSettingsPage from "../pages/RagSettingsPage";

import { AccountLayout } from "../features/account/shared";
import {
  AccountHome,
  ProfilePage,
  SecurityPage,
  NotificationsPage,
} from "../features/account/AccountPages";
import {
  PurchaseList,
  PurchaseDetail,
  NewPurchasePage,
} from "../features/account/PurchasePages";
import {
  ChangeRequestsPage,
  AppointmentsPage,
  FavoritesPage,
} from "../features/account/JourneyPages";

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
            <Route path="purchase-requests" element={<PurchaseList admin />} />
            <Route
              path="purchase-requests/:id"
              element={<PurchaseDetail admin />}
            />
            <Route
              path="change-requests"
              element={<ChangeRequestsPage admin />}
            />
            <Route path="appointments" element={<AppointmentsPage admin />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="support-tickets" element={<SupportList admin />} />
            <Route path="support-tickets/:id" element={<SupportDetail admin />} />
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
            <Route path="/account" element={<AccountLayout />}>
              <Route index element={<AccountHome />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:orderId" element={<OrderDetailPage />} />
              <Route path="assistant" element={<AssistantRedirect />} />
              <Route path="purchase-requests" element={<PurchaseList />} />
              <Route
                path="purchase-requests/new"
                element={<NewPurchasePage />}
              />
              <Route
                path="purchase-requests/:id"
                element={<PurchaseDetail />}
              />
              <Route path="change-requests" element={<ChangeRequestsPage />} />
              <Route path="appointments" element={<AppointmentsPage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="support-tickets" element={<SupportList />} />
              <Route path="support-tickets/:id" element={<SupportDetail />} />
            </Route>
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
