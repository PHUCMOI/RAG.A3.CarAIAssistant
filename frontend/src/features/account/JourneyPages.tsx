import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { request, statuses, type Order } from "../orders/api";
import {
  useData,
  Load,
  Pager,
  labels,
  failure,
  time,
  common,
  type Page,
  type Profile,
} from "./shared";
import { ActionForm, type Dealer } from "./PurchasePages";
import type { CarListResponse } from "../../entities/car/model";

type Change = {
  id: string;
  orderId: string;
  type: string;
  reason: string;
  response: string | null;
  status: string;
  version: number;
  createdAt: string;
};
export function ChangeRequestsPage({ admin = false }: { admin?: boolean }) {
  const [page, setPage] = useState(1);
  const state = useData<Page<Change>>(
    (admin ? "/admin" : "/my") + "/change-requests?page=" + page,
  );
  const orders = useData<Page<Order>>(
    admin ? "/admin/orders?pageSize=100" : "/my/orders?pageSize=100",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, "POST", body);
      state.reload();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void mutate("/my/change-requests", {
      orderId: f.get("order"),
      type: f.get("type"),
      reason: f.get("reason"),
    });
  }
  return (
    <div className="page">
      <h1>
        {admin
          ? "Xử lý đề nghị thay đổi / hủy đơn"
          : "Đề nghị thay đổi / hủy đơn"}
      </h1>
      <p>
        Admin phản hồi đề nghị; quyết định duyệt chưa tự sửa trạng thái đơn hoặc
        hoàn tiền. Nhân viên thực hiện nghiệp vụ trên đơn sau khi thống nhất.
      </p>
      {error && (
        <p role="alert" className="orders-error">
          {error}
        </p>
      )}
      {!admin && (
        <section className="content-panel">
          <h2>Gửi đề nghị</h2>
          {!orders.data ? (
            <Load error={orders.error} retry={orders.reload} />
          ) : (
            <form className="orders-form" onSubmit={submit}>
              <label>
                Đơn đang xử lý
                <select
                  name="order"
                  defaultValue={params.get("orderId") || ""}
                  required
                >
                  <option value="">Chọn đơn</option>
                  {orders.data.items
                    .filter(
                      (o) => !["completed", "cancelled"].includes(o.status),
                    )
                    .map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.code} · {o.carName} · {statuses[o.status]}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Loại đề nghị
                <select name="type">
                  <option value="change">Thay đổi</option>
                  <option value="cancel">Hủy đơn</option>
                </select>
              </label>
              <label>
                Lý do
                <textarea name="reason" maxLength={1000} required />
              </label>
              <button className="button" disabled={busy}>
                Gửi đề nghị
              </button>
            </form>
          )}
        </section>
      )}
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          {state.data.items.length === 0 && <p>Chưa có đề nghị.</p>}
          {state.data.items.map((r) => (
            <section className="content-panel account-list-row" key={r.id}>
              <Link
                to={(admin ? "/admin/orders/" : "/account/orders/") + r.orderId}
              >
                Mở đơn liên quan →
              </Link>
              <strong>
                {r.type === "cancel" ? "Đề nghị hủy" : "Đề nghị thay đổi"} ·{" "}
                {labels[r.status]}
              </strong>
              <small>{time(r.createdAt)}</small>
              <p>{r.reason}</p>
              {r.response && <p>Phản hồi: {r.response}</p>}
              {admin && r.status === "pending" && (
                <form
                  className="orders-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void mutate(
                      "/admin/change-requests/" + r.id + "/decision",
                      {
                        version: r.version,
                        decision: f.get("decision"),
                        reason: f.get("reason"),
                      },
                    );
                  }}
                >
                  <label>
                    Quyết định
                    <select name="decision">
                      <option value="approved">Duyệt đề nghị</option>
                      <option value="rejected">Từ chối</option>
                    </select>
                  </label>
                  <label>
                    Phản hồi
                    <textarea name="reason" maxLength={1000} required />
                  </label>
                  <button className="button" disabled={busy}>
                    Lưu phản hồi
                  </button>
                </form>
              )}
            </section>
          ))}
          <Pager page={page} total={state.data.totalCount} setPage={setPage} />
        </>
      )}
    </div>
  );
}
type Favorite = {
  carId: string;
  displayName: string;
  brand: string;
  available: boolean;
  unavailableReason: string | null;
};
export function FavoritesPage() {
  const state = useData<Favorite[]>("/my/favorites");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, method, body);
      setSelected([]);
      state.reload();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <h1>Xe yêu thích</h1>
      <p>
        Lưu xe từ trang chi tiết để xem lại. Thông tin xe luôn lấy từ catalogue
        hiện tại.
      </p>
      <Link className="button" to="/cars">
        Chọn xe từ catalogue →
      </Link>
      {error && (
        <p role="alert" className="orders-error">
          {error}
        </p>
      )}
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          <div className="orders-grid">
            {state.data.map((c) => (
              <section className="content-panel order-card" key={c.carId}>
                <h2>{c.displayName}</h2>
                {c.available ? (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.carId)}
                        disabled={
                          !selected.includes(c.carId) && selected.length >= 3
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.carId]
                              : selected.filter((id) => id !== c.carId),
                          )
                        }
                      />{" "}
                      Chọn so sánh
                    </label>
                    <Link to={"/cars/" + encodeURIComponent(c.carId)}>
                      Thông tin xe
                    </Link>
                    <Link
                      to={
                        "/account/purchase-requests/new?carId=" +
                        encodeURIComponent(c.carId)
                      }
                    >
                      Yêu cầu tư vấn
                    </Link>
                  </>
                ) : (
                  <p>{c.unavailableReason}</p>
                )}
                <button
                  className="mini-button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      "/my/favorites/" + encodeURIComponent(c.carId),
                      "DELETE",
                    )
                  }
                >
                  Bỏ yêu thích
                </button>
              </section>
            ))}
          </div>
          {!state.data.length && <p>Chưa lưu xe yêu thích.</p>}
          {selected.length >= 2 && (
            <Link className="button" to={"/compare?ids=" + selected.join(",")}>
              So sánh {selected.length} xe
            </Link>
          )}
        </>
      )}
    </div>
  );
}
type Slot = {
  id: string;
  dealerId: number;
  dealerName: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
};
type Appointment = {
  id: string;
  customerId: string;
  status: string;
  version: number;
  slot: Slot;
  details: {
    carName: string;
    dealerName: string;
    dealerId: number;
    phone: string;
    kind: string;
    notes: string;
    history: { at: string; detail: string }[];
  };
};
export function AppointmentsPage({ admin = false }: { admin?: boolean }) {
  const prefix = admin ? "/admin" : "/my";
  const [page, setPage] = useState(1);
  const state = useData<Page<Appointment>>(
    prefix + "/appointments?page=" + page,
  );
  const slots = useData<Slot[]>(prefix + "/appointment-slots");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(path, "POST", body);
      state.reload();
      slots.reload();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <h1>
        {admin ? "Quản lý lịch tư vấn / lái thử" : "Lịch tư vấn / lái thử"}
      </h1>
      <p>
        Lịch khách gửi chờ đại lý xác nhận. Lịch thay thế cần khách đồng ý;
        không đặt trùng thời gian.
      </p>
      {error && (
        <p role="alert" className="orders-error">
          {error}
        </p>
      )}
      <section className="content-panel">
        <h2>{admin ? "Mở khung giờ" : "Đặt lịch mới"}</h2>
        <AppointmentForm
          admin={admin}
          slots={slots.data || []}
          busy={busy}
          submit={(body) =>
            mutate(
              prefix + (admin ? "/appointment-slots" : "/appointments"),
              body,
            )
          }
        />
        {!slots.data && <Load error={slots.error} retry={slots.reload} />}
      </section>
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          {!state.data.items.length && <p>Chưa có lịch hẹn.</p>}
          {state.data.items.map((a) => (
            <section className="content-panel account-list-row" key={a.id}>
              <h2>
                {a.details.carName} ·{" "}
                {a.details.kind === "test_drive" ? "Lái thử" : "Tư vấn"}
              </h2>
              <strong>{labels[a.status]}</strong>
              <p>
                {a.slot.dealerName} · {a.slot.staffName}
              </p>
              <p>
                {time(a.slot.startsAt)} – {time(a.slot.endsAt)}
              </p>
              <p>
                {a.details.phone} · {a.details.notes}
              </p>
              {a.details.history.map((h, i) => (
                <small key={i}>
                  {time(h.at)} · {h.detail}
                </small>
              ))}
              {!["rejected", "cancelled"].includes(a.status) &&
                new Date(a.slot.startsAt) > new Date() && (
                  <>
                    <ActionForm
                      label="Hủy lịch"
                      busy={busy}
                      submit={(reason) =>
                        mutate(prefix + "/appointments/" + a.id + "/actions", {
                          version: a.version,
                          action: "cancel",
                          reason,
                        })
                      }
                    />
                    {!admin && a.status === "proposed" && (
                      <ActionForm
                        label="Chấp nhận lịch mới"
                        busy={busy}
                        submit={(reason) =>
                          mutate(
                            prefix + "/appointments/" + a.id + "/actions",
                            { version: a.version, action: "accept", reason },
                          )
                        }
                      />
                    )}
                  </>
                )}
              {admin && ["requested", "proposed"].includes(a.status) && (
                <>
                  <form
                    className="orders-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void mutate(
                        prefix + "/appointments/" + a.id + "/actions",
                        {
                          version: a.version,
                          action: f.get("action"),
                          reason: f.get("reason"),
                          slotId: f.get("slot") || null,
                        },
                      );
                    }}
                  >
                    <label>
                      Thao tác
                      <select name="action">
                        {a.status === "requested" && (
                          <option value="confirm">Xác nhận lịch</option>
                        )}
                        <option value="propose">Đề xuất lịch khác</option>
                        <option value="reject">Từ chối</option>
                      </select>
                    </label>
                    <label>
                      Khung giờ thay thế (khi đề xuất)
                      <select name="slot">
                        <option value="">Chọn khung giờ</option>
                        {slots.data
                          ?.filter((s) => s.dealerId === a.details.dealerId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {time(s.startsAt)} · {s.staffName}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Phản hồi
                      <textarea name="reason" required maxLength={1000} />
                    </label>
                    <button className="button" disabled={busy}>
                      Lưu xử lý
                    </button>
                  </form>
                </>
              )}
            </section>
          ))}
          <Pager page={page} total={state.data.totalCount} setPage={setPage} />
        </>
      )}
    </div>
  );
}
function AppointmentForm({
  admin,
  slots,
  busy,
  submit,
}: {
  admin: boolean;
  slots: Slot[];
  busy: boolean;
  submit: (body: unknown) => Promise<void>;
}) {
  const [catalogue, setCatalogue] = useState<CarListResponse | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [carId, setCarId] = useState("");
  async function load() {
    setError("");
    try {
      const [cars, d] = await Promise.all([
        common<CarListResponse>("/api/cars?limit=100"),
        common<{ items: Dealer[] }>("/api/dealers"),
      ]);
      setCatalogue(cars);
      setDealers(d.items);
      if (!admin) {
        const p = await request<Profile>("/my/profile");
        setPhone(p.phone || "");
      }
      setReady(true);
    } catch (e) {
      setError(failure(e));
    }
  }
  useEffect(() => {
    void load();
  }, [admin]);
  if (!ready)
    return (
      <>
        <button className="mini-button" onClick={() => void load()}>
          Tải xe và đại lý để tạo lịch
        </button>
        {error && <p role="alert">{error}</p>}
      </>
    );
  const car = catalogue?.items.find((c) => c.carId === carId);
  const matching = dealers.filter((d) =>
    d.supportedBrands.some((b) => b.toLowerCase() === car?.brand.toLowerCase()),
  );
  return (
    <form
      className="orders-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit(
          admin
            ? {
                dealerId: Number(f.get("dealer")),
                staffName: f.get("staff"),
                startsAt: new Date(String(f.get("start"))).toISOString(),
                endsAt: new Date(String(f.get("end"))).toISOString(),
              }
            : {
                carId,
                slotId: f.get("slot"),
                kind: f.get("kind"),
                phone,
                notes: f.get("notes"),
              },
        );
      }}
    >
      {admin ? (
        <>
          <label>
            Đại lý
            <select name="dealer" required>
              {dealers.map((d) => (
                <option key={d.dealerId} value={d.dealerId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nhân viên
            <input name="staff" required maxLength={100} />
          </label>
          <label>
            Bắt đầu (giờ địa phương)
            <input name="start" type="datetime-local" required />
          </label>
          <label>
            Kết thúc
            <input name="end" type="datetime-local" required />
          </label>
        </>
      ) : (
        <>
          <label>
            Xe
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              required
            >
              <option value="">Chọn xe</option>
              {catalogue?.items.map((c) => (
                <option key={c.carId} value={c.carId}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Khung giờ còn trống
            <select name="slot" key={carId} required>
              <option value="">Chọn lịch</option>
              {slots
                .filter((s) => matching.some((d) => d.dealerId === s.dealerId))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.dealerName} · {time(s.startsAt)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Loại lịch
            <select name="kind">
              <option value="consultation">Tư vấn</option>
              <option value="test_drive">Lái thử</option>
            </select>
          </label>
          <label>
            Điện thoại
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              maxLength={30}
            />
          </label>
          <label>
            Ghi chú
            <textarea name="notes" maxLength={1000} />
          </label>
        </>
      )}
      <button className="button" disabled={busy}>
        {admin ? "Mở khung giờ" : "Gửi yêu cầu lịch"}
      </button>
    </form>
  );
}
