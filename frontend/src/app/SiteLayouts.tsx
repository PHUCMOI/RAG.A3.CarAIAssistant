import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { AppHeader } from "../shared/components/AppHeader";
import { AppFooter } from "../shared/components/AppFooter";
import { ErrorState } from "../shared/components/ErrorState";
import { LoadingSkeleton } from "../shared/components/LoadingSkeleton";
import { useOrdersSession } from "../features/orders/Session";
import '../features/admin/admin.css';

export function CustomerLayout() {
  const { user, loading } = useOrdersSession();
  const location = useLocation();
  if (loading) return <LoadingSkeleton />;
  if (user?.role === "Admin") return <Navigate to="/admin/orders" replace />;
  return (
    <div className={location.pathname === "/chat" ? "website-shell assistant-site" : "website-shell"}>
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
  return (
    <div className="website-shell admin-shell">
      <AppHeader admin />
      <main>
        <Outlet />
      </main>
      <footer className="admin-footer">AutoWise · Cổng quản trị</footer>
    </div>
  );
}
