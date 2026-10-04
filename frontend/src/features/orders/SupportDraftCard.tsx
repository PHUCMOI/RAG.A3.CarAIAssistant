import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, request, type Order, type Page } from "./api";
import type { Draft } from "./AssistantDraftCard";
import { SupportContext } from "./SupportContext";
export type SupportDraft = Draft & { subject: string; paymentId: string | null; changeRequestId: string | null; snapshot: { at: string; topics: string[]; results: string[] }[] };
export function SupportDraftCard({ draft, sessionId, version, busy, setBusy, update, error }: { draft: SupportDraft; sessionId: string; version: number; busy: boolean; setBusy: (value: boolean) => void; update: (value: any) => void; error: (value: string) => void }) {
  const [subject, setSubject] = useState(draft.subject); const [summary, setSummary] = useState(draft.reason);
  const [orderId, setOrderId] = useState(draft.orderId === "00000000-0000-0000-0000-000000000000" ? "" : draft.orderId);
  const [paymentId, setPaymentId] = useState(draft.paymentId || ""); const [changeId, setChangeId] = useState(draft.changeRequestId || "");
  const [orders, setOrders] = useState<Order[]>([]); const [order, setOrder] = useState<Order | null>(null);
  const [changes, setChanges] = useState<{ id: string; orderId: string; code: string }[]>([]); const [now, setNow] = useState(Date.now());
  const pending = useRef<{ signature: string; body: object } | null>(null);
  useEffect(() => { setSubject(draft.subject); setSummary(draft.reason); setOrderId(draft.orderId === "00000000-0000-0000-0000-000000000000" ? "" : draft.orderId); setPaymentId(draft.paymentId || ""); setChangeId(draft.changeRequestId || ""); pending.current = null; }, [draft.id, draft.version]);
  useEffect(() => { let active = true; Promise.all([request<Page>("/my/orders?pageSize=100"), request<{ items: typeof changes }>("/my/change-requests?pageSize=100")]).then(([p, c]) => { if (active) { setOrders(p.items); setChanges(c.items); } }).catch(e => { if (active) error(e.message); }); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { active = false; clearInterval(timer); }; }, []);
  useEffect(() => { let active = true; setOrder(null); if (orderId) request<Order>("/my/orders/" + orderId).then(o => { if (active) setOrder(o); }).catch(e => { if (active) error(e.message); }); return () => { active = false; }; }, [orderId]);
  const expired = now >= Date.parse(draft.expiresAt); const active = draft.status === "draft" && !expired;
  const dirty = subject !== draft.subject || summary !== draft.reason || orderId !== (draft.orderId === "00000000-0000-0000-0000-000000000000" ? "" : draft.orderId) || paymentId !== (draft.paymentId || "") || changeId !== (draft.changeRequestId || "");
  async function act(action: string) {
    if (busy) return; const body = { version, draftId: draft.id, draftVersion: draft.version, action, ...(action === "edit" ? { subject, reason: summary, linkedOrderId: orderId || null, paymentId: paymentId || null, changeRequestId: changeId || null } : {}) };
    const signature = JSON.stringify(body); if (pending.current?.signature !== signature) pending.current = { signature, body: { ...body, requestId: crypto.randomUUID() } };
    setBusy(true); error(""); try { update(await request(`/assistant/sessions/${sessionId}/draft-actions`, "POST", pending.current.body)); pending.current = null; }
    catch (e) { error(e instanceof Error ? e.message : "Không xử lý được phiếu"); if (e instanceof ApiError && e.status === 409) { pending.current = null; try { update(await request("/assistant/sessions/" + sessionId)); } catch {} error("Hội thoại đã thay đổi. Hãy kiểm tra và lưu lại bản nháp."); } } finally { setBusy(false); }
  }
  return <section className="content-panel orders-form" aria-label="Bản nháp hỗ trợ"><h2>Chuyển hỗ trợ cho nhân viên</h2><p>Không gửi mật khẩu, OTP hoặc khóa truy cập. Chưa có thời gian xử lý cam kết.</p>
    {active ? <><p>Hết hạn: {new Date(draft.expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
      <label>Chủ đề hỗ trợ<input aria-label="Chủ đề hỗ trợ" maxLength={150} value={subject} onChange={e => setSubject(e.target.value)} disabled={busy} /></label>
      <label>Tóm tắt vấn đề<textarea aria-label="Tóm tắt vấn đề" maxLength={800} value={summary} onChange={e => setSummary(e.target.value)} disabled={busy} /></label>
      <label>Đơn liên quan (tùy chọn)<select aria-label="Đơn liên quan" value={orderId} disabled={busy} onChange={e => { setOrderId(e.target.value); setPaymentId(""); setChangeId(""); }}><option value="">Không có đơn</option>{orders.map(o => <option key={o.id} value={o.id}>{o.code}</option>)}</select></label>
      <label>Giao dịch liên quan (tùy chọn)<select aria-label="Giao dịch liên quan" value={paymentId} onChange={e => setPaymentId(e.target.value)} disabled={busy || !order}><option value="">Không chọn</option>{order?.payments.map(p => <option key={p.id} value={p.id}>{p.reference}</option>)}</select></label>
      <label>Đề nghị liên quan (tùy chọn)<select aria-label="Đề nghị liên quan" value={changeId} onChange={e => setChangeId(e.target.value)} disabled={busy}><option value="">Không chọn</option>{changes.filter(c => !orderId || c.orderId === orderId).map(c => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
      <SupportContext snapshot={draft.snapshot} />
      <p>Lưu bản nháp và kiểm tra lại tóm tắt trước khi gửi.</p><button className="mini-button" disabled={busy || !subject.trim() || !summary.trim()} onClick={() => void act("edit")}>Lưu bản nháp hỗ trợ</button><button className="button" disabled={busy || dirty || !draft.ready} onClick={() => void act("confirm")}>Xác nhận gửi phiếu</button><button className="mini-button" disabled={busy} onClick={() => void act("discard")}>Bỏ bản nháp hỗ trợ</button>
    </> : draft.status === "submitted" ? <p>{draft.requestCode} · Đã tiếp nhận. {draft.detailUrl && <Link to={draft.detailUrl}>Xem phiếu hỗ trợ →</Link>}</p> : <p>{expired ? "Bản nháp đã hết hạn." : "Đã bỏ bản nháp."} Nhắn yêu cầu mới để tiếp tục.</p>}
  </section>;
}
