import {
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useState } from "react";
import { AppHeader } from "../shared/components/AppHeader";
import { AppFooter } from "../shared/components/AppFooter";
import { ErrorState } from "../shared/components/ErrorState";
import { LoadingSkeleton } from "../shared/components/LoadingSkeleton";
import { useOrdersSession } from "../features/orders/Session";
import { request } from "../features/orders/api";

export function CustomerLayout() {
  const { user, loading } = useOrdersSession();
  if (loading) return <LoadingSkeleton />;
  if (user?.role === "Admin") return <Navigate to="/admin/orders" replace />;
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

export function AdminLayout() {
  const { user, loading, error, refresh } = useOrdersSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return <LoadingSkeleton />;
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void refresh()} />
      </div>
    );
  if (user?.role === "Customer")
    return <Navigate to="/account/orders" replace />;
  if (!user && location.pathname !== "/admin/login")
    return <Navigate to="/admin/login" replace />;
  async function logout() {
    setBusy(true);
    setLogoutError("");
    try {
      await request("/auth/logout", "POST");
      await refresh();
      navigate("/admin/login", { replace: true });
    } catch (err) {
      setLogoutError(
        err instanceof Error ? err.message : "Không thể đăng xuất.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="website-shell admin-shell">
      <header className="site-header admin-header">
        <NavLink className="logo" to={user ? "/admin/orders" : "/admin/login"}>
          <span>A</span>AutoWise <small>Admin</small>
        </NavLink>
        {user && (
          <>
            <nav className="main-nav" aria-label="Điều hướng quản trị">
              <NavLink to="/admin/orders">Đơn hàng</NavLink>
              <NavLink to="/admin/purchase-requests">Yêu cầu mua xe</NavLink>
              <NavLink to="/admin/change-requests">Đề nghị thay đổi</NavLink>
              <NavLink to="/admin/appointments">Lịch hẹn</NavLink>
              <NavLink to="/admin/customers">Khách hàng</NavLink>
              <NavLink to="/admin/support-tickets">Phiếu hỗ trợ</NavLink>
              <NavLink to="/admin/data">Dữ liệu</NavLink>
              <NavLink to="/admin/rag">Cấu hình RAG</NavLink>
            </nav>
            <div className="admin-user">
              <span>{user.displayName}</span>
              <button
                className="mini-button"
                disabled={busy}
                onClick={() => void logout()}
              >
                Đăng xuất
              </button>
            </div>
          </>
        )}
      </header>
      {logoutError && (
        <p className="orders-error" role="alert">
          {logoutError}
        </p>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="admin-footer">AutoWise · Cổng quản trị</footer>
    </div>
  );
}
