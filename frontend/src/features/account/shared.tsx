import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { request } from "../orders/api";
import { useOrdersSession } from "../orders/Session";
import { ErrorState } from "../../shared/components/ErrorState";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
export type Profile = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  createdAtEstimated: boolean;
  version: number;
};
export type Page<T> = {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
};
export const labels: Record<string, string> = {
  submitted: "Đã gửi",
  in_consultation: "Đang tư vấn",
  converted: "Đã tạo đơn",
  rejected: "Đã từ chối",
  withdrawn: "Đã rút",
  pending: "Chờ xử lý",
  approved: "Đã duyệt",
  requested: "Chờ xác nhận",
  proposed: "Đề xuất lịch mới",
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
};
export const links = [
  ["/account", "Tổng quan"],
  ["/account/profile", "Thông tin"],
  ["/account/security", "Bảo mật"],
  ["/account/orders", "Đơn hàng"],
  ["/account/purchase-requests", "Yêu cầu mua xe"],
  ["/account/change-requests", "Đề nghị thay đổi"],
  ["/account/appointments", "Lịch hẹn"],
  ["/account/favorites", "Xe yêu thích"],
  ["/account/notifications", "Thông báo"],
  ["/account/assistant", "Trợ lý đơn hàng"],
];
export function AccountLayout() {
  const { user, loading, error, refresh } = useOrdersSession();
  const location = useLocation();
  if (loading) return <LoadingSkeleton />;
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void refresh()} />
      </div>
    );
  if (!user)
    return (
      <Navigate
        to={
          "/login?returnTo=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  if (user.role !== "Customer") return <Navigate to="/admin/orders" replace />;
  return (
    <>
      <nav className="account-nav" aria-label="Tài khoản khách hàng">
        {links.map(([to, name]) => (
          <NavLink key={to} to={to} end={to === "/account"}>
            {name}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
export function useData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    request<T>(url)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  return {
    data,
    setData,
    error,
    setError,
    reload: () => setRevision((r) => r + 1),
  };
}
export function Load({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <ErrorState message={error} onRetry={retry} />
  ) : (
    <LoadingSkeleton />
  );
}
export function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (value: number) => void;
}) {
  return (
    <div className="orders-toolbar">
      <button
        className="mini-button"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Trang trước
      </button>
      <span>
        Trang {page} · {total} mục
      </span>
      <button
        className="mini-button"
        disabled={page * 20 >= total}
        onClick={() => setPage(page + 1)}
      >
        Trang sau
      </button>
    </div>
  );
}
export function failure(e: unknown) {
  return e instanceof Error ? e.message : "Không thể xử lý yêu cầu.";
}
export function time(value: string) {
  return new Date(value).toLocaleString("vi-VN");
}
export async function common<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Không tải được catalogue Python.");
  return response.json();
}
