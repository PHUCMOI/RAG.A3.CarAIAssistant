import { AdminSupportList } from "../admin/AdminLists";
import { useAdminWrite } from "../admin/useAdminWrite";
import { AdminFeedback, AdminPager } from "../admin/ui";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SupportContext } from "../orders/SupportContext";
import { request, ApiError } from "../orders/api";
import { useData, Load, Pager, type Page } from "./shared";
const labels: Record<string, string> = {
  new: "Đã tiếp nhận",
  in_progress: "Đang xử lý",
  resolved: "Đã giải quyết",
  closed: "Đã đóng",
};
type Item = {
  id: string;
  code: string;
  subject: string;
  status: string;
  updatedAt: string;
  version: number;
};
type Ticket = Item & {
  summary: string;
  orderId: string | null;
  paymentId: string | null;
  changeRequestId: string | null;
  assignedTo: string | null;
  snapshot: { at: string; topics: string[]; results: string[] }[];
  replies: Page<{
    id: string;
    authorRole: string;
    content: string;
    at: string;
    internal: boolean;
  }>;
};
export function SupportList({ admin = false }: { admin?: boolean }) {
  return admin ? <AdminSupportList /> : <CustomerSupportList />;
}
function CustomerSupportList() {
  const admin = false;
  const [page, setPage] = useState(1);
  const state = useData<Page<Item>>(
    `/${admin ? "admin" : "my"}/support-tickets?page=${page}`,
  );
  return (
    <div className="page">
      <h1>Phiếu hỗ trợ</h1>
      <p>Theo dõi tiếp nhận và phản hồi. Chưa có thời gian xử lý cam kết.</p>
      {!admin && (
        <Link className="button" to="/account/assistant">
          Gửi vấn đề cho nhân viên
        </Link>
      )}
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          {!state.data.items.length && <p>Chưa có phiếu hỗ trợ.</p>}
          {state.data.items.map((t) => (
            <section className="content-panel account-list-row" key={t.id}>
              <Link
                to={`/${admin ? "admin" : "account"}/support-tickets/${t.id}`}
              >
                <strong>
                  {t.code} · {t.subject}
                </strong>
              </Link>
              <p>
                {labels[t.status]} ·{" "}
                {new Date(t.updatedAt).toLocaleString("vi-VN")}
              </p>
            </section>
          ))}
          <Pager page={page} total={state.data.totalCount} setPage={setPage} />
        </>
      )}
    </div>
  );
}
export function SupportDetail({ admin = false }: { admin?: boolean }) {
  const { id } = useParams();
  return <SupportDetailContent key={id} admin={admin} />;
}
function SupportDetailContent({ admin }: { admin: boolean }) {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [customerBusy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const write = useAdminWrite();
  const busy = admin ? write.disabled || fetching : customerBusy;
  const lock = useRef(false);
  const [content, setContent] = useState("");
  const [internal, setInternal] = useState(false);
  const [revision, setRevision] = useState(0);
  const base = `/${admin ? "admin" : "my"}/support-tickets/${id}`;
  const [operation, setOperation] = useState("");
  const pending = useRef<{
    signature: string;
    path: string;
    body: object;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setError("");
    setFetching(true);
    request<Ticket>(`${base}?page=${page}`)
      .then((t) => {
        if (active) setTicket(t);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
    };
  }, [base, page, revision]);
  async function mutate(path: string, body: object) {
    if (lock.current || (admin && busy)) return;
    if (admin) {
      setOperation(path);
      const signature = JSON.stringify({ ...body, version: undefined });
      if (
        !pending.current ||
        pending.current.signature !== signature ||
        pending.current.path !== path
      )
        pending.current = { signature, path, body };
      await write.run(async () => {
        setTicket(
          await request<Ticket>(base + path, "POST", pending.current!.body),
        );
        setPage(1);
        if (path === "/replies") setContent("");
        pending.current = null;
      });
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const signature = JSON.stringify(body);
    if (
      !pending.current ||
      pending.current.signature !== signature ||
      pending.current.path !== path
    )
      pending.current = { signature, path, body };
    try {
      setTicket(await request(base + path, "POST", pending.current.body));
      setPage(1);
      if (path === "/replies") setContent("");
      pending.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được phiếu");
      if (e instanceof ApiError && e.status === 409) {
        pending.current = null;
        setRevision((v) => v + 1);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!ticket)
    return (
      <div className="page">
        <Load error={error} retry={() => setRevision((v) => v + 1)} />
      </div>
    );
  return (
    <div className="page">
      <Link to={`/${admin ? "admin" : "account"}/support-tickets`}>
        ← Phiếu hỗ trợ
      </Link>
      <h1>
        {ticket.code} · {ticket.subject}
      </h1>
      <section className="content-panel">
        <p>
          {labels[ticket.status]} ·{" "}
          {ticket.assignedTo
            ? "Đã có nhân viên tiếp nhận"
            : "Chờ nhân viên tiếp nhận"}
        </p>
        <p>Chưa có thời gian xử lý cam kết.</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{ticket.summary}</p>
        {ticket.orderId && (
          <Link to={`/${admin ? "admin" : "account"}/orders/${ticket.orderId}`}>
            Xem đơn liên quan →
          </Link>
        )}
        {ticket.paymentId && <p>Có giao dịch liên quan; xem tại đơn.</p>}
        {ticket.changeRequestId && (
          <Link
            to={`/${admin ? "admin" : "account"}/change-requests?requestId=${ticket.changeRequestId}`}
          >
            Xem đề nghị liên quan →
          </Link>
        )}
        <SupportContext snapshot={ticket.snapshot} />
        {admin && (
          <>
            <AdminFeedback
              error={operation === "/actions" ? write.error : ""}
              success={operation === "/actions" ? write.success : ""}
            />
            <div className="orders-toolbar">
              {(
                {
                  new: ["accept", "Tiếp nhận phiếu"],
                  in_progress: ["resolve", "Đánh dấu đã giải quyết"],
                  resolved: ["close", "Đóng phiếu"],
                } as Record<string, string[]>
              )[ticket.status] && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate("/actions", {
                      version: ticket.version,
                      action: (
                        {
                          new: "accept",
                          in_progress: "resolve",
                          resolved: "close",
                        } as Record<string, string>
                      )[ticket.status],
                    })
                  }
                >
                  {
                    (
                      {
                        new: "Tiếp nhận phiếu",
                        in_progress: "Đánh dấu đã giải quyết",
                        resolved: "Đóng phiếu",
                      } as Record<string, string>
                    )[ticket.status]
                  }
                </button>
              )}
            </div>
          </>
        )}
      </section>
      <section className="content-panel">
        <h2>Phản hồi</h2>
        {admin && (
          <AdminFeedback
            error={operation !== "/actions" ? write.error : ""}
            success={operation !== "/actions" ? write.success : ""}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="mini-button"
          disabled={admin ? write.busy || fetching : busy}
          onClick={
            admin
              ? () =>
                  void write.refresh(async () => {
                    setTicket(await request<Ticket>(`${base}?page=${page}`));
                    setError("");
                    if (write.conflict) pending.current = null;
                  })
              : () => setRevision((v) => v + 1)
          }
        >
          Tải lại phiếu
        </button>
        {admin && fetching && <Load error="" retry={() => {}} />}
        {(!admin || !fetching) &&
          ticket.replies.items.map((r) => (
            <article
              className={
                admin
                  ? `order-chat-message admin-conversation-message${r.internal ? " internal" : ""}`
                  : "order-chat-message"
              }
              key={r.id}
            >
              <strong>
                {r.authorRole === "Admin" ? "Nhân viên" : "Khách hàng"}
                {r.internal ? " · Ghi chú nội bộ" : ""}
              </strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.content}</p>
              <small>{new Date(r.at).toLocaleString("vi-VN")}</small>
            </article>
          ))}
        {admin ? (
          <AdminPager
            page={ticket.replies.pageNumber}
            size={ticket.replies.pageSize || 20}
            total={ticket.replies.totalCount}
            change={setPage}
            busy={fetching || write.busy}
          />
        ) : (
          <Pager
            page={page}
            total={ticket.replies.totalCount}
            setPage={setPage}
          />
        )}
        {ticket.status !== "closed" ? (
          <form
            className="orders-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate("/replies", {
                version: ticket.version,
                content,
                internal: admin && internal,
              });
            }}
          >
            <label>
              Nội dung phản hồi
              <textarea
                aria-label="Nội dung phản hồi"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={1000}
                required
                disabled={busy}
              />
            </label>
            <p>Không gửi mật khẩu, OTP hoặc khóa truy cập.</p>
            {admin && (
              <label>
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                  disabled={busy}
                />{" "}
                Ghi chú nội bộ (khách không thấy)
              </label>
            )}
            <button className="button" disabled={busy || !content.trim()}>
              Gửi phản hồi
            </button>
            {ticket.status === "resolved" && !admin && (
              <p>Phản hồi mới sẽ mở lại phiếu đang xử lý.</p>
            )}
          </form>
        ) : (
          <p>
            Phiếu đã đóng, không nhận phản hồi mới. Tạo phiếu mới nếu cần hỗ trợ
            thêm.
          </p>
        )}
      </section>
    </div>
  );
}
