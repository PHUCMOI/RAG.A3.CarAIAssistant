import { ChatLayout, ChatSidebar, ChatWelcome, ThinkingMessage } from "../chat/ChatLayout";
import { ChatHistory } from "../chat/ChatHistory";
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
import { AnswerContent, CopyAnswer, FailedQuestion, ChatComposer } from "../chat/ChatContent";
import { ChatStream, ContextLinks } from "../chat/ChatUtilities";
import { readCache, writeCache, restoreCatalog, saveCatalog, type CatalogContext } from "../chat/storage";
type Message = {
  contexts?: CatalogContext[];
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
  const { user } = useOrdersSession();
  const owner = user?.id || 'guest';
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
  const [text, setText] = useState(() => {
    const pendingQuestion = readCache<unknown>('guest', 'pending-question');
    const composer = readCache<unknown>(owner, 'composer');
    return typeof pendingQuestion === 'string' && pendingQuestion ? pendingQuestion : typeof composer === 'string' ? composer : '';
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [failed, setFailed] = useState<{ content: string; orders: boolean; orderId: string } | null>(null);
  const locked = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const [pendingText, setPendingText] = useState("");
  const restored = useRef(false);
  const appliedReference = useRef('');
  const [cacheReady, setCacheReady] = useState(false);
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
    setLoadError("");
    Promise.all([
      request<SessionItem[]>("/assistant/sessions"),
      request<Page>("/my/orders?pageSize=100"),
      referencedOrder ? request<Order>("/my/orders/" + encodeURIComponent(referencedOrder)) : Promise.resolve(null),
    ])
      .then(async ([items, page, reference]) => {
        if (active) {
          setSessions(items);
          setOrders(reference && !page.items.some(o => o.id === reference.id) ? [reference, ...page.items] : page.items);
          if (reference && appliedReference.current !== reference.id) {
            appliedReference.current = reference.id;
            setSelected(reference.id); setOrderContext(true);
            setText("Tiến độ, lịch giao, thanh toán và hồ sơ hiện tại của đơn này?");
          }
          if (!restored.current) {
            const savedId = readCache<unknown>(owner, 'active');
            if (!reference && typeof savedId === 'string' && savedId) {
              const saved = await request<Session>('/assistant/sessions/' + encodeURIComponent(savedId));
              if (!active) return;
              setSession({ ...saved, messages: restoreCatalog(owner, saved.id, saved.messages) });
              setSelected(saved.selectedOrderId || ''); setOrderContext(Boolean(saved.selectedOrderId));
            } else if (!reference) {
              setSession({ id: '', version: 0, selectedOrderId: null, messages: restoreCatalog<Message>(owner, 'local', []) });
            }
            restored.current = true; setCacheReady(true);
          }
        }
      })
      .catch((e) => {
        if (active) {
          setLoadError(e.message);
          // Catalogue-only chat remains available when order services fail.
          if (!restored.current) setSession({ id: '', version: 0, selectedOrderId: null, messages: restoreCatalog<Message>(owner, 'local', []) });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry, referencedOrder, owner]);
  function updateSession(result: Session) {
    setSession(current => {
      if (!current || current.id !== result.id) return result;
      let index = 0;
      const messages = current.messages.flatMap(message => message.catalog ? [message] : result.messages[index] ? [result.messages[index++]] : []);
      return { ...result, messages: [...messages, ...result.messages.slice(index)] };
    });
  }
  useEffect(() => {
    if (cacheReady && session) {
      saveCatalog(owner, session.id || 'local', session.messages);
      writeCache(owner, 'active', session.id);
    }
  }, [session, owner, cacheReady]);
  useEffect(() => writeCache(owner, 'composer', text), [owner, text]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<Session>("/assistant/sessions/" + id);
      const messages = restoreCatalog(owner, id, result.messages);
      setSession({ ...result, messages });
      setSelected(result.selectedOrderId || "");
      setOrderContext(true);
      pending.current = null;
      setFailed(null); setCacheReady(true); restored.current = true;
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được hội thoại");
    } finally {
      setBusy(false);
    }
  }
  function create() {
    if (locked.current || busy) return;
    setError(''); setFailed(null); pending.current = null; newSessionId.current = null;
    setSession({ id: '', version: 0, selectedOrderId: null, messages: [] });
    setMode('auto'); setOrderContext(Boolean(referencedOrder));
    setSelected(orders.some(order => order.id === referencedOrder) ? referencedOrder : '');
    setText(''); setCacheReady(true); restored.current = true;
    writeCache('guest', 'pending-question', '');
  }
  async function sendQuestion(content: string, previous?: { orders: boolean; orderId: string }) {
    content = content.trim();
    const draftAtStart = input.current?.value || '';
    if (!content || locked.current || busy) return;
    locked.current = true; setBusy(true); setError(''); setFailed(null); setPendingText(content);
    const routeToOrders = previous?.orders ?? (mode === 'orders' || (mode === 'auto' && isOrderQuestion(content, orderContext || Boolean(selected))));
    const orderId = previous?.orderId ?? selected;
    try {
      if (!routeToOrders) {
        const result = await apiPost<{ answer: string; contexts: Message['contexts'] }, { question: string }>('/api/chat', { question: content });
        const base = { at: new Date().toISOString(), tool: null, orderCode: null, detailUrl: null, retrievedAt: null, catalog: true };
        setSession(current => ({ ...(current || { id: '', version: 0, selectedOrderId: null, messages: [] }), messages: [...(current?.messages || []), { ...base, role: 'user', content }, { ...base, role: 'assistant', content: result.answer, contexts: result.contexts }] }));
        setOrderContext(false);
      } else {
        let activeSession = session;
        if (!activeSession?.id) {
          newSessionId.current ||= crypto.randomUUID();
          activeSession = await request<Session>('/assistant/sessions', 'POST', { id: newSessionId.current });
          newSessionId.current = null;
          setSession({ ...activeSession, messages: session?.messages || [] });
        }
        if (!pending.current || pending.current.sessionId !== activeSession.id || pending.current.content !== content || pending.current.orderId !== (orderId || null)) {
          pending.current = { sessionId: activeSession.id, requestId: crypto.randomUUID(), version: activeSession.version, content, orderId: orderId || null };
        }
        const { sessionId, ...body } = pending.current;
        try {
          const result = await request<Session>(`/assistant/sessions/${sessionId}/messages`, 'POST', body);
          updateSession(result);
          setOrderContext(true); setSelected(result.selectedOrderId || '');
          pending.current = null;
          // A list refresh failure must never turn an accepted message into a retry.
          request<SessionItem[]>('/assistant/sessions').then(setSessions).catch(() => setLoadError('Tin nhắn đã gửi; chưa cập nhật được danh sách hội thoại.'));
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            pending.current = null;
            try { updateSession(await request<Session>('/assistant/sessions/' + activeSession.id)); } catch { /* Preserve original error. */ }
          }
          throw e;
        }
      }
      setFailed(null); setText(current => current === draftAtStart && draftAtStart.trim() === content ? '' : current); setCacheReady(true); restored.current = true;
      writeCache('guest', 'pending-question', '');
    } catch (e) {
      setFailed({ content, orders: routeToOrders, orderId });
      setError(e instanceof Error ? e.message : 'Không gửi được câu hỏi.');
    } finally { locked.current = false; setBusy(false); setPendingText(''); input.current?.focus(); }
  }
  function send(event: FormEvent) { event.preventDefault(); void sendQuestion(text); }
  if (loading && !session)
    return (
      <div className="page">
        <LoadingSkeleton />
      </div>
    );
  function choose(value: string, topic?: 'cars' | 'orders') { if (topic) setMode(topic); setText(value); input.current?.focus(); }
  return <ChatLayout sidebar={<ChatSidebar busy={busy} customer onNew={create}>
    {session?.messages.length && !session.id ? <div className="assistant-local-session">Hội thoại hiện tại</div> : null}
    {sessions.length > 0 && <ChatHistory items={sessions} currentId={session?.id} currentTitle={session?.messages.find(message => message.role === 'user')?.content} busy={busy} onOpen={id => void open(id)} />}
  </ChatSidebar>}>
    <div className="assistant-controls">
      <label>Chủ đề<select aria-label="Chủ đề câu hỏi" value={mode} disabled={busy} onChange={e => setMode(e.target.value)}><option value="auto">Tự động nhận diện</option><option value="cars">Tư vấn xe</option><option value="orders">Đơn hàng & hỗ trợ</option></select></label>
      <label>Đơn cần tra cứu<select aria-label="Đơn cần tra cứu" value={selected} onChange={e => setSelected(e.target.value)} disabled={busy}><option value="">Chưa chọn đơn</option>{orders.map(o => <option key={o.id} value={o.id}>{o.code} · {o.carName}</option>)}</select></label>
      <button className="mini-button" disabled={busy} onClick={() => { setMode('orders'); choose('Tôi muốn gặp nhân viên hỗ trợ'); }}>Chuẩn bị phiếu hỗ trợ</button>
    </div>
    <ChatStream className="assistant-thread" revision={`${session?.messages.length}:${busy}:${failed?.content}:${Boolean(session?.draft)}`}>
      {!session?.messages.length && !pendingText && !failed && <ChatWelcome busy={busy} customer onPrompt={choose} />}
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
                        {section.progress ? <OrderProgressCard progress={section.progress} /> : section.payment ? <PaymentDetailsCard initial={section.payment} /> : section.documents ? <DocumentDetailsCard initial={section.documents} /> : <AnswerContent content={section.content} />}
                        <small>Tra cứu: {new Date(section.retrievedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</small>
                        {section.detailUrl && (
                          <div><Link to={section.detailUrl}>Xem đơn {m.orderCode} →</Link></div>
                        )}
                      </section>
                    )) : m.role === "user" ? <p>{m.content}</p> : <AnswerContent content={m.content} />}
                    <ContextLinks contexts={m.contexts} />
                    {m.role !== "user" && <CopyAnswer content={m.sections?.length ? m.sections.map(section => `${topicNames[section.topic] || section.topic}\n${section.content}`).join("\n\n") : m.content} />}
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
      {pendingText && <ThinkingMessage question={pendingText} />}
      {failed && !pendingText && <FailedQuestion content={failed.content} error={error} busy={busy} onRetry={() => void sendQuestion(failed.content, failed)} />}
      {session?.supportSuggested && <p>Vấn đề chưa được giải quyết? Bạn có thể chuẩn bị phiếu hỗ trợ để gặp nhân viên.</p>}
              {session?.draft && (session.draft.type === "support" ? <SupportDraftCard key={session.id} draft={session.draft as SupportDraft} sessionId={session.id} version={session.version} busy={busy} setBusy={setBusy} update={updateSession} error={setError} /> : <AssistantDraftCard key={session.id} draft={session.draft} sessionId={session.id} version={session.version} busy={busy} setBusy={setBusy} update={updateSession} error={setError} />)}
    </ChatStream>
    <div className="assistant-composer-area">
      {loadError && <div className="assistant-error" role="alert"><p>{loadError}</p><button className="mini-button" disabled={loading} onClick={() => setRetry(v => v + 1)}>Thử lại tải dữ liệu</button></div>}
      {loading && <p className="assistant-data-loading" role="status">Đang cập nhật lịch sử và đơn hàng…</p>}
      {error && !failed && <div className="assistant-error" role="alert">{error}</div>}
      <ChatComposer inputRef={input} value={text} onChange={setText} busy={busy} onSubmit={send} sendLabel="Gửi câu hỏi" placeholder="Hỏi về xe, đơn hàng hoặc điều bạn cần hỗ trợ…" notice="Yêu cầu thay đổi chỉ được gửi khi bạn xác nhận." />
    </div>
  </ChatLayout>;

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
