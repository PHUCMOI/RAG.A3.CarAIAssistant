import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { request } from "../orders/api";
import { useOrdersSession } from "../orders/Session";
import {
  useData,
  Load,
  Pager,
  failure,
  time,
  links,
  type Profile,
  type Page,
} from "./shared";
export function AccountHome() {
  const { user } = useOrdersSession();
  const count = useData<{ count: number }>("/my/notifications/unread-count");
  return (
    <div className="page">
      <h1>Tài khoản của {user?.displayName}</h1>
      <p>Theo dõi nhu cầu mua xe và giao dịch của bạn.</p>
      {count.data && <p>{count.data.count} thông báo chưa đọc</p>}
      <div className="orders-grid">
        {links.slice(1).map(([to, name]) => (
          <Link className="content-panel order-card" key={to} to={to}>
            <h2>{name}</h2>
            <span>Mở →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
export function ProfilePage() {
  const { data, setData, error, setError, reload } =
    useData<Profile>("/my/profile");
  const { refresh } = useOrdersSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setSuccess("");
    setError("");
    try {
      setData(
        await request("/my/profile", "PATCH", {
          version: data.version,
          displayName: form.get("name"),
          phone: form.get("phone"),
        }),
      );
      await refresh();
      setSuccess("Đã lưu thông tin cá nhân.");
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await request("/auth/logout", "POST");
      await refresh();
      navigate("/login", { replace: true });
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <h1>Thông tin cá nhân</h1>
      {!data ? (
        <Load error={error} retry={reload} />
      ) : (
        <section className="content-panel">
          <p>Email đăng nhập: {data.email}</p>
          <p>
            {data.createdAtEstimated
              ? "Ngày ghi nhận tài khoản (migration)"
              : "Ngày tạo tài khoản"}
            : {time(data.createdAt)}
          </p>
          <p>Số điện thoại: {data.phone || "Chưa cập nhật"}</p>
          <form className="orders-form" onSubmit={save}>
            <label>
              Họ tên
              <input
                name="name"
                defaultValue={data.displayName}
                maxLength={100}
                required
              />
            </label>
            <label>
              Số điện thoại
              <input
                name="phone"
                type="tel"
                defaultValue={data.phone || ""}
                placeholder="0901234567 hoặc +84901234567"
              />
            </label>
            <button className="button" disabled={busy}>
              Lưu thông tin
            </button>
          </form>
          {error && (
            <p className="orders-error" role="alert">
              {error}
            </p>
          )}
          {success && <p role="status">{success}</p>}
          <button className="mini-button" disabled={busy} onClick={reload}>Tải lại thông tin</button>
          <button
            className="mini-button"
            disabled={busy}
            onClick={() => void logout()}
          >
            Đăng xuất
          </button>
        </section>
      )}
    </div>
  );
}
export function SecurityPage() {
  const { refresh } = useOrdersSession();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      await request("/my/password", "POST", {
        currentPassword: form.get("current"),
        newPassword: form.get("next"),
        confirmPassword: form.get("confirm"),
      });
      await refresh();
      navigate("/login?passwordChanged=1", { replace: true });
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <h1>Đổi mật khẩu</h1>
      <section className="content-panel">
        <p>
          Sau khi đổi, mọi phiên đăng nhập cũ sẽ kết thúc. Bạn cần đăng nhập
          lại.
        </p>
        <form className="orders-form" onSubmit={submit}>
          <label>
            Mật khẩu hiện tại
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
            />
          </label>
          <label>
            Mật khẩu mới
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            Xác nhận mật khẩu mới
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <button className="button" disabled={busy}>
            Đổi mật khẩu
          </button>
        </form>
        {error && (
          <p role="alert" className="orders-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
type Notice = {
  id: string;
  title: string;
  detailUrl: string;
  createdAt: string;
  readAt: string | null;
};
export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const state = useData<Page<Notice>>("/my/notifications?page=" + page);
  const [busy, setBusy] = useState("");
  async function read(id: string) {
    setBusy(id);
    try {
      await request("/my/notifications/" + id + "/read", "POST");
      state.reload();
    } catch (e) {
      state.setError(failure(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="page">
      <h1>Thông báo</h1>
      {state.error && state.data && <p role="alert">{state.error}</p>}
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          {state.data.items.length === 0 && <p>Chưa có thông báo.</p>}
          {state.data.items.map((n) => (
            <section className="content-panel account-list-row" key={n.id}>
              <strong>{n.title}</strong>
              <small>
                {time(n.createdAt)} · {n.readAt ? "Đã đọc" : "Chưa đọc"}
              </small>
              <Link to={n.detailUrl}>Xem chi tiết →</Link>
              {!n.readAt && (
                <button
                  className="mini-button"
                  disabled={!!busy}
                  onClick={() => void read(n.id)}
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </section>
          ))}
          <Pager page={page} total={state.data.totalCount} setPage={setPage} />
        </>
      )}
    </div>
  );
}
