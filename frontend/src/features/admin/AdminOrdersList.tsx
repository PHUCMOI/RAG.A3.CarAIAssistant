import { Link } from "react-router-dom";
import { statuses, type Page } from "../orders/api";
import { useData, Load } from "../account/shared";
import { formatVnd } from "../../shared/formatting/currency";
import { formatDate } from "../../shared/formatting/date";
import {
  AdminHeading,
  AdminTable,
  AdminBadge,
  AdminPager,
  AdminEmpty,
  useAdminListQuery,
} from "./ui";

export function AdminOrdersList() {
  const q = useAdminListQuery(Object.keys(statuses));
  const delayed = q.params.get("delayed") === "true";
  const state = useData<Page>(
    `/admin/orders?page=${q.page}&pageSize=12&query=${encodeURIComponent(q.query)}&status=${q.status}&delayed=${delayed}`,
  );
  return (
    <div className="page admin-page">
      <AdminHeading
        title="Quản lý đơn hàng"
        description="Theo dõi giao dịch, tiến độ và lịch bàn giao."
        actions={
          <Link className="button" to="/admin/orders/new">
            + Tạo đơn
          </Link>
        }
      />
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          q.apply();
        }}
      >
        <label>
          Tìm mã đơn
          <input
            value={q.draft}
            onChange={(event) => q.input(event.target.value)}
            placeholder="Nhập mã đơn…"
          />
        </label>
        <label>
          Trạng thái
          <select
            value={q.status}
            onChange={(event) => q.update("status", event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={delayed}
            onChange={(event) =>
              q.update("delayed", event.target.checked ? "true" : "")
            }
          />
          Chỉ đơn chậm bàn giao
        </label>
        <button type="button" className="mini-button" onClick={q.clear}>
          Xóa bộ lọc
        </button>
      </form>
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          <p className="admin-result-count">
            {state.data.totalCount} đơn phù hợp
          </p>
          {!state.data.items.length ? (
            <AdminEmpty text="Không có đơn phù hợp." clear={q.clear} />
          ) : (
            <AdminTable
              caption="Danh sách đơn hàng"
              headers={[
                "Mã đơn",
                "Khách hàng",
                "Xe / đại lý",
                "Trạng thái",
                "Giá chốt",
                "Lịch giao",
                "Chi tiết",
              ]}
            >
              {state.data.items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      className="admin-code"
                      to={`/admin/orders/${order.id}`}
                    >
                      {order.code}
                    </Link>
                  </td>
                  <td>{order.customerName}</td>
                  <td>
                    <strong>{order.carName}</strong>
                    <small>{order.dealerName}</small>
                  </td>
                  <td>
                    <AdminBadge value={order.status}>
                      {statuses[order.status] || "Chưa rõ"}
                    </AdminBadge>
                  </td>
                  <td className="admin-money">{formatVnd(order.totalVnd)}</td>
                  <td>{formatDate(order.plannedDate)}</td>
                  <td>
                    <Link
                      className="text-link"
                      to={`/admin/orders/${order.id}`}
                      aria-label={`Xem đơn ${order.code}`}
                    >
                      Xem ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
          <AdminPager
            page={q.page}
            size={12}
            total={state.data.totalCount}
            change={(page) => q.update("page", String(page))}
          />
        </>
      )}
    </div>
  );
}
