import { useAdminWrite } from "../admin/useAdminWrite";
import { AdminFeedback } from "../admin/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { request } from "./api";
import { formatVnd } from "../../shared/formatting/currency";
type Page<T> = {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
};
type Transaction = {
  id: string;
  reference: string;
  type: string;
  amountVnd: number;
  status: string;
  createdAt: string | null;
  confirmedAt: string | null;
  failureReason: string | null;
  originalReceiptId: string | null;
  documentUrl: string | null;
};
export type PaymentDetails = {
  orderId: string;
  orderStatus: string;
  totalVnd: number;
  depositRequiredVnd: number;
  receivedVnd: number;
  refundedVnd: number;
  netReceived: number;
  remainingVnd: number;
  transactions: Page<Transaction>;
  matchStatus: string;
  reference: string | null;
  date: string | null;
  retrievedAt: string;
};
type Document = {
  id: string;
  name: string;
  required: boolean;
  status: string;
  customerNote: string | null;
  updatedAt: string;
  version: number;
};
export type DocumentDetails = {
  orderId: string;
  checklist: Page<Document>;
  requiredOutstanding: number;
  retrievedAt: string;
};
const docStatuses: Record<string, string> = {
  missing: "Chưa nộp",
  pending: "Chờ kiểm tra",
  valid: "Hợp lệ",
  needs_changes: "Cần bổ sung",
};
const paymentStatuses: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  failed: "Từ chối / thất bại",
};
const at = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "Chưa ghi nhận";
function Pager({
  page,
  total,
  size,
  busy,
  change,
}: {
  page: number;
  total: number;
  size: number;
  busy: boolean;
  change: (page: number) => void;
}) {
  return (
    <div className="orders-toolbar">
      <button
        className="mini-button"
        disabled={busy || page === 1}
        onClick={() => change(page - 1)}
      >
        Trang trước
      </button>
      <span>
        Trang {page} · {total} mục
      </span>
      <button
        className="mini-button"
        disabled={busy || page * size >= total}
        onClick={() => change(page + 1)}
      >
        Trang sau
      </button>
    </div>
  );
}
export function PaymentDetailsCard({
  initial,
  admin = false,
}: {
  initial: PaymentDetails;
  admin?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setData(initial), [initial]);
  async function load(page: number) {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(data.transactions.pageSize),
      });
      if (data.reference) query.set("reference", data.reference);
      if (data.date) query.set("date", data.date);
      setData(
        await request(
          `/${admin ? "admin" : "my"}/orders/${data.orderId}/payment-details?${query}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được giao dịch");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="order-evidence" aria-label="Chi tiết thanh toán">
      <dl className="order-evidence-summary">
        <div>
          <dt>Giá chốt</dt>
          <dd>{formatVnd(data.totalVnd)}</dd>
        </div>
        <div>
          <dt>Cọc yêu cầu (trong giá chốt)</dt>
          <dd>{formatVnd(data.depositRequiredVnd)}</dd>
        </div>
        <div>
          <dt>Đã thu xác nhận</dt>
          <dd>{formatVnd(data.receivedVnd)}</dd>
        </div>
        <div>
          <dt>Đã hoàn xác nhận</dt>
          <dd>{formatVnd(data.refundedVnd)}</dd>
        </div>
        <div>
          <dt>Đã thu ròng</dt>
          <dd>{formatVnd(data.netReceived)}</dd>
        </div>
        <div>
          <dt>
            {data.orderStatus === "cancelled"
              ? "Khoản còn giữ sau hủy"
              : "Còn phải trả"}
          </dt>
          <dd>
            {formatVnd(
              data.orderStatus === "cancelled"
                ? data.netReceived
                : data.remainingVnd,
            )}
          </dd>
        </div>
      </dl>
      <p>
        Chỉ giao dịch đã xác nhận được tính vào số tổng; tổng bao gồm toàn bộ
        giao dịch của đơn.
      </p>
      {data.orderStatus === "cancelled" && (
        <p>Đơn đã hủy. Kiểm tra khoản thu/hoàn thực tế với đại lý.</p>
      )}
      {data.matchStatus === "not_found" && (
        <p>Chưa tìm thấy giao dịch khớp trong dữ liệu đã lưu.</p>
      )}
      {data.matchStatus === "ambiguous" && (
        <p>
          Có nhiều giao dịch khớp. Hãy hỏi bằng “mã giao dịch …” để chọn đúng
          khoản.
        </p>
      )}
      {data.reference && <p>Mã đang lọc: {data.reference}</p>}
      {data.date && <p>Ngày đang lọc (Việt Nam): {data.date}</p>}
      {!data.transactions.totalCount && <p>Chưa có giao dịch phù hợp.</p>}
      <ul className="order-evidence-list">
        {data.transactions.items.map((p) => (
          <li key={p.id}>
            <strong>
              {p.reference} · {p.type === "receipt" ? "Thu tiền" : "Hoàn tiền"}
            </strong>
            <p>
              {formatVnd(p.amountVnd)} ·{" "}
              {paymentStatuses[p.status] || "Chưa rõ trạng thái"}
            </p>
            <small>
              Ghi nhận: {at(p.createdAt)} · Xác nhận: {at(p.confirmedAt)}
            </small>
            {p.failureReason && <p>Lý do: {p.failureReason}</p>}
            {p.originalReceiptId && <p>Receipt gốc: {p.originalReceiptId}</p>}
          </li>
        ))}
      </ul>
      <p>Chưa có chứng từ được lưu/cấp quyền trong hệ thống.</p>
      <small>Tra cứu: {at(data.retrievedAt)}</small>
      {error && <p role="alert">{error}</p>}
      <Pager
        page={data.transactions.pageNumber}
        total={data.transactions.totalCount}
        size={data.transactions.pageSize}
        busy={busy}
        change={(p) => void load(p)}
      />
    </section>
  );
}
function DocumentEditor({
  item,
  busy,
  save,
}: {
  item?: Document;
  busy: boolean;
  save: (id: string, body: object) => Promise<boolean>;
}) {
  const newId = useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    if (
      await save(item?.id || newId.current, {
        version: item?.version || 0,
        name: f.get("name"),
        required: f.get("required") === "on",
        status: f.get("status"),
        customerNote: f.get("note") || null,
      })
    ) {
      if (!item) {
        newId.current = crypto.randomUUID();
        form.reset();
      }
    }
  }
  return (
    <form className="orders-form" onSubmit={(e) => void submit(e)}>
      <label>
        Loại giấy tờ
        <input
          name="name"
          defaultValue={item?.name}
          required
          maxLength={150}
          disabled={busy}
        />
      </label>
      <label>
        <input
          name="required"
          type="checkbox"
          defaultChecked={item?.required}
          disabled={busy}
        />{" "}
        Bắt buộc cho đơn này
      </label>
      <label>
        Trạng thái hồ sơ
        <select
          name="status"
          defaultValue={item?.status || "missing"}
          disabled={busy}
        >
          {Object.entries(docStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ghi chú dành cho khách
        <textarea
          name="note"
          defaultValue={item?.customerNote || ""}
          maxLength={500}
          disabled={busy}
        />
      </label>
      <button className="mini-button" disabled={busy}>
        {item ? "Lưu mục hồ sơ" : "Thêm mục hồ sơ"}
      </button>
    </form>
  );
}
export function DocumentDetailsCard({
  initial,
  admin = false,
}: {
  initial: DocumentDetails;
  admin?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [customerBusy, setBusy] = useState(false);
  const write = useAdminWrite();
  const [stale, setStale] = useState(false);
  const busy = admin ? write.disabled || stale : customerBusy;
  const [error, setError] = useState("");
  useEffect(() => setData(initial), [initial]);
  const base = `/${admin ? "admin" : "my"}/orders/${data.orderId}/documents`;
  async function load(page: number) {
    if (admin) {
      await write.refresh(async () => {
        setData(
          await request(
            `${base}?page=${page}&pageSize=${data.checklist.pageSize}`,
          ),
        );
        setStale(false);
        setError("");
      });
      return;
    }
    setBusy(true);
    setError("");
    try {
      setData(
        await request(
          `${base}?page=${page}&pageSize=${data.checklist.pageSize}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được hồ sơ");
    } finally {
      setBusy(false);
    }
  }
  async function save(id: string, body: object) {
    if (admin)
      return write.run(async () => {
        await request(base + "/" + id, "PUT", body);
        try {
          setData(
            await request(
              `${base}?page=${data.checklist.pageNumber}&pageSize=${data.checklist.pageSize}`,
            ),
          );
          setError("");
        } catch {
          setStale(true);
          setError(
            "Đã lưu hồ sơ, nhưng chưa tải được dữ liệu mới. Tải lại hồ sơ trước khi sửa tiếp.",
          );
        }
      });
    setBusy(true);
    setError("");
    try {
      await request(base + "/" + id, "PUT", body);
      setData(
        await request(
          `${base}?page=${data.checklist.pageNumber}&pageSize=${data.checklist.pageSize}`,
        ),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được hồ sơ");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="order-evidence" aria-label="Checklist hồ sơ">
      {!data.checklist.totalCount ? (
        <p>
          Đại lý chưa cấu hình checklist hồ sơ cho đơn này; chưa có dữ liệu để
          xác định giấy tờ thiếu.
        </p>
      ) : (
        <p>
          {data.requiredOutstanding} giấy tờ bắt buộc chưa hợp lệ (tính toàn bộ
          checklist).
        </p>
      )}
      <ul className="order-evidence-list">
        {data.checklist.items.map((item) => (
          <li key={item.id}>
            <strong>
              {item.name} · {item.required ? "Bắt buộc" : "Tùy chọn"}
            </strong>
            <p>{docStatuses[item.status]}</p>
            {item.customerNote && <p>{item.customerNote}</p>}
            <small>Cập nhật: {at(item.updatedAt)}</small>
            {admin && (
              <details>
                <summary>Sửa mục hồ sơ</summary>
                <DocumentEditor
                  key={admin ? item.id : item.version}
                  item={item}
                  busy={busy}
                  save={save}
                />
              </details>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <>
          <AdminFeedback error={write.error} success={write.success} />
          {(write.conflict || stale) && (
            <button
              className="mini-button"
              disabled={write.busy}
              onClick={() =>
                void write.refresh(async () => {
                  setData(
                    await request(
                      `${base}?page=${data.checklist.pageNumber}&pageSize=${data.checklist.pageSize}`,
                    ),
                  );
                  setStale(false);
                  setError("");
                })
              }
            >
              Tải phiên bản mới
            </button>
          )}
        </>
      )}
      <small>Tra cứu: {at(data.retrievedAt)}</small>
      {error && <p role="alert">{error}</p>}
      <Pager
        page={data.checklist.pageNumber}
        size={data.checklist.pageSize}
        total={data.checklist.totalCount}
        busy={busy}
        change={(p) => void load(p)}
      />
      {admin && (
        <details>
          <summary>Thêm giấy tờ cho đơn này</summary>
          <DocumentEditor busy={busy} save={save} />
        </details>
      )}
    </section>
  );
}
export function OrderEvidencePanel({
  orderId,
  admin,
  version,
}: {
  orderId: string;
  admin: boolean;
  version: number;
}) {
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [documents, setDocuments] = useState<DocumentDetails | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const base = `/${admin ? "admin" : "my"}/orders/${orderId}`;
    setError("");
    Promise.all([
      request<PaymentDetails>(base + "/payment-details"),
      request<DocumentDetails>(base + "/documents"),
    ])
      .then(([p, d]) => {
        if (active) {
          setPayment(p);
          setDocuments(d);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [orderId, admin, version, retry]);
  return (
    <section className="content-panel orders-section">
      <h2>Thanh toán chi tiết và hồ sơ</h2>
      <button className="mini-button" onClick={() => setRetry((v) => v + 1)}>
        Tải lại thanh toán và hồ sơ
      </button>
      {error && <p role="alert">{error}</p>}
      {payment && <PaymentDetailsCard initial={payment} admin={admin} />}
      <h3>Giấy tờ của đơn</h3>
      {documents && <DocumentDetailsCard initial={documents} admin={admin} />}
    </section>
  );
}
