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
import { isOrderQuestion, understandQuestion } from "../chat/routing";
import { AnswerContent, CopyAnswer, FailedQuestion, ChatComposer } from "../chat/ChatContent";
import { ChatStream, ContextLinks } from "../chat/ChatUtilities";
import { readCache, writeCache, restoreCatalog, type CatalogContext } from "../chat/storage";
type Message = {
  imageUrl?: string;
  uncertain?: boolean;
  generationMode?: string;
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
  title?: string | null;
  id: string;
  version: number;
  selectedOrderId: string | null;
  messages: Message[];
  draft?: Draft | null;
  supportSuggested?: boolean;
};
type SessionItem = { id: string; updatedAt: string; title?: string | null };
export function UnifiedAssistantChat() {
  const { user } = useOrdersSession();
  const owner = user?.id || 'guest';
  const carQuestion = useCarQuestion();
  useEffect(() => { if (carQuestion) setText(current => current || carQuestion); }, [carQuestion]);
  const [orderContext, setOrderContext] = useState(false);
  const [searchParams] = useSearchParams();
  const referencedOrder = searchParams.get("orderId") || "";
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState(() => {
    const pendingQuestion = readCache<unknown>('guest', 'pending-question');
    const composer = readCache<unknown>(owner, 'composer');
    return typeof pendingQuestion === 'string' && pendingQuestion ? pendingQuestion : typeof composer === 'string' ? composer : '';
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const failedPhoto = useRef<{ file: File; preview: string; text: string } | null>(null);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
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
  const pendingCatalogue = useRef<{ sessionId: string; requestId: string; version: number; content: string; originalContent?: string; clarification?: string | null; imageBase64?: string; mimeType?: string } | null>(null);
  const pending = useRef<{
    sessionId: string;
    requestId: string;
    version: number;
    content: string;
    orderId: string | null;
    originalContent?: string;
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
      .then(async ([items, , reference]) => {
        if (active) {
          setSessions(items);
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
              setSession(saved); nameConversation(saved);
              setSelected(saved.selectedOrderId || ''); setOrderContext(Boolean(saved.messages.length && !saved.messages.at(-1)?.catalog));
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
  function nameConversation(result: Session) {
    if (!result.id || !result.messages.length) return;
    request<Session>(`/assistant/sessions/${result.id}/title`, 'POST', {}).then(named => {
      setSession(current => current?.id === named.id ? { ...current, title: named.title } : current);
      return request<SessionItem[]>('/assistant/sessions');
    }).then(setSessions).catch(() => { /* Naming never blocks an accepted message. */ });
  }
  function updateSession(result: Session) {
    setSession(result);
    nameConversation(result);
  }
  useEffect(() => {
    if (cacheReady && session) {
      writeCache(owner, 'active', session.id);
    }
  }, [session, owner, cacheReady]);
  useEffect(() => writeCache(owner, 'composer', text), [owner, text]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<Session>("/assistant/sessions/" + id);
      const messages = result.messages;
      setSession({ ...result, messages }); nameConversation(result);
      setSelected(result.selectedOrderId || "");
      setOrderContext(Boolean(messages.length && !messages.at(-1)?.catalog));
      pending.current = null; pendingCatalogue.current = null; failedPhoto.current = null; setPhoto(null);
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
    setError(''); setFailed(null); pending.current = null; pendingCatalogue.current = null; newSessionId.current = null;
    setSession({ id: '', version: 0, selectedOrderId: null, messages: [] });
    setOrderContext(Boolean(referencedOrder));
    setSelected(referencedOrder);
    setPhoto(null); failedPhoto.current = null; setText(''); setCacheReady(true); restored.current = true;
    writeCache('guest', 'pending-question', '');
  }
  async function sendQuestion(content: string, previous?: { orders: boolean; orderId: string }) {
    content = content.trim();
    const draftAtStart = input.current?.value || '';
    const image = previous && failedPhoto.current ? failedPhoto.current : photo ? { file: photo, preview, text: content } : null;
    if ((!content && !image) || locked.current || busy) return;
    locked.current = true; setBusy(true); setError(''); setFailed(null); setPendingText(content || 'Nhận diện xe trong ảnh');
    let routeToOrders = !image && (previous?.orders ?? isOrderQuestion(content, orderContext));
    const explicitReference = /\bAW-[A-Z0-9-]+\b/i.test(content) || /don truoc/.test(content.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase());
    const orderId = previous?.orderId ?? (explicitReference || session?.id ? '' : selected);
    const originalContent = content;
    try {
      const understanding = await understandQuestion(content || 'Nhận diện xe trong ảnh', {
        lastRoute: orderContext ? 'orders' : 'catalogue', hasImage: Boolean(image),
        recentQuestions: (session?.messages || []).filter(m => m.role === 'user').slice(-3).map(m => m.content),
        lastAnswer: session?.messages.at(-1)?.content.slice(0, 1800),
      });
      content = understanding.question;
      routeToOrders = !image && understanding.route === 'orders';
      let activeSession = session;
      if (!activeSession?.id) {
        newSessionId.current ||= crypto.randomUUID();
        activeSession = await request<Session>('/assistant/sessions', 'POST', { id: newSessionId.current });
        newSessionId.current = null;
        setSession(activeSession);
      }
      if (!routeToOrders) {
        if (!previous || !pendingCatalogue.current) {
          let imageBase64: string | undefined;
          if (image) {
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Không đọc được ảnh.')); reader.readAsDataURL(image.file);
            });
            imageBase64 = data.slice(data.indexOf(',') + 1);
          }
          pendingCatalogue.current = { sessionId: activeSession.id, requestId: crypto.randomUUID(), version: activeSession.version, content, originalContent, clarification: understanding.needsClarification ? understanding.clarification : null, imageBase64, mimeType: image?.file.type };
        }
        const { sessionId, ...body } = pendingCatalogue.current;
        try {
          const result = await request<Session>(`/assistant/sessions/${sessionId}/catalogue-messages`, 'POST', body);
          updateSession(result); pendingCatalogue.current = null; pending.current = null;
          if (image && photo === image.file) setPhoto(null);
          failedPhoto.current = null; setOrderContext(false);
          request<SessionItem[]>('/assistant/sessions').then(setSessions).catch(() => setLoadError('Tin nhắn đã gửi; chưa cập nhật được danh sách hội thoại.'));
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            pendingCatalogue.current = null;
            try { updateSession(await request<Session>('/assistant/sessions/' + activeSession.id)); } catch { /* Preserve original error. */ }
          }
          throw e;
        }
      } else {
        pendingCatalogue.current = null; failedPhoto.current = null;
        if (!pending.current || pending.current.sessionId !== activeSession.id || pending.current.content !== content || pending.current.orderId !== (orderId || null)) {
          pending.current = { sessionId: activeSession.id, requestId: crypto.randomUUID(), version: activeSession.version, content, originalContent, orderId: orderId || null };
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
      if (image) failedPhoto.current = image;
      setFailed({ content: originalContent || 'Nhận diện xe trong ảnh', orders: routeToOrders, orderId });
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
  function choose(value: string) { setText(value); input.current?.focus(); }
  return <ChatLayout sidebar={<ChatSidebar busy={busy} customer onNew={create}>
    {session?.messages.length && !session.id ? <div className="assistant-local-session">Hội thoại hiện tại</div> : null}
    {sessions.length > 0 && <ChatHistory items={sessions} currentId={session?.id} currentTitle={session?.title || undefined} busy={busy} onOpen={id => void open(id)} />}
  </ChatSidebar>}>
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
                    {m.generationMode === 'bedrock-natural' && <AnswerContent content={m.content} natural />}
                    {m.sections?.length ? <details open={m.generationMode !== 'bedrock-natural'} className="assistant-tool-details"><summary>Chi tiết dữ liệu đã tra cứu</summary>{m.sections.map((section) => (
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
                    ))}</details> : m.role === "user" ? <p>{m.content}</p> : m.generationMode !== 'bedrock-natural' ? <AnswerContent contexts={m.contexts} content={m.content} /> : null}
                    {m.imageUrl && <img className="chat-image-preview-bubble" src={m.imageUrl} alt="Ảnh xe đã gửi" />}
                    {m.uncertain && <p className="chat-uncertain-warning">Kết quả nhận diện chưa chắc chắn. Hãy kiểm tra thông tin xe.</p>}
                    <ContextLinks contexts={m.contexts} />
                    {m.role !== "user" && <CopyAnswer content={m.generationMode === 'bedrock-natural' ? m.content : m.sections?.length ? m.sections.map(section => `${topicNames[section.topic] || section.topic}\n${section.content}`).join("\n\n") : m.content} />}
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
      <ChatComposer canSend={!!photo} tools={<button type="button" className="chat-attach-btn" disabled={busy} onClick={() => photoInput.current?.click()} aria-label="Đính kèm ảnh xe">▧</button>} attachment={<div className="assistant-attachments"><input ref={photoInput} type="file" hidden disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 10_000_000) { setError('Chọn ảnh nhỏ hơn 10 MB.'); return; } if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Chọn ảnh JPEG, PNG hoặc WebP.'); return; } setPhoto(file); setError(''); }} />{photo && <div className="chat-attachment-bar">{preview && <img className="chat-attachment-thumb" src={preview} alt="Ảnh xe đính kèm" />}<span className="chat-attachment-name">{photo.name}</span><button type="button" disabled={busy} onClick={() => setPhoto(null)} aria-label="Bỏ ảnh đính kèm">×</button></div>}</div>} inputRef={input} value={text} onChange={setText} busy={busy} onSubmit={send} sendLabel="Gửi câu hỏi" placeholder="Hỏi về xe, đơn hàng hoặc điều bạn cần hỗ trợ…" notice="Yêu cầu thay đổi chỉ được gửi khi bạn xác nhận." />
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
