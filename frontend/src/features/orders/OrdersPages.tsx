import { AdminBadge, AdminFeedback } from "../admin/ui";
import { useAdminWrite } from "../admin/useAdminWrite";
import { AdminEvidence } from "../admin/AdminEvidence";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { formatVnd } from "../../shared/formatting/currency";
import { formatDate } from "../../shared/formatting/date";
import { ErrorState } from "../../shared/components/ErrorState";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
import { request, statuses, type Order, type Page } from "./api";
import { useOrdersSession } from "./Session";
import { OrderEvidencePanel } from "./OrderEvidenceCards";
import { AdminCreateOrder } from "../admin/AdminCreateOrder";
import { AdminCustomers } from "../admin/AdminLists";
import { AdminOrdersList } from "../admin/AdminOrdersList";

function message(err: unknown) {
  return err instanceof Error ? err.message : "Không thể xử lý yêu cầu.";
}
function money(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error("Nhập số tiền nguyên VND hợp lệ.");
  return number;
}
function Guard({
  admin = false,
  children,
}: {
  admin?: boolean;
  children: ReactNode;
}) {
  const { user, loading, error, refresh } = useOrdersSession();
  if (loading)
    return (
      <div className="page">
        <LoadingSkeleton />
      </div>
    );
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void refresh()} />
      </div>
    );
  if (!user)
    return (
      <div className="page narrow">
        <div className="state-card">
          <h1>Đăng nhập để xem đơn</h1>
          <Link className="button" to={admin ? "/admin/login" : "/login"}>
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  if (user.role !== (admin ? "Admin" : "Customer"))
    return (
      <Navigate
        to={user.role === "Admin" ? "/admin/orders" : "/account/orders"}
        replace
      />
    );
  return <>{children}</>;
}
export { LoginPage } from "./LoginPage";
function OrderList({ admin }: { admin: boolean }) {
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [delayed, setDelayed] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const prefix = admin ? "/admin" : "/my";
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    request<Page>(
      `${prefix}/orders?page=${page}&pageSize=12&status=${encodeURIComponent(status)}&query=${encodeURIComponent(query)}&delayed=${delayed}`,
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(message(err));
      });
    return () => {
      active = false;
    };
  }, [prefix, page, status, query, delayed, retry]);
  return (
    <div className="page">
      <div className="page-heading">
        <span className="section-kicker">
          {admin ? "Vận hành giao dịch" : "Hồ sơ mua xe"}
        </span>
        <h1>{admin ? "Quản lý đơn hàng" : "Đơn mua xe của tôi"}</h1>
        <p>Theo dõi thanh toán, tiến độ và lịch bàn giao.</p>
      </div>
      <div className="orders-toolbar">
        {!admin && (
          <Link className="button" to="/account/assistant">
            Hỏi về đơn hàng
          </Link>
        )}
        <Link
          className="button secondary"
          to={admin ? "/admin/login" : "/login"}
        >
          Tài khoản
        </Link>
        {admin && (
          <>
            <Link className="button" to="/admin/orders/new">
              + Tạo đơn
            </Link>
            <Link className="button secondary" to="/admin/customers">
              Khách hàng
            </Link>
          </>
        )}
      </div>
      <div className="orders-filters">
        <label>
          Tìm mã đơn
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="AW-DEMO-0001"
          />
        </label>
        <label>
          Trạng thái
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={delayed}
              onChange={(e) => {
                setDelayed(e.target.checked);
                setPage(1);
              }}
              style={{ width: "auto" }}
            />{" "}
            Chỉ đơn chậm bàn giao
          </span>
        </label>
      </div>
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      ) : !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          <p>{data.totalCount} đơn</p>
          <div className="orders-grid">
            {data.items.map((order) => (
              <Link
                className="content-panel order-card"
                to={`${admin ? "/admin/orders" : "/account/orders"}/${order.id}`}
                key={order.id}
              >
                <span className="section-kicker">{order.code}</span>
                <h2>{order.carName}</h2>
                <p>{statuses[order.status]}</p>
                <strong>{formatVnd(order.totalVnd)}</strong>
                <small>
                  {admin ? order.customerName + " · " : ""}
                  {order.dealerName}
                </small>
                <small>Lịch giao: {formatDate(order.plannedDate)}</small>
              </Link>
            ))}
          </div>
          {!data.items.length && (
            <p className="state-card">Không có đơn phù hợp.</p>
          )}
          <div className="orders-toolbar">
            <button
              className="mini-button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Trang trước
            </button>
            <span>Trang {page}</span>
            <button
              className="mini-button"
              disabled={page * 12 >= data.totalCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </div>
  );
}
export function OrdersPage({ admin = false }: { admin?: boolean }) {
  return (
    <Guard admin={admin}>
      {admin ? <AdminOrdersList /> : <OrderList admin={false} />}
    </Guard>
  );
}
export function NewOrderPage() {
  return (
    <Guard admin>
      <AdminCreateOrder />
    </Guard>
  );
}
export function CustomersPage() {
  return (
    <Guard admin>
      <AdminCustomers />
    </Guard>
  );
}
function Detail({ admin }: { admin: boolean }) {
  const [paymentPage, setPaymentPage] = useState(1);
  const { orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [customerBusy, setBusy] = useState(false);
  const write = useAdminWrite();
  const busy = admin ? write.disabled : customerBusy;
  const [params, setParams] = useSearchParams();
  const tabs = {
    overview: "Tổng quan",
    payments: "Thanh toán",
    delivery: "Bàn giao",
    documents: "Hồ sơ",
    history: "Lịch sử",
  };
  const tab = Object.hasOwn(tabs, params.get("tab") || "")
    ? params.get("tab")!
    : "overview";
  function changeTab(value: string) {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next);
  }
  const [retry, setRetry] = useState(0);
  const base = `${admin ? "/admin" : "/my"}/orders/${orderId}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setOrder(null);
    setError("");
    request<Order>(base)
      .then((value) => {
        if (active) setOrder(value);
      })
      .catch((err) => {
        if (active) setError(message(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, retry]);
  async function mutate(path: string, body: unknown, method = "POST") {
    if (admin) {
      await write.run(async () =>
        setOrder(await request<Order>(base + path, method, body)),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      setOrder(await request<Order>(base + path, method, body));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      void mutate("/payments", {
        version: order!.version,
        type: form.get("type"),
        amountVnd: money(String(form.get("amount"))),
        reference: form.get("reference"),
        originalReceiptId: form.get("receipt") || null,
      });
    } catch (err) {
      setError(message(err));
    }
  }
  function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const actual = String(form.get("actual") || "");
    void mutate(
      "/delivery",
      {
        version: order!.version,
        plannedDate: form.get("planned"),
        actualHandoverAt: actual ? new Date(actual).toISOString() : null,
        location: form.get("location"),
        reason: form.get("reason"),
        confirmed: form.get("confirmed") === "on",
      },
      "PUT",
    );
  }
  if (loading)
    return (
      <div className="page">
        <LoadingSkeleton />
      </div>
    );
  if (!order)
    return (
      <div className="page">
        <ErrorState
          message={error || "Không tìm thấy đơn."}
          onRetry={() => setRetry((v) => v + 1)}
        />
        <Link to={admin ? "/admin/orders" : "/account/orders"}>
          Quay lại danh sách
        </Link>
      </div>
    );
  const ended = ["completed", "cancelled"].includes(order.status);
  const next: Record<string, string> = {
    pending_confirmation: "confirmed",
    confirmed: "preparing_vehicle",
    preparing_vehicle: "ready_for_handover",
    ready_for_handover: "completed",
  };
  return (
    <div className="page">
      <Link
        className="back-link"
        to={admin ? "/admin/orders" : "/account/orders"}
      >
        ← Danh sách đơn
      </Link>
      <div className="page-heading">
        <span className="section-kicker">{order.code}</span>
        <h1>{order.carName}</h1>
        <p>
          {statuses[order.status]} · {order.dealerName}
        </p>
      </div>
      <div className="orders-toolbar">
        <button
          className="mini-button"
          disabled={write.busy}
          onClick={
            admin
              ? () =>
                  void write.refresh(async () =>
                    setOrder(await request<Order>(base)),
                  )
              : () => setRetry((v) => v + 1)
          }
        >
          Tải lại
        </button>
        <span>Phiên bản {order.version}</span>
        {!admin && !["completed", "cancelled"].includes(order.status) && (
          <Link
            className="button secondary"
            to={"/account/change-requests?orderId=" + order.id}
          >
            Đề nghị thay đổi / hủy đơn
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="orders-error">
          {error}
        </p>
      )}
      {admin && (
        <>
          <div className="admin-order-summary">
            <div>
              <small>Khách hàng · {order.code}</small>
              <strong>{order.customerName}</strong>
              <AdminBadge value={order.status}>
                {statuses[order.status]}
              </AdminBadge>
            </div>
            <div>
              <small>Giá chốt</small>
              <strong>{formatVnd(order.totalVnd)}</strong>
            </div>
            <div>
              <small>Đã thu ròng</small>
              <strong>{formatVnd(order.netReceived)}</strong>
            </div>
            <div>
              <small>
                {order.status === "cancelled"
                  ? "Đang giữ sau hủy"
                  : "Còn phải thu"}
              </small>
              <strong>
                {formatVnd(
                  order.status === "cancelled"
                    ? order.netReceived
                    : order.remainingVnd,
                )}
              </strong>
            </div>
          </div>
          <nav
            className="admin-tabs"
            role="tablist"
            aria-label="Chi tiết đơn"
            onKeyDown={(e) => {
              const values = Object.keys(tabs);
              const i = values.indexOf(tab);
              const index =
                e.key === "ArrowRight"
                  ? (i + 1) % values.length
                  : e.key === "ArrowLeft"
                    ? (i + values.length - 1) % values.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? values.length - 1
                        : -1;
              if (index >= 0) {
                e.preventDefault();
                changeTab(values[index]);
                e.currentTarget
                  .querySelectorAll<HTMLButtonElement>("button")
                  [index].focus();
              }
            }}
          >
            {Object.entries(tabs).map(([value, label]) => (
              <button
                id={"tab-" + value}
                type="button"
                key={value}
                role="tab"
                aria-controls={"panel-" + value}
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => changeTab(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <AdminFeedback error={write.error} success={write.success} />
        </>
      )}
      <div
        className={
          admin ? "orders-detail-grid admin-detail-grid" : "orders-detail-grid"
        }
      >
        <section
          id={admin ? "panel-overview" : undefined}
          role={admin ? "tabpanel" : undefined}
          aria-labelledby={admin ? "tab-overview" : undefined}
          hidden={admin && tab !== "overview"}
          className="content-panel"
        >
          <h2>Thông tin đơn</h2>
          <dl className="orders-metadata">
            <dt>Khách hàng</dt>
            <dd>{order.customerName}</dd>
            <dt>Phiên bản xe</dt>
            <dd>{order.variant || "Chưa xác nhận phiên bản"}</dd>
            <dt>Giá chốt</dt>
            <dd>{formatVnd(order.totalVnd)}</dd>
            <dt>Cọc yêu cầu</dt>
            <dd>{formatVnd(order.depositRequiredVnd)}</dd>
            <dt>Đã thu ròng</dt>
            <dd>{formatVnd(order.netReceived)}</dd>
            <dt>
              {order.status === "cancelled"
                ? "Đang giữ sau hủy"
                : "Còn phải thu"}
            </dt>
            <dd>
              {formatVnd(
                order.status === "cancelled"
                  ? order.netReceived
                  : order.remainingVnd,
              )}
            </dd>
            <dt>Ngày tạo</dt>
            <dd>{formatDate(order.createdAt)}</dd>
          </dl>
          {!admin && (
            <Link
              className="text-link"
              to={`/cars/${encodeURIComponent(order.carId)}`}
            >
              Xem catalogue hiện tại →
            </Link>
          )}
          <p className="orders-help">
            Thông tin trên đơn là snapshot và giá giao dịch đã chốt; catalogue
            có thể thay đổi.
          </p>
        </section>
        <section
          id={admin ? "panel-delivery" : undefined}
          role={admin ? "tabpanel" : undefined}
          aria-labelledby={admin ? "tab-delivery" : undefined}
          hidden={admin && tab !== "delivery"}
          className="content-panel"
        >
          <h2>Lịch bàn giao</h2>
          <p>
            Dự kiến: <strong>{formatDate(order.plannedDate)}</strong>
          </p>
          <p>Địa điểm: {order.deliveryLocation || "Chưa có thông tin"}</p>
          <p>
            {order.deliveryScheduleConfirmed && order.deliveryConfirmedAt
              ? "Lịch đã được đại lý xác nhận"
              : "Lịch chưa được đại lý xác nhận"}
          </p>
          <p>
            Thực tế:{" "}
            {order.actualHandoverAt
              ? new Date(order.actualHandoverAt).toLocaleString("vi-VN")
              : "Chưa ghi nhận bàn giao"}
          </p>
          {admin && !ended && (
            <form
              className="orders-form"
              onSubmit={submitDelivery}
              key={admin ? "delivery" : "delivery" + order.version}
            >
              <label>
                Ngày dự kiến
                <input
                  name="planned"
                  type="date"
                  defaultValue={order.plannedDate || ""}
                  required
                />
              </label>
              <label>
                Địa điểm
                <input
                  name="location"
                  defaultValue={order.deliveryLocation || order.dealerName}
                  maxLength={200}
                  required
                />
              </label>
              {order.status === "ready_for_handover" && (
                <label>
                  Thời điểm bàn giao thực tế (tùy chọn)
                  <input
                    name="actual"
                    type="datetime-local"
                    defaultValue={
                      order.actualHandoverAt
                        ? new Date(
                            new Date(order.actualHandoverAt).getTime() -
                              new Date().getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                  />
                </label>
              )}
              <label>
                Lý do cập nhật
                <input name="reason" maxLength={500} required />
              </label>
              <label>
                <input name="confirmed" type="checkbox" />
                Đại lý xác nhận lịch bàn giao này
              </label>
              <p className="orders-help">
                Chọn xác nhận cho mỗi lần lưu lịch. Nếu không chọn, lịch được
                lưu là dự kiến.
              </p>
              <button className="button" disabled={busy}>
                Lưu lịch bàn giao
              </button>
            </form>
          )}
        </section>
      </div>
      {admin && !ended && (
        <section
          hidden={tab !== "delivery"}
          className="content-panel orders-section"
        >
          <h2>Thông tin chờ dành cho khách</h2>
          <form
            className="orders-form"
            key="progress-note"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void mutate(
                "/progress-note",
                {
                  version: order.version,
                  customerWaitingReason:
                    form.get("customerWaitingReason") || null,
                  reason: form.get("reason"),
                },
                "PUT",
              );
            }}
          >
            <label>
              Thông tin chờ hiển thị cho khách (tùy chọn)
              <textarea
                name="customerWaitingReason"
                maxLength={500}
                rows={3}
                defaultValue={order.customerWaitingReason || ""}
              />
            </label>
            <p className="orders-help">
              Chỉ nhập nội dung được phép gửi cho khách. Để trống để xóa; nội
              dung được xóa khi chuyển trạng thái.
            </p>
            <label>
              Lý do cập nhật thông tin chờ (ghi nhận nội bộ)
              <input name="reason" maxLength={500} required />
            </label>
            <button className="button" disabled={busy}>
              Lưu thông tin chờ
            </button>
          </form>
        </section>
      )}
      {admin && !ended && (
        <section
          hidden={tab !== "overview"}
          className="content-panel orders-section"
        >
          <h2>Cập nhật trạng thái</h2>
          <form
            className="orders-form orders-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void mutate("/transitions", {
                version: order.version,
                status: form.get("status"),
                reason: form.get("reason"),
              });
            }}
          >
            <label>
              Trạng thái tiếp theo
              <select name="status">
                {next[order.status] && (
                  <option value={next[order.status]}>
                    {statuses[next[order.status]]}
                  </option>
                )}
                <option value="cancelled">Hủy đơn (hoàn hết tiền trước)</option>
              </select>
            </label>
            <label>
              Lý do
              <input name="reason" maxLength={500} required />
            </label>
            <button className="button" disabled={busy}>
              Cập nhật
            </button>
          </form>
        </section>
      )}
      {admin &&
        order.status === "pending_confirmation" &&
        !order.payments.some((p) => p.status === "confirmed") && (
          <section
            hidden={tab !== "overview"}
            className="content-panel orders-section"
          >
            <h2>Sửa giá chốt draft</h2>
            <form
              className="orders-form orders-inline-form"
              key="draft"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  void mutate(
                    "",
                    {
                      version: order.version,
                      totalVnd: money(String(form.get("total"))),
                      depositRequiredVnd: money(String(form.get("deposit"))),
                      variant: form.get("variant") || null,
                      reason: form.get("reason"),
                    },
                    "PATCH",
                  );
                } catch (err) {
                  setError(message(err));
                }
              }}
            >
              <label>
                Giá chốt VND
                <input
                  name="total"
                  type="number"
                  defaultValue={order.totalVnd}
                  min="1"
                  step="1"
                  required
                />
              </label>
              <label>
                Cọc yêu cầu VND
                <input
                  name="deposit"
                  type="number"
                  defaultValue={order.depositRequiredVnd}
                  min="0"
                  step="1"
                  required
                />
              </label>
              <label>
                Phiên bản
                <input name="variant" defaultValue={order.variant || ""} />
              </label>
              <label>
                Lý do
                <input name="reason" required />
              </label>
              <button className="button" disabled={busy}>
                Lưu draft
              </button>
            </form>
          </section>
        )}
      {admin ? (
        <AdminEvidence orderId={order.id} version={order.version} tab={tab} />
      ) : (
        <OrderEvidencePanel
          orderId={order.id}
          admin={false}
          version={order.version}
        />
      )}
      <section
        id="panel-payments"
        role={admin ? "tabpanel" : undefined}
        aria-labelledby={admin ? "tab-payments" : undefined}
        hidden={admin && tab !== "payments"}
        className="content-panel orders-section"
      >
        <h2>Giao dịch thanh toán</h2>
        <p className="orders-help">
          Ghi nhận thủ công, không thu tiền trực tuyến. Chỉ giao dịch đã xác
          nhận tính vào số tiền đã thu.
        </p>
        <div className="orders-table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Mã tham chiếu</th>
                <th>Loại</th>
                <th>Số tiền</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {order.payments
                .slice((paymentPage - 1) * 20, paymentPage * 20)
                .map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.reference}</td>
                    <td>
                      {payment.type === "receipt" ? "Thu tiền" : "Hoàn tiền"}
                    </td>
                    <td>{formatVnd(payment.amountVnd)}</td>
                    <td>
                      {
                        {
                          pending: "Chờ xác nhận",
                          confirmed: "Đã xác nhận",
                          failed: "Thất bại",
                        }[payment.status]
                      }
                    </td>
                    <td>
                      {admin && payment.status === "pending" && !ended && (
                        <div className="orders-toolbar">
                          <button
                            className="mini-button"
                            disabled={busy}
                            onClick={() =>
                              void mutate(`/payments/${payment.id}/confirm`, {
                                version: order.version,
                              })
                            }
                          >
                            Xác nhận
                          </button>
                          <button
                            className="mini-button"
                            disabled={busy}
                            onClick={() => {
                              const reason = window.prompt(
                                "Lý do giao dịch thất bại",
                              );
                              if (reason)
                                void mutate(`/payments/${payment.id}/fail`, {
                                  version: order.version,
                                  reason,
                                });
                            }}
                          >
                            Thất bại
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!order.payments.length && <p>Chưa có giao dịch.</p>}
        {order.payments.length > 20 && (
          <div className="orders-toolbar">
            <button
              className="mini-button"
              disabled={paymentPage === 1}
              onClick={() => setPaymentPage((p) => p - 1)}
            >
              Trang trước
            </button>
            <span>Trang {paymentPage}</span>
            <button
              className="mini-button"
              disabled={paymentPage * 20 >= order.payments.length}
              onClick={() => setPaymentPage((p) => p + 1)}
            >
              Trang sau
            </button>
          </div>
        )}
        {admin && !ended && (
          <form
            className="orders-form orders-inline-form"
            onSubmit={submitPayment}
          >
            <label>
              Loại
              <select
                name="type"
                defaultValue={
                  order.status === "completed" ? "refund" : "receipt"
                }
              >
                <option value="receipt" disabled={order.status === "completed"}>
                  Thu tiền
                </option>
                <option value="refund">Hoàn tiền</option>
              </select>
            </label>
            <label>
              Số tiền VND
              <input name="amount" type="number" min="1" step="1" required />
            </label>
            <label>
              Mã tham chiếu
              <input name="reference" maxLength={100} required />
            </label>
            <label>
              Receipt gốc (khi hoàn tiền)
              <select name="receipt">
                <option value="">Không chọn</option>
                {order.payments
                  .filter(
                    (p) => p.type === "receipt" && p.status === "confirmed",
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.reference}
                    </option>
                  ))}
              </select>
            </label>
            <button className="button" disabled={busy}>
              Ghi giao dịch pending
            </button>
          </form>
        )}
      </section>
      <section
        id="panel-history"
        role={admin ? "tabpanel" : undefined}
        aria-labelledby={admin ? "tab-history" : undefined}
        hidden={admin && tab !== "history"}
        className="content-panel orders-section"
      >
        <h2>Lịch sử cập nhật</h2>
        <ol className="orders-timeline">
          {[...order.history]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .map((event, index) => (
              <li key={index}>
                <time>{new Date(event.at).toLocaleString("vi-VN")}</time>
                <strong>
                  {(
                    {
                      created: "Tạo đơn",
                      status: "Cập nhật trạng thái",
                      delivery: "Cập nhật lịch bàn giao",
                      delivery_actual: "Bàn giao thực tế",
                      payment_created: "Ghi nhận giao dịch",
                      payment_confirmed: "Xác nhận giao dịch",
                      payment_failed: "Giao dịch thất bại",
                      draft_updated: "Cập nhật giá chốt",
                      seed_catalogue_corrected: "Cập nhật dữ liệu demo",
                    } as Record<string, string>
                  )[event.action] || "Cập nhật đơn"}
                </strong>
                <p>{event.detail}</p>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}
export function OrderDetailPage({ admin = false }: { admin?: boolean }) {
  const { orderId } = useParams();
  return (
    <Guard admin={admin}>
      <Detail key={orderId} admin={admin} />
    </Guard>
  );
}
