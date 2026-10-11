import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { request, statuses } from '../orders/api';
import { useOrdersSession } from '../orders/Session';
import { AnswerContent } from '../chat/ChatContent';
import { NextSteps, type NextStepContext } from '../chat/NextSteps';
import './admin-assistant.css';

type Reply = { answer: string; grounded: boolean; status: string; retrievedAt: string;
  data?: NextStepContext['data'];
  links: { title: string; path: string }[] };
type Message = { question: string; reply: Reply };
const suggestions = [
  ['revenue', 'Doanh thu và tiền thu ròng tháng này là bao nhiêu?'],
  ['overview', 'Tóm tắt tình hình đơn hàng và phiếu hỗ trợ hiện tại.'],
  ['orders', 'Các đơn hiện tại còn cần thanh toán bao nhiêu?'],
  ['support', 'Liệt kê các phiếu hỗ trợ cập nhật gần đây.'],
] as const;

export default function AdminAssistantPage() {
  const { user } = useOrdersSession();
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState('overview');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [delayed, setDelayed] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const generation = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    generation.current++; setMessages([]); setQuestion(''); setError('');
    return () => { generation.current++; };
  }, [user?.id]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages, busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !question.trim() || user?.role !== 'Admin') return;
    locked.current = true; setBusy(true); setError('');
    const current = generation.current;
    const text = question.trim();
    try {
      const reply = await request<Reply>('/admin/assistant/messages', 'POST', {
        question: text, scope, query: scope === 'overview' ? '' : query.trim(),
        status: scope === 'orders' ? status : '', delayed: scope === 'orders' && delayed,
        dateFrom: dateFrom || null, dateTo: dateTo || null,
      });
      if (generation.current !== current) return;
      setMessages(previous => [...previous.slice(-29), { question: text, reply }]); setQuestion('');
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : 'Không thể tạo câu trả lời.');
    } finally {
      locked.current = false;
      if (generation.current === current) setBusy(false);
    }
  }

  return <div className="page admin-assistant">
    <div className="admin-page-heading"><div><h1>Trợ lý AI quản trị</h1>
      <p>Hỏi về dữ liệu quản trị, xem nguồn và mở bản ghi để xử lý.</p></div>
      <button type="button" className="button secondary" disabled={busy || !messages.length}
        onClick={() => { setMessages([]); setError(''); }}>Xóa hội thoại</button></div>
    <div className="admin-ai-layout">
      <aside className="admin-ai-filters">
        <h2>Phạm vi tra cứu</h2>
        <label>Nhóm dữ liệu<select value={scope} disabled={busy} onChange={e => setScope(e.target.value)}>
          <option value="overview">Thống kê tổng quan</option><option value="orders">Đơn hàng và thanh toán</option>
          <option value="revenue">Doanh thu và dòng tiền</option>
          <option value="customers">Khách hàng</option><option value="support">Phiếu hỗ trợ</option>
        </select></label>
        {scope !== 'overview' && scope !== 'revenue' && <label>{scope === 'orders' ? 'Mã đơn' : scope === 'customers' ? 'Tên hoặc email' : 'Mã hoặc tiêu đề phiếu'}
          <input maxLength={100} value={query} disabled={busy} onChange={e => setQuery(e.target.value)} placeholder="Để trống để xem danh sách" /></label>}
        {scope === 'orders' && <><label>Trạng thái<select value={status} disabled={busy} onChange={e => setStatus(e.target.value)}>
          <option value="">Tất cả</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label><label className="admin-ai-checkbox"><input type="checkbox" checked={delayed} disabled={busy} onChange={e => setDelayed(e.target.checked)} />Chỉ đơn trễ lịch dự kiến</label></>}
        {(scope === 'revenue' || scope === 'overview') && <><label>Từ ngày<input type="date" value={dateFrom} disabled={busy} onChange={e => setDateFrom(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={dateTo} min={dateFrom || undefined} disabled={busy} onChange={e => setDateTo(e.target.value)} /></label>
          <p>Ngày áp dụng khi hỏi doanh thu hoặc thống kê trong kỳ. Chọn cả hai ngày hoặc để trống để dùng kỳ trong câu hỏi: hôm nay, hôm qua, tháng trước, năm nay; mặc định từ đầu tháng đến hôm nay.</p></>}
        <p>Doanh thu vận hành tính giá chốt đơn hoàn thành theo ngày bàn giao thực tế. Tiền thu ròng tính thu trừ hoàn đã xác nhận trong kỳ; chưa phải báo cáo kế toán.</p>
        <p>Danh sách tối đa 20 bản ghi mỗi lần. Thống kê tổng quan tính trên toàn bộ dữ liệu hiện tại.</p>
        <p>Trợ lý chỉ tra cứu. Mỗi câu hỏi dùng bộ lọc hiện tại; hãy ghi lại mã đơn khi hỏi tiếp. Hội thoại chỉ giữ trong trang đang mở.</p>
      </aside>
      <section className="admin-ai-chat" aria-label="Hội thoại quản trị">
        <div className="admin-ai-messages" aria-live="polite" aria-busy={busy}>
          {!messages.length && <div className="admin-ai-welcome"><h2>Bạn muốn kiểm tra điều gì?</h2>
            <p>Chọn nhóm dữ liệu hoặc bắt đầu bằng một câu hỏi gợi ý.</p>
            {suggestions.map(([group, text]) => <button className="button secondary" type="button" key={group} disabled={busy}
              onClick={() => { setScope(group); setQuery(''); setStatus(''); setDelayed(false); setDateFrom(''); setDateTo(''); setQuestion(text); }}>{text}</button>)}
          </div>}
          {messages.map((message, index) => <article key={index} className="admin-ai-exchange">
            <p className="admin-ai-question"><strong>Bạn</strong><span>{message.question}</span></p>
            <div className="admin-ai-answer"><strong>AutoWise AI</strong><AnswerContent content={message.reply.answer} natural />
              <small>Tra cứu lúc {new Date(message.reply.retrievedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · {message.reply.grounded ? 'Đã kiểm chứng với dữ liệu' : 'Chưa kiểm chứng'}</small>
              <div className="admin-ai-links">{message.reply.links.filter(link => link.path.startsWith('/admin/')).map(link => <Link key={link.path} to={link.path}>{link.title}</Link>)}</div>
              <NextSteps context={{ ...message.reply, role: 'admin' }} busy={busy} onPrompt={step => {
                if (step.scope) { setScope(step.scope); setStatus(''); setDelayed(false); }
                if (step.query !== undefined) setQuery(step.query);
                if (step.prompt) setQuestion(step.prompt);
                document.getElementById('admin-ai-question')?.focus();
              }} />
            </div>
          </article>)}
          {busy && <p role="status">Đang tra cứu và kiểm chứng câu trả lời…</p>}
          <div ref={bottom} />
        </div>
        <form onSubmit={send} className="admin-ai-composer">
          {error && <div role="alert"><p>{error} Câu hỏi được giữ lại để bạn thử lại.</p><NextSteps context={{ role: 'admin', status: 'error' }} /></div>}
          <label htmlFor="admin-ai-question">Câu hỏi cho trợ lý</label>
          <textarea id="admin-ai-question" rows={3} maxLength={2000} value={question} disabled={busy}
            onChange={e => setQuestion(e.target.value)} placeholder="Ví dụ: đơn AW-… đang ở trạng thái nào, còn phải thu bao nhiêu?" />
          <button type="submit" className="button" disabled={busy || !question.trim()}>{busy ? 'Đang trả lời…' : 'Gửi câu hỏi'}</button>
        </form>
      </section>
    </div>
  </div>;
}
