import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useOrdersSession } from "./Session";
import { request, ApiError, type Order, type Page } from "./api";
import { ErrorState } from "../../shared/components/ErrorState";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
type Message = {
  role: string;
  content: string;
  at: string;
  tool: string | null;
  orderCode: string | null;
  detailUrl: string | null;
  retrievedAt: string | null;
};
type Session = {
  id: string;
  version: number;
  selectedOrderId: string | null;
  messages: Message[];
};
type SessionItem = { id: string; updatedAt: string };
function Chat() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const newSessionId = useRef<string | null>(null);
  const pending = useRef<{
    sessionId: string;
    requestId: string;
    version: number;
    content: string;
    orderId: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      request<SessionItem[]>("/assistant/sessions"),
      request<Page>("/my/orders?pageSize=100"),
    ])
      .then(([items, page]) => {
        if (active) {
          setSessions(items);
          setOrders(page.items);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<Session>("/assistant/sessions/" + id);
      setSession(result);
      setSelected(result.selectedOrderId || "");
      pending.current = null;
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được hội thoại");
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      newSessionId.current ||= crypto.randomUUID();
      const result = await request<Session>("/assistant/sessions", "POST", {
        id: newSessionId.current,
      });
      newSessionId.current = null;
      setSession(result);
      setSelected("");
      setText("");
      pending.current = null;
      setSessions(await request("/assistant/sessions"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được hội thoại");
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!session || !text.trim() || busy) return;
    setBusy(true);
    setError("");
    if (
      !pending.current ||
      pending.current.sessionId !== session.id ||
      pending.current.content !== text.trim() ||
      pending.current.orderId !== (selected || null)
    )
      pending.current = {
        sessionId: session.id,
        requestId: crypto.randomUUID(),
        version: session.version,
        content: text.trim(),
        orderId: selected || null,
      };
    try {
      const { sessionId, ...body } = pending.current;
      const result = await request<Session>(
        `/assistant/sessions/${sessionId}/messages`,
        "POST",
        body,
      );
      setSession(result);
      setSelected(result.selectedOrderId || "");
      setText("");
      pending.current = null;
      setSessions(await request("/assistant/sessions"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được câu hỏi");
      if (e instanceof ApiError && e.status === 409) {
        pending.current = null;
        try {
          setSession(await request("/assistant/sessions/" + session.id));
        } catch {
          /* keep error and draft */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="page">
        <LoadingSkeleton />
      </div>
    );
  return (
    <div className="page">
      <Link className="back-link" to="/account/orders">
        ← Đơn của tôi
      </Link>
      <div className="page-heading">
        <span className="section-kicker">Hỗ trợ khách hàng</span>
        <h1>Trợ lý đơn hàng</h1>
        <p>
          Tra cứu đơn, thanh toán và lịch bàn giao. Thông tin được lấy khi bạn
          hỏi; trợ lý chỉ đọc dữ liệu.
        </p>
      </div>
      {error && (
        <ErrorState message={error} onRetry={() => setRetry((v) => v + 1)} />
      )}
      <div className="order-chat-layout">
        <aside className="content-panel">
          <button
            className="button"
            disabled={busy}
            onClick={() => void create()}
          >
            + Hội thoại mới
          </button>
          <h2>Hội thoại đã lưu</h2>
          {sessions.length === 0 && <p>Chưa có hội thoại.</p>}
          {sessions.map((item) => (
            <button
              className="order-chat-session mini-button"
              aria-pressed={session?.id === item.id}
              key={item.id}
              disabled={busy}
              onClick={() => void open(item.id)}
            >
              Hội thoại · {new Date(item.updatedAt).toLocaleString("vi-VN")}
            </button>
          ))}
        </aside>
        <section className="content-panel">
          {!session ? (
            <p>Tạo hoặc mở hội thoại để bắt đầu.</p>
          ) : (
            <>
              <label className="orders-form">
                Đơn cần tra cứu
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    pending.current = null;
                  }}
                  disabled={busy}
                >
                  <option value="">Chưa chọn đơn</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.carName}
                    </option>
                  ))}
                </select>
              </label>
              <p className="orders-help">
                Chọn một trong tối đa 100 đơn gần nhất hoặc nhập mã đơn trong
                câu hỏi. Ví dụ: “Tôi còn phải trả bao nhiêu?”, “Khi nào nhận
                xe?”, “Xe được bảo hành thế nào?”.
              </p>
              <div className="order-chat-messages" aria-live="polite">
                {session.messages.map((m, index) => (
                  <article
                    className={"order-chat-message " + m.role}
                    key={index}
                  >
                    <strong>
                      {m.role === "user" ? "Bạn" : "Trợ lý đơn hàng"}
                    </strong>
                    <p>{m.content}</p>
                    {m.retrievedAt && (
                      <small>
                        Tra cứu:{" "}
                        {new Date(m.retrievedAt).toLocaleString("vi-VN")}
                      </small>
                    )}
                    {m.detailUrl && (
                      <Link to={m.detailUrl}>Xem đơn {m.orderCode} →</Link>
                    )}
                  </article>
                ))}
              </div>
              <form className="orders-form" onSubmit={send}>
                <label>
                  Câu hỏi
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    required
                    disabled={busy}
                  />
                </label>
                <button className="button" disabled={busy || !text.trim()}>
                  {busy ? "Đang xử lý…" : "Gửi câu hỏi"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
export default function OrderAssistantPage() {
  const { user, loading, error, refresh } = useOrdersSession();
  if (loading) return <LoadingSkeleton />;
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => void refresh()} />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "Customer") return <Navigate to="/admin/orders" replace />;
  return <Chat />;
}
