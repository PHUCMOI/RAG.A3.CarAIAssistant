import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, request, statuses } from "./api";
export type Draft = { id: string; orderId: string; orderCode: string; orderStatus: string; currentDate: string | null; type: string; reason: string; date: string | null; time: string | null; version: number; status: string; expiresAt: string; ready: boolean; requestCode: string | null; detailUrl: string | null };
export function AssistantDraftCard({ draft, sessionId, version, busy, setBusy, update, error }: { draft: Draft; sessionId: string; version: number; busy: boolean; setBusy: (v: boolean) => void; update: (value: any) => void; error: (message: string) => void }) {
  const [reason, setReason] = useState(draft.reason);
  const [date, setDate] = useState(draft.date || "");
  const [time, setTime] = useState(draft.time || "");
  const [now, setNow] = useState(Date.now());
  const pending = useRef<{ signature: string; body: object } | null>(null);
  useEffect(() => { setReason(draft.reason); setDate(draft.date || ""); setTime(draft.time || ""); pending.current = null; }, [draft.id, draft.version]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const expired = now >= Date.parse(draft.expiresAt);
  const active = draft.status === "draft" && !expired;
  const dirty = reason !== draft.reason || date !== (draft.date || "") || time !== (draft.time || "");
  async function act(action: string) {
    if (busy) return;
    const body = { version, draftId: draft.id, draftVersion: draft.version, action, ...(action === "edit" ? { reason, date: date || null, time: time || null } : {}) };
    const signature = JSON.stringify(body);
    if (pending.current?.signature !== signature) pending.current = { signature, body: { ...body, requestId: crypto.randomUUID() } };
    setBusy(true); error("");
    try { update(await request(`/assistant/sessions/${sessionId}/draft-actions`, "POST", pending.current.body)); pending.current = null; }
    catch (e) {
      error(e instanceof Error ? e.message : "Không xử lý được yêu cầu");
      if (e instanceof ApiError && e.status === 409) {
        pending.current = null;
        try { update(await request(`/assistant/sessions/${sessionId}`)); } catch { /* retain error */ }
        error("Đơn hoặc hội thoại đã thay đổi. Hãy kiểm tra và lưu lại bản nháp trước khi xác nhận.");
      }
    } finally { setBusy(false); }
  }
  return <section className="content-panel orders-form" aria-label="Bản nháp yêu cầu">
    <h2>{draft.type === "cancel" ? "Yêu cầu hủy đơn" : "Yêu cầu đổi lịch"} · {draft.orderCode}</h2>
    <p>Thông tin lúc lưu bản nháp: {statuses[draft.orderStatus] || draft.orderStatus} · Lịch hiện tại: {draft.currentDate || "Chưa có lịch"}. <Link to={"/account/orders/" + draft.orderId}>Xem đơn</Link></p>
    <p>Gửi đề nghị để đại lý xử lý. Lịch, trạng thái và thanh toán của đơn chỉ thay đổi theo quy trình nghiệp vụ.</p>
    {active ? <>
      <p>Hết hạn: {new Date(draft.expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
      {draft.type === "reschedule" && <>
        <label>Ngày mong muốn<input aria-label="Ngày mong muốn" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy} /></label>
        <label>Giờ mong muốn (Việt Nam, tùy chọn)<input aria-label="Giờ mong muốn" type="time" value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></label>
      </>}
      <label>Lý do<textarea aria-label="Lý do yêu cầu" value={reason} maxLength={800} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
      <p>{draft.ready ? "Kiểm tra đơn, nội dung và ngày mong muốn trước khi xác nhận." : "Cần lý do và ngày cụ thể nếu đổi lịch. Lưu bản nháp trước khi gửi."}</p>
      <button className="mini-button" disabled={busy || !reason.trim() || (draft.type === "reschedule" && !date)} onClick={() => void act("edit")}>Lưu bản nháp</button>
      <button className="button" disabled={busy || dirty || !draft.ready} onClick={() => void act("confirm")}>Xác nhận gửi yêu cầu</button>
      <button className="mini-button" disabled={busy} onClick={() => void act("discard")}>Bỏ bản nháp</button>
    </> : draft.status === "submitted" ? <p>{draft.requestCode} · Đã gửi, chờ xử lý. {draft.detailUrl && <Link to={draft.detailUrl}>Xem yêu cầu →</Link>}</p> : <p>{expired ? "Bản nháp đã hết hạn." : "Đã bỏ bản nháp."} Hãy nhắn yêu cầu mới để tiếp tục.</p>}
  </section>;
}
