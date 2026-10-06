import { AdminPurchaseList } from "../admin/AdminLists";
import { AdminFeedback } from "../admin/ui";
import { useAdminWrite } from "../admin/useAdminWrite";
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { request } from "../orders/api";
import {
  useData,
  Load,
  Pager,
  failure,
  time,
  labels,
  common,
  type Profile,
  type Page,
} from "./shared";
import type { Car, CarListResponse } from "../../entities/car/model";
export type Dealer = {
  dealerId: number;
  name: string;
  supportedBrands: string[];
};
type Event = { at: string; action: string; detail: string };
export type Purchase = {
  id: string;
  code: string;
  customerId: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  orderId: string | null;
  details: {
    carId: string;
    carName: string;
    brand: string;
    dealerId: number;
    dealerName: string;
    variant: string | null;
    customerName: string;
    email: string;
    phone: string;
    contactMethod: string;
    notes: string;
    history: Event[];
  };
};
export function CatalogueForm({
  initial,
  onSubmit,
  busy,
  button = "Gửi yêu cầu",
}: {
  initial?: Purchase["details"];
  onSubmit: (body: unknown) => Promise<void>;
  busy: boolean;
  button?: string;
}) {
  const [cars, setCars] = useState<Car[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [params] = useSearchParams();
  const [carId, setCarId] = useState(
    initial?.carId || params.get("carId") || "",
  );
  const [dealerId, setDealerId] = useState(initial?.dealerId.toString() || "");
  useEffect(() => {
    let active = true;
    Promise.all([
      common<CarListResponse>(
        "/api/cars?limit=100&query=" + encodeURIComponent(query),
      ).then(async (list) => {
        const target = initial?.carId || params.get("carId");
        if (target && !list.items.some((c) => c.carId === target))
          list.items.unshift(
            await common<Car>("/api/cars/" + encodeURIComponent(target)),
          );
        return list;
      }),
      common<{ items: Dealer[] }>("/api/dealers"),
      request<Profile>("/my/profile"),
    ])
      .then(([c, d, p]) => {
        if (active) {
          setCars(c.items);
          setDealers(d.items);
          setProfile(p);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(failure(e));
      });
    return () => {
      active = false;
    };
  }, [retry, query]);
  const selected = cars.find((c) => c.carId === carId);
  const supported = dealers.filter((d) =>
    d.supportedBrands.some(
      (b) => b.toLowerCase() === selected?.brand.toLowerCase(),
    ),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await onSubmit({
      carId,
      dealerId: Number(dealerId),
      variant: f.get("variant") || null,
      phone: f.get("phone"),
      contactMethod: f.get("contact"),
      notes: f.get("notes"),
    });
  }
  if (!profile)
    return <Load error={error} retry={() => setRetry((v) => v + 1)} />;
  return (
    <form className="orders-form" onSubmit={submit}>
      <p>
        Giá catalogue chỉ tham khảo. Yêu cầu chưa giữ xe, chưa xác nhận giá và
        chưa thu tiền.
      </p>
      {error && (
        <p role="alert" className="orders-error">
          {error}
        </p>
      )}
      <label>
        Tìm xe
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập hãng hoặc tên xe"
        />
      </label>
      <label>
        Xe mong muốn
        <select
          value={carId}
          onChange={(e) => {
            setCarId(e.target.value);
            setDealerId("");
          }}
          required
        >
          <option value="">Chọn xe</option>
          {cars.map((c) => (
            <option key={c.carId} value={c.carId}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Đại lý hỗ trợ hãng xe
        <select
          value={dealerId}
          onChange={(e) => setDealerId(e.target.value)}
          required
        >
          <option value="">Chọn đại lý</option>
          {supported.map((d) => (
            <option key={d.dealerId} value={d.dealerId}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Phiên bản mong muốn
        <input
          name="variant"
          defaultValue={initial?.variant || ""}
          maxLength={150}
        />
      </label>
      <p>
        Liên hệ: {profile.displayName} · {profile.email}
      </p>
      <label>
        Số điện thoại
        <input
          name="phone"
          type="tel"
          defaultValue={initial?.phone || profile.phone || ""}
          required
          maxLength={30}
        />
      </label>
      <label>
        Cách liên hệ
        <select name="contact" defaultValue={initial?.contactMethod || "phone"}>
          <option value="phone">Điện thoại</option>
          <option value="email">Email</option>
        </select>
      </label>
      <label>
        Ghi chú
        <textarea
          name="notes"
          rows={4}
          maxLength={1000}
          defaultValue={initial?.notes || ""}
        />
      </label>
      <button className="button" disabled={busy || !carId || !dealerId}>
        {button}
      </button>
    </form>
  );
}
export function PurchaseList({ admin = false }: { admin?: boolean }) {
  return admin ? <AdminPurchaseList /> : <CustomerPurchaseList />;
}
function CustomerPurchaseList() {
  const admin = false;
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const prefix = admin ? "/admin" : "/my";
  const state = useData<Page<Purchase>>(
    `${prefix}/purchase-requests?page=${page}&status=${status}&query=${encodeURIComponent(query)}`,
  );
  const base = admin
    ? "/admin/purchase-requests"
    : "/account/purchase-requests";
  return (
    <div className="page">
      <h1>{admin ? "Xử lý yêu cầu mua xe" : "Yêu cầu mua xe của tôi"}</h1>
      {!admin && (
        <Link className="button" to={base + "/new"}>
          + Gửi yêu cầu mua xe
        </Link>
      )}
      <div className="orders-filters">
        <label>
          Tìm mã yêu cầu
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Trạng thái
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {[
              "submitted",
              "in_consultation",
              "converted",
              "rejected",
              "withdrawn",
            ].map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          <div className="orders-grid">
            {state.data.items.map((r) => (
              <Link
                className="content-panel order-card"
                key={r.id}
                to={base + "/" + r.id}
              >
                <strong>{r.code}</strong>
                <h2>{r.details.carName}</h2>
                <p>{labels[r.status]}</p>
                <small>
                  {r.details.dealerName}
                  {admin ? " · " + r.details.customerName : ""}
                </small>
                <small>{time(r.createdAt)}</small>
              </Link>
            ))}
          </div>
          {state.data.items.length === 0 && <p>Chưa có yêu cầu phù hợp.</p>}
          <Pager page={page} total={state.data.totalCount} setPage={setPage} />
        </>
      )}
    </div>
  );
}
export function NewPurchasePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const item = await request<Purchase>(
        "/my/purchase-requests",
        "POST",
        body,
      );
      navigate("/account/purchase-requests/" + item.id);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <Link to="/account/purchase-requests">← Danh sách yêu cầu</Link>
      <h1>Gửi yêu cầu mua xe</h1>
      <section className="content-panel">
        <CatalogueForm onSubmit={save} busy={busy} />
        {error && (
          <p role="alert" className="orders-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
export function PurchaseDetail({ admin = false }: { admin?: boolean }) {
  const { id } = useParams();
  return <PurchaseDetailContent key={id} admin={admin} />;
}
function PurchaseDetailContent({ admin }: { admin: boolean }) {
  const { id } = useParams();
  const prefix = admin ? "/admin" : "/my";
  const url = prefix + "/purchase-requests/" + id;
  const state = useData<Purchase>(url);
  const [customerBusy, setBusy] = useState(false);
  const write = useAdminWrite();
  const busy = admin ? write.disabled : customerBusy;
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  async function act(action: string, body: Record<string, unknown>) {
    if (!state.data) return;
    if (admin) {
      await write.run(async () =>
        state.setData(
          await request<Purchase>(
            url + (action ? "/" + action : ""),
            action ? "POST" : "PATCH",
            { ...body, version: state.data!.version },
          ),
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      state.setData(
        await request(
          url + (action ? "/" + action : ""),
          action ? "POST" : "PATCH",
          { ...body, version: state.data.version },
        ),
      );
      setEditing(false);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  const r = state.data;
  return (
    <div className="page">
      <Link
        to={admin ? "/admin/purchase-requests" : "/account/purchase-requests"}
      >
        ← Danh sách yêu cầu
      </Link>
      {!r ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          <h1>
            {r.code} · {r.details.carName}
          </h1>
          <p>
            {labels[r.status]} · {r.details.dealerName}
          </p>
          <button
            className="mini-button"
            disabled={write.busy}
            onClick={
              admin
                ? () =>
                    void write.refresh(async () =>
                      state.setData(await request<Purchase>(url)),
                    )
                : state.reload
            }
          >
            Tải lại dữ liệu
          </button>
          {error && (
            <p role="alert" className="orders-error">
              {error}
            </p>
          )}
          <div className="orders-detail-grid">
            <section className="content-panel">
              <h2>{admin ? "Thông tin liên hệ" : "Thông tin yêu cầu"}</h2>
              <p>
                {r.details.customerName} · {r.details.email}
              </p>
              <p>
                {r.details.phone} · Liên hệ qua{" "}
                {r.details.contactMethod === "phone" ? "điện thoại" : "email"}
              </p>
              {admin && <h3>Nhu cầu xe</h3>}
              <p>Phiên bản: {r.details.variant || "Chưa chọn"}</p>
              <p>{r.details.notes || "Không có ghi chú"}</p>
              <p>Đây là nhu cầu tư vấn; chỉ đơn chính thức mới có giá chốt.</p>
              {r.orderId && (
                <Link
                  className="button"
                  to={
                    (admin ? "/admin/orders/" : "/account/orders/") + r.orderId
                  }
                >
                  Mở đơn chính thức
                </Link>
              )}
              {!admin && r.status === "submitted" && (
                <button
                  className="mini-button"
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? "Đóng form sửa" : "Sửa yêu cầu"}
                </button>
              )}
            </section>
            <section className="content-panel">
              <h2>Lịch sử và phản hồi</h2>
              <ol className="orders-timeline">
                {[...r.details.history].reverse().map((event, i) => (
                  <li key={i}>
                    <small>{time(event.at)}</small>
                    <p>{event.detail}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {editing && !admin && r.status === "submitted" && (
            <section className="content-panel orders-section">
              <CatalogueForm
                initial={r.details}
                busy={busy}
                button="Lưu yêu cầu"
                onSubmit={(body) => act("", body as Record<string, unknown>)}
              />
            </section>
          )}
          {!admin && r.status === "submitted" && (
            <section className="content-panel orders-section">
              <h2>Rút yêu cầu</h2>
              <ActionForm
                label="Rút yêu cầu"
                busy={busy}
                submit={(reason) => act("withdraw", { reason })}
              />
            </section>
          )}
          {admin && ["submitted", "in_consultation"].includes(r.status) && (
            <section className="content-panel orders-section">
              <h2>Xử lý yêu cầu</h2>
              <AdminFeedback error={write.error} success={write.success} />
              {r.status === "submitted" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act("accept", {})}
                >
                  Tiếp nhận tư vấn
                </button>
              )}
              {r.status === "in_consultation" && (
                <>
                  <h3>Phản hồi khách hàng</h3>
                  <ActionForm
                    label="Gửi phản hồi"
                    busy={busy}
                    submit={(reason) => act("responses", { reason })}
                  />
                  <details>
                    <summary>Chuyển thành đơn chính thức</summary>
                    <form
                      className="orders-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void act("convert", {
                          totalVnd: Number(f.get("total")),
                          depositRequiredVnd: Number(f.get("deposit")),
                          variant: f.get("variant") || null,
                          reason: f.get("reason"),
                        });
                      }}
                    >
                      <label>
                        Giá chốt VND
                        <input
                          name="total"
                          type="number"
                          min={1}
                          max={100000000000}
                          step={1}
                          required
                        />
                      </label>
                      <label>
                        Cọc yêu cầu VND
                        <input
                          name="deposit"
                          type="number"
                          min={0}
                          step={1}
                          required
                        />
                      </label>
                      <label>
                        Phiên bản xác nhận
                        <input
                          name="variant"
                          maxLength={150}
                          defaultValue={r.details.variant || ""}
                        />
                      </label>
                      <label>
                        Nội dung đã thống nhất với khách
                        <input name="reason" required maxLength={1000} />
                      </label>
                      <button className="button" disabled={busy}>
                        Tạo đơn chính thức
                      </button>
                    </form>
                  </details>
                </>
              )}
              <h3>Từ chối yêu cầu</h3>
              <ActionForm
                label="Từ chối"
                busy={busy}
                submit={(reason) => act("reject", { reason })}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
export function ActionForm({
  label,
  busy,
  submit,
}: {
  label: string;
  busy: boolean;
  submit: (reason: string) => Promise<void>;
}) {
  return (
    <form
      className="orders-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(String(new FormData(e.currentTarget).get("reason")));
      }}
    >
      <label>
        Lý do / nội dung phản hồi
        <textarea name="reason" maxLength={1000} rows={3} required />
      </label>
      <button className="button secondary" disabled={busy}>
        {label}
      </button>
    </form>
  );
}
