import { useCarQuestion } from "../chat/useCarQuestion";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useOrdersSession } from "./Session";
import { request, ApiError, type Order, type Page } from "./api";
import { ErrorState } from "../../shared/components/ErrorState";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
import { OrderProgressCard, type OrderProgress } from "./OrderProgressCard";
import { AssistantDraftCard, type Draft } from "./AssistantDraftCard";
import { SupportDraftCard, type SupportDraft } from "./SupportDraftCard";
import { PaymentDetailsCard, DocumentDetailsCard, type PaymentDetails, type DocumentDetails } from "./OrderEvidenceCards";
import { apiPost } from "../../shared/api/client";
import { isOrderQuestion } from "../chat/routing";
type Message = {
  contexts?: { carId: string; displayName: string }[];
  catalog?: boolean;
  role: string;
  content: string;
  at: string;
  tool: string | null;
  orderCode: string | null;
  detailUrl: string | null;
  retrievedAt: string | null;
  sections?: {
    topic: string;
    content: string;
    resultStatus: string;
    retrievedAt: string;
    detailUrl: string | null;
    progress?: OrderProgress | null;
    payment?: PaymentDetails | null;
    documents?: DocumentDetails | null;
  }[] | null;
};
const topicNames: Record<string, string> = {
  status: "Trạng thái", payment: "Thanh toán", delivery: "Bàn giao",
  car: "Thông tin xe", warranty: "Bảo hành", documents: "Hồ sơ",
};
type Session = {
  id: string;
  version: number;
  selectedOrderId: string | null;
  messages: Message[];
  draft?: Draft | null;
  supportSuggested?: boolean;
};
type SessionItem = { id: string; updatedAt: string };
export function UnifiedAssistantChat() {
  const carQuestion = useCarQuestion();
  useEffect(() => { if (carQuestion) setText(current => current || carQuestion); }, [carQuestion]);
  const [mode, setMode] = useState("auto");
  const [orderContext, setOrderContext] = useState(false);
  const [searchParams] = useSearchParams();
  const referencedOrder = searchParams.get("orderId") || "";
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState(() => sessionStorage.getItem("assistant-pending-question") || "");
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
      referencedOrder ? request<Order>("/my/orders/" + encodeURIComponent(referencedOrder)) : Promise.resolve(null),
    ])
      .then(([items, page, reference]) => {
        if (active) {
          setSessions(items);
          setOrders(reference && !page.items.some(o => o.id === reference.id) ? [reference, ...page.items] : page.items);
          if (reference) { setSelected(reference.id); setText("Tiến độ, lịch giao, thanh toán và hồ sơ hiện tại của đơn này?"); }
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
  }, [retry, referencedOrder]);
  function updateSession(result: Session) {
    setSession(current => {
      if (!current || current.id !== result.id) return result;
      let index = 0;
      const messages = current.messages.map(message => message.catalog ? message : result.messages[index++] || message);
      return { ...result, messages: [...messages, ...result.messages.slice(index)] };
    });
  }
  useEffect(() => {
    if (session?.id) sessionStorage.setItem("unified-assistant-" + session.id, JSON.stringify(session.messages));
  }, [session]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<Session>("/assistant/sessions/" + id);
      const cached = sessionStorage.getItem("unified-assistant-" + id);
      let messages = result.messages;
      if (cached) {
        try {
          const saved: Message[] = JSON.parse(cached);
          let index = 0;
          messages = [...saved.map(message => message.catalog ? message : result.messages[index++] || message), ...result.messages.slice(index)];
        } catch { /* use server history */ }
      }
      setSession({ ...result, messages });
      setSelected(result.selectedOrderId || "");
      setOrderContext(true);
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
      setOrderContext(Boolean(referencedOrder));
      setSelected(orders.some(o => o.id === referencedOrder) ? referencedOrder : "");
      setText(referencedOrder && orders.some(o => o.id === referencedOrder) ? "Tiến độ, lịch giao, thanh toán và hồ sơ hiện tại của đơn này?" : "");
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
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    const content = text.trim();
    sessionStorage.removeItem("assistant-pending-question");
    const routeToOrders = mode === "orders" || (mode === "auto" && isOrderQuestion(content, orderContext || Boolean(selected)));
    if (!routeToOrders) {
      try {
        const result = await apiPost<{ answer: string; contexts: Message["contexts"] }, { question: string }>("/api/chat", { question: content });
        const base = { at: new Date().toISOString(), tool: null, orderCode: null, detailUrl: null, retrievedAt: null, catalog: true };
        setSession(current => ({ ...(current || { id: "", version: 0, selectedOrderId: null, messages: [] }), messages: [...(current?.messages || []), { ...base, role: "user", content }, { ...base, role: "assistant", content: result.answer, contexts: result.contexts }] }));
        setOrderContext(false);
        setText("");
      } catch (e) { setError(e instanceof Error ? e.message : "Không gửi được câu hỏi"); }
      finally { setBusy(false); }
      return;
    }
    let activeSession = session;
    if (!activeSession?.id) {
      try {
        newSessionId.current ||= crypto.randomUUID();
        activeSession = await request<Session>("/assistant/sessions", "POST", { id: newSessionId.current });
        newSessionId.current = null;
        setSession({ ...activeSession, messages: session?.messages || [] });
      } catch (e) { setError(e instanceof Error ? e.message : "Không tạo được hội thoại"); setBusy(false); return; }
    }
    if (
      !pending.current ||
      pending.current.sessionId !== activeSession.id ||
      pending.current.content !== text.trim() ||
      pending.current.orderId !== (selected || null)
    )
      pending.current = {
        sessionId: activeSession.id,
        requestId: crypto.randomUUID(),
        version: activeSession.version,
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
      const previousCount = activeSession.messages.filter(m => !m.catalog).length;
      setSession({ ...result, messages: [...(session?.messages || []), ...result.messages.slice(previousCount)] });
      setOrderContext(true);
      setSelected(result.selectedOrderId || "");
      setText("");
      pending.current = null;
      setSessions(await request("/assistant/sessions"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được câu hỏi");
      if (e instanceof ApiError && e.status === 409) {
        pending.current = null;
        try {
          updateSession(await request("/assistant/sessions/" + activeSession.id));
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
        <h1>Trợ lý AI</h1>
        <p>
          Tư vấn xe hoặc tra cứu đơn, thanh toán và lịch bàn giao. Thông tin được lấy khi bạn
          hỏi. Yêu cầu đổi lịch hoặc hủy đơn chỉ được gửi khi bạn bấm xác nhận.
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
              data-session-id={item.id}
              key={item.id}
              disabled={busy}
              onClick={() => void open(item.id)}
            >
              Hội thoại · {new Date(item.updatedAt).toLocaleString("vi-VN")}
            </button>
          ))}
        </aside>
        <section className="content-panel">
          {(
            <>
              <label className="orders-form">Chủ đề câu hỏi<select aria-label="Chủ đề câu hỏi" value={mode} disabled={busy} onChange={e => setMode(e.target.value)}><option value="auto">Tự động nhận diện</option><option value="cars">Tư vấn xe</option><option value="orders">Đơn hàng & hỗ trợ</option></select></label>
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
                Câu hỏi về xe được gửi tới tư vấn xe; câu hỏi về đơn được tra cứu trong tài khoản. Chọn đơn hoặc nhập mã đơn trong
                câu hỏi. Ví dụ: “Tôi còn phải trả bao nhiêu?”, “Khi nào nhận
                xe?”, “Xe được bảo hành thế nào?”.
              </p>
              <div className="order-chat-messages" aria-live="polite">
                {session?.messages.map((m, index) => (
                  <article
                    className={"order-chat-message " + m.role}
                    key={index}
                  >
                    <strong>
                      {m.role === "user" ? "Bạn" : "Trợ lý AI"}
                    </strong>
                    {m.sections?.length ? m.sections.map((section) => (
                      <section key={section.topic} className="order-chat-section">
                        <h3>{topicNames[section.topic] || section.topic}</h3>
                        {section.resultStatus !== "success" && (
                          <small>{section.resultStatus === "missing" ? "Chưa có dữ liệu" : "Chưa xác minh được"}</small>
                        )}
                        {section.progress ? <OrderProgressCard progress={section.progress} /> : section.payment ? <PaymentDetailsCard initial={section.payment} /> : section.documents ? <DocumentDetailsCard initial={section.documents} /> : <p>{section.content}</p>}
                        <small>Tra cứu: {new Date(section.retrievedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small>
                        {section.detailUrl && (
                          <div><Link to={section.detailUrl}>Xem đơn {m.orderCode} →</Link></div>
                        )}
                      </section>
                    )) : <p>{m.content}</p>}
                    {m.contexts?.map(c => <div key={c.carId}><Link to={`/cars/${c.carId}`}>{c.displayName} →</Link></div>)}
                    {!m.sections?.length && m.retrievedAt && (
                      <small>
                        Tra cứu:{" "}
                        {new Date(m.retrievedAt).toLocaleString("vi-VN")}
                      </small>
                    )}
                    {!m.sections?.length && m.detailUrl && (
                      <Link to={m.detailUrl}>{m.orderCode ? `Xem đơn ${m.orderCode}` : "Mở trang tài khoản"} →</Link>
                    )}
                  </article>
                ))}
              </div>
              {session?.supportSuggested && <p>Hai lượt tra cứu liên tiếp chưa giải quyết được. Bạn có thể chuyển vấn đề cho nhân viên.</p>}
              <button className="mini-button" disabled={busy} onClick={() => setText("Tôi muốn gặp nhân viên hỗ trợ")}>Chuẩn bị phiếu hỗ trợ</button>
              {session?.draft && (session.draft.type === "support" ? <SupportDraftCard key={session.id} draft={session.draft as SupportDraft} sessionId={session.id} version={session.version} busy={busy} setBusy={setBusy} update={updateSession} error={setError} /> : <AssistantDraftCard key={session.id} draft={session.draft} sessionId={session.id} version={session.version} busy={busy} setBusy={setBusy} update={updateSession} error={setError} />)}
              <form className="orders-form" onSubmit={send}>
                <label>
                  Câu hỏi
                  <textarea
                    aria-label="Câu hỏi"
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
  return <UnifiedAssistantChat />;
}
