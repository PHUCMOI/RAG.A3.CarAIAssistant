import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import type { Car, CarListResponse } from "../../entities/car/model";
import { formatVnd } from "../../shared/formatting/currency";
import { formatDate } from "../../shared/formatting/date";
import { ErrorState } from "../../shared/components/ErrorState";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
import { request, statuses, type Order, type Page, type User } from "./api";
import { useOrdersSession } from "./Session";
import { OrderEvidencePanel } from "./OrderEvidenceCards";

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
      <OrderList admin={admin} />
    </Guard>
  );
}
function CreateOrder() {
  const navigate = useNavigate();
  const [cars, setCars] = useState<Car[]>([]);
  const [dealers, setDealers] = useState<{ dealerId: number; name: string }[]>(
    [],
  );
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/cars?limit=100").then(async (r) => {
        if (!r.ok) throw new Error("Không tải được catalogue");
        return r.json() as Promise<CarListResponse>;
      }),
      fetch("/api/dealers").then(async (r) => {
        if (!r.ok) throw new Error("Không tải được đại lý");
        return r.json();
      }),
      request<User[]>("/admin/customers"),
    ])
      .then(([c, d, u]) => {
        if (active) {
          setCars(c.items);
          setDealers(d.items);
          setCustomers(u);
        }
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
  }, [retry]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const order = await request<Order>("/admin/orders", "POST", {
        customerId: form.get("customerId"),
        carId: form.get("carId"),
        dealerId: Number(form.get("dealerId")),
        totalVnd: money(String(form.get("total"))),
        depositRequiredVnd: money(String(form.get("deposit"))),
        variant: String(form.get("variant") || "") || null,
      });
      navigate("/admin/orders/" + order.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <Link className="back-link" to="/admin/orders">
        ← Đơn hàng
      </Link>
      <div className="content-panel orders-panel">
        <h1>Tạo đơn mua xe</h1>
        <p>
          Giá chốt do admin xác nhận; không tự lấy giá catalogue làm giá giao
          dịch.
        </p>
        {loading ? (
          <LoadingSkeleton />
        ) : !cars.length || !customers.length ? (
          <ErrorState
            message={error || "Cần dữ liệu xe và khách hàng."}
            onRetry={() => setRetry((value) => value + 1)}
          />
        ) : (
          <form className="orders-form" onSubmit={submit}>
            <label>
              Khách hàng
              <select name="customerId" required>
                {customers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} · {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Xe
              <select name="carId" required>
                {cars.map((car) => (
                  <option key={car.carId} value={car.carId}>
                    {car.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Đại lý
              <select name="dealerId" required>
                {dealers.map((dealer) => (
                  <option key={dealer.dealerId} value={dealer.dealerId}>
                    {dealer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Phiên bản đã xác nhận (tùy chọn)
              <input name="variant" maxLength={150} />
            </label>
            <label>
              Giá chốt (VND)
              <input
                name="total"
                type="number"
                min="1"
                max="100000000000"
                step="1"
                required
              />
            </label>
            <label>
              Cọc yêu cầu (nằm trong giá chốt, VND)
              <input
                name="deposit"
                type="number"
                min="0"
                step="1"
                defaultValue="50000000"
                required
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Đang tạo…" : "Tạo đơn"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="orders-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
export function NewOrderPage() {
  return (
    <Guard admin>
      <CreateOrder />
    </Guard>
  );
}
function Customers() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setUsers(await request("/admin/customers"));
      setError("");
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError("");
    try {
      await request("/admin/customers", "POST", {
        displayName: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      });
      element.reset();
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <Link className="back-link" to="/admin/orders">
        ← Đơn hàng
      </Link>
      <h1>Khách hàng</h1>
      <div className="orders-detail-grid">
        <section className="content-panel">
          <h2>Tài khoản khách hàng</h2>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            users.map((user) => (
              <div className="orders-list-row" key={user.id}>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </div>
            ))
          )}
          <button className="mini-button" onClick={() => void load()}>
            Tải lại
          </button>
        </section>
        <section className="content-panel">
          <h2>Tạo khách hàng</h2>
          <form className="orders-form" onSubmit={submit}>
            <label>
              Họ tên
              <input name="name" maxLength={100} required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Mật khẩu demo (ít nhất 12 ký tự)
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="button" disabled={busy}>
              Tạo khách hàng
            </button>
          </form>
          {error && (
            <p role="alert" className="orders-error">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
export function CustomersPage() {
  return (
    <Guard admin>
      <Customers />
    </Guard>
  );
}
function Detail({ admin }: { admin: boolean }) {
  const [paymentPage, setPaymentPage] = useState(1);
  const { orderId } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
        <button className="mini-button" onClick={() => setRetry((v) => v + 1)}>
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
      <div className="orders-detail-grid">
        <section className="content-panel">
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
        <section className="content-panel">
          <h2>Lịch bàn giao</h2>
          <p>
            Dự kiến: <strong>{formatDate(order.plannedDate)}</strong>
          </p>
          <p>Địa điểm: {order.deliveryLocation || "Chưa có thông tin"}</p>
          <p>{order.deliveryScheduleConfirmed && order.deliveryConfirmedAt ? "Lịch đã được đại lý xác nhận" : "Lịch chưa được đại lý xác nhận"}</p>
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
              key={"delivery" + order.version}
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
              <p className="orders-help">Chọn xác nhận cho mỗi lần lưu lịch. Nếu không chọn, lịch được lưu là dự kiến.</p>
              <button className="button" disabled={busy}>
                Lưu lịch bàn giao
              </button>
            </form>
          )}
        </section>
      </div>
      {admin && !ended && (
        <section className="content-panel orders-section">
          <h2>Thông tin chờ dành cho khách</h2>
          <form className="orders-form" key={"progress-note" + order.version} onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void mutate("/progress-note", { version: order.version, customerWaitingReason: form.get("customerWaitingReason") || null, reason: form.get("reason") }, "PUT");
          }}>
            <label>Thông tin chờ hiển thị cho khách (tùy chọn)
              <textarea name="customerWaitingReason" maxLength={500} rows={3} defaultValue={order.customerWaitingReason || ""} />
            </label>
            <p className="orders-help">Chỉ nhập nội dung được phép gửi cho khách. Để trống để xóa; nội dung được xóa khi chuyển trạng thái.</p>
            <label>Lý do cập nhật thông tin chờ (ghi nhận nội bộ)
              <input name="reason" maxLength={500} required />
            </label>
            <button className="button" disabled={busy}>Lưu thông tin chờ</button>
          </form>
        </section>
      )}
      {admin && !ended && (
        <section className="content-panel orders-section">
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
          <section className="content-panel orders-section">
            <h2>Sửa giá chốt draft</h2>
            <form
              className="orders-form orders-inline-form"
              key={"draft" + order.version}
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
      <OrderEvidencePanel orderId={order.id} admin={admin} version={order.version} />
      <section className="content-panel orders-section">
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
              {order.payments.slice((paymentPage - 1) * 20, paymentPage * 20).map((payment) => (
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
        {order.payments.length > 20 && <div className="orders-toolbar"><button className="mini-button" disabled={paymentPage === 1} onClick={() => setPaymentPage(p => p - 1)}>Trang trước</button><span>Trang {paymentPage}</span><button className="mini-button" disabled={paymentPage * 20 >= order.payments.length} onClick={() => setPaymentPage(p => p + 1)}>Trang sau</button></div>}
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
      <section className="content-panel orders-section">
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
  return (
    <Guard admin={admin}>
      <Detail admin={admin} />
    </Guard>
  );
}
