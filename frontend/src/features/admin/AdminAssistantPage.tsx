import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { request, statuses } from '../orders/api';
import { useOrdersSession } from '../orders/Session';
import { AnswerContent } from '../chat/ChatContent';
import { NextSteps, type NextStepContext } from '../chat/NextSteps';
import { AdminHeading } from './ui';
import './admin-assistant.css';

type Reply = { answer: string; grounded: boolean; status: string; retrievedAt: string;
  data?: NextStepContext['data']; links: { title: string; path: string }[] };
type Message = { question: string; reply: Reply; context: string[] };
type IconName = 'sparkles' | 'chart' | 'orders' | 'support' | 'overview' | 'arrow' | 'plus' | 'filter' | 'check' | 'chevron';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" /></>,
    chart: <path d="M4 4v16h16M8 15v-4m5 4V7m5 8v-5" />,
    orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v4H9zM9 12h6m-6 4h4" /></>,
    support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M20 16v2a2 2 0 0 1-2 2h-4" /><rect x="3" y="11" width="4" height="6" rx="2" /><rect x="17" y="11" width="4" height="6" rx="2" /></>,
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    filter: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    check: <><path d="m8 12 3 3 5-6" /><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return <svg className="admin-ai-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const scopes = {
  overview: { label: 'Thống kê tổng quan', description: 'Nắm tình hình đơn hàng và hỗ trợ trên toàn bộ dữ liệu.' },
  orders: { label: 'Đơn hàng và thanh toán', description: 'Kiểm tra tiến độ, lịch bàn giao và số tiền còn phải thu.' },
  revenue: { label: 'Doanh thu và dòng tiền', description: 'Đối chiếu doanh thu vận hành và tiền thu ròng trong kỳ.' },
  customers: { label: 'Khách hàng', description: 'Tra cứu khách hàng theo tên hoặc địa chỉ email.' },
  support: { label: 'Phiếu hỗ trợ', description: 'Tìm phiếu hỗ trợ và kiểm tra nội dung cần xử lý.' },
} as const;
type Scope = keyof typeof scopes;
const suggestions: { scope: Scope; title: string; description: string; question: string; icon: IconName }[] = [
  { scope: 'revenue', title: 'Doanh thu tháng này', description: 'Xem doanh thu và tiền thu ròng trong kỳ', question: 'Doanh thu và tiền thu ròng tháng này là bao nhiêu?', icon: 'chart' },
  { scope: 'overview', title: 'Tổng quan vận hành', description: 'Nắm tình hình đơn hàng và phiếu hỗ trợ', question: 'Tóm tắt tình hình đơn hàng và phiếu hỗ trợ hiện tại.', icon: 'overview' },
  { scope: 'orders', title: 'Thanh toán cần theo dõi', description: 'Kiểm tra số tiền còn phải thu của các đơn', question: 'Các đơn hiện tại còn cần thanh toán bao nhiêu?', icon: 'orders' },
  { scope: 'support', title: 'Phiếu hỗ trợ gần đây', description: 'Xem các yêu cầu vừa được cập nhật', question: 'Liệt kê các phiếu hỗ trợ cập nhật gần đây.', icon: 'support' },
];
const formatPeriodDate = (date: string) => date.split('-').reverse().join('/');

export default function AdminAssistantPage() {
  const { user } = useOrdersSession();
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<Scope>('overview');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [delayed, setDelayed] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, setPending] = useState('');
  const locked = useRef(false);
  const generation = useRef(0);
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPeriod = scope === 'overview' || scope === 'revenue';
  const hasQuery = scope !== 'overview' && scope !== 'revenue';
  const activeContext = [scopes[scope].label,
    ...(hasQuery && query.trim() ? [query.trim()] : []),
    ...(scope === 'orders' && status ? [statuses[status]] : []),
    ...(scope === 'orders' && delayed ? ['Trễ lịch dự kiến'] : []),
    ...(hasPeriod && dateFrom && dateTo ? [`${formatPeriodDate(dateFrom)} – ${formatPeriodDate(dateTo)}`] : []),
  ];
  const hasFilters = !!((hasQuery && query) || (scope === 'orders' && (status || delayed)) || (hasPeriod && (dateFrom || dateTo)));
  useEffect(() => {
    generation.current++; setMessages([]); setQuestion(''); setError(''); setBusy(false); setPending('');
    return () => { generation.current++; };
  }, [user?.id]);
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = messages.length || busy ? thread.current.scrollHeight : 0;
  }, [messages, busy]);
  useEffect(() => {
    if (composer.current) {
      composer.current.style.height = 'auto';
      composer.current.style.height = `${Math.min(composer.current.scrollHeight, 144)}px`;
    }
  }, [question]);
  function clearFilters() { setQuery(''); setStatus(''); setDelayed(false); setDateFrom(''); setDateTo(''); setError(''); }
  function useSuggestion(suggestion: typeof suggestions[number]) {
    setScope(suggestion.scope); clearFilters(); setQuestion(suggestion.question); composer.current?.focus();
  }
  function clearConversation() { setMessages([]); setError(''); setQuestion(''); composer.current?.focus(); }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (locked.current || !question.trim() || user?.role !== 'Admin') return;
    if (hasPeriod && (!!dateFrom !== !!dateTo || (dateFrom && dateTo && dateFrom > dateTo))) {
      setError('Chọn đủ ngày bắt đầu và kết thúc, với ngày kết thúc không trước ngày bắt đầu.');
      setFiltersOpen(true); return;
    }
    locked.current = true; setBusy(true); setError('');
    const current = generation.current;
    const text = question.trim();
    const context = [...activeContext];
    setPending(text);
    try {
      const reply = await request<Reply>('/admin/assistant/messages', 'POST', {
        question: text, scope, query: hasQuery ? query.trim() : '',
        status: scope === 'orders' ? status : '', delayed: scope === 'orders' && delayed,
        dateFrom: hasPeriod ? dateFrom || null : null, dateTo: hasPeriod ? dateTo || null : null,
      });
      if (generation.current !== current) return;
      setMessages(previous => [...previous.slice(-29), { question: text, reply, context }]); setQuestion('');
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : 'Không thể tạo câu trả lời.');
    } finally {
      locked.current = false;
      if (generation.current === current) { setBusy(false); setPending(''); }
    }
  }
  return <div className="page admin-assistant">
    <AdminHeading title="Trợ lý AI quản trị" description="Từ câu hỏi đến thông tin cần xử lý. Tra cứu, đối chiếu và theo dõi vận hành trong một nơi."
      actions={<button type="button" className="button secondary admin-ai-new" disabled={busy || (!messages.length && !question)} onClick={clearConversation}><Icon name="plus" />Hội thoại mới</button>} />
    <div className="admin-ai-layout">
      <aside className={`admin-ai-filters${filtersOpen ? ' is-open' : ''}`} aria-label="Bộ lọc tra cứu">
        <button type="button" className="admin-ai-filter-toggle" aria-expanded={filtersOpen} aria-controls="admin-ai-filter-body" onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon name="filter" /><span>Phạm vi tra cứu<small>{scopes[scope].label}{hasFilters ? ' · Có bộ lọc' : ''}</small></span><Icon name="chevron" />
        </button>
        <div className="admin-ai-filter-body" id="admin-ai-filter-body">
          <div className="admin-ai-panel-heading"><span className="admin-ai-icon-tile"><Icon name="filter" /></span><div><h2>Phạm vi tra cứu</h2><p>Chọn dữ liệu cho câu hỏi của bạn</p></div></div>
          <label>Nhóm dữ liệu<select value={scope} disabled={busy} onChange={e => { setScope(e.target.value as Scope); setError(''); }}>
            {Object.entries(scopes).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select></label>
          <p className="admin-ai-scope-description">{scopes[scope].description}</p>
          {hasQuery && <label>{scope === 'orders' ? 'Mã đơn' : scope === 'customers' ? 'Tên hoặc email' : 'Mã hoặc tiêu đề phiếu'}
            <input maxLength={100} value={query} disabled={busy} onChange={e => setQuery(e.target.value)} placeholder={scope === 'orders' ? 'Ví dụ: AW-DEMO-0001' : 'Nhập từ khóa để thu hẹp kết quả'} />
          </label>}
          {scope === 'orders' && <><label>Trạng thái<select value={status} disabled={busy} onChange={e => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label><label className="admin-ai-checkbox"><input type="checkbox" checked={delayed} disabled={busy} onChange={e => setDelayed(e.target.checked)} />Chỉ đơn trễ lịch dự kiến</label></>}
          {hasPeriod && <div className="admin-ai-period"><div className="admin-ai-field-heading">Khoảng thời gian<span>Tùy chọn</span></div>
            <label>Từ ngày<input type="date" value={dateFrom} max={dateTo || undefined} disabled={busy} onChange={e => { setDateFrom(e.target.value); setError(''); }} /></label>
            <label>Đến ngày<input type="date" value={dateTo} min={dateFrom || undefined} disabled={busy} onChange={e => { setDateTo(e.target.value); setError(''); }} /></label>
            <p>Chọn cả hai ngày hoặc dùng kỳ trong câu hỏi. Mặc định: đầu tháng đến hôm nay.</p>
          </div>}
          {hasFilters && <button type="button" className="admin-ai-reset" disabled={busy} onClick={clearFilters}>Đặt lại bộ lọc</button>}
          <details className="admin-ai-guide"><summary>Cách trợ lý sử dụng dữ liệu<Icon name="chevron" /></summary><div>
            <p>Mỗi câu hỏi dùng bộ lọc hiện tại. Ghi lại mã đơn khi hỏi tiếp. Danh sách tối đa 20 bản ghi; tổng quan tính trên toàn bộ dữ liệu.</p>
            <p>Doanh thu vận hành tính giá chốt đơn hoàn thành theo ngày bàn giao. Tiền thu ròng tính thu trừ hoàn đã xác nhận trong kỳ; chưa phải báo cáo kế toán.</p>
          </div></details>
          <div className="admin-ai-readonly"><Icon name="check" /><div><strong>Tra cứu có căn cứ</strong><p>Đối chiếu bản ghi nguồn trước khi xử lý.</p></div></div>
        </div>
      </aside>
      <section className="admin-ai-chat" aria-label="Hội thoại quản trị">
        <header className="admin-ai-chat-heading"><div className="admin-ai-chat-identity"><span className="admin-ai-avatar"><Icon name="sparkles" /></span><div><strong>AutoWise AI</strong><small>Trợ lý vận hành của bạn</small></div></div><span className="admin-ai-mode"><Icon name="check" />Chỉ tra cứu</span></header>
        <div ref={thread} className="admin-ai-messages" aria-live="polite" aria-busy={busy}>
          {!messages.length && !busy && <div className="admin-ai-welcome">
            <div className="admin-ai-welcome-mark"><Icon name="sparkles" /></div><span className="admin-ai-eyebrow">THÔNG TIN RÕ RÀNG. XỬ LÝ CHỦ ĐỘNG.</span>
            <h2>Bạn muốn kiểm tra điều gì?</h2><p>Hỏi về hoạt động kinh doanh của bạn.<br />Trợ lý giúp tìm dữ liệu và dẫn bạn đến bản ghi cần xem.</p>
            <div className="admin-ai-suggestions">{suggestions.map(suggestion => <button type="button" key={suggestion.scope} disabled={busy} onClick={() => useSuggestion(suggestion)}>
              <span className="admin-ai-icon-tile"><Icon name={suggestion.icon} /></span><span><strong>{suggestion.title}</strong><small>{suggestion.description}</small></span><Icon name="arrow" />
            </button>)}</div><p className="admin-ai-welcome-tip">Chọn một gợi ý để soạn câu hỏi, rồi gửi khi bạn sẵn sàng.</p>
          </div>}
          {messages.map((message, index) => <article key={index} className="admin-ai-exchange">
            <div className="admin-ai-question"><span className="admin-ai-message-label">Bạn</span><p>{message.question}</p></div>
            <div className="admin-ai-answer"><div className="admin-ai-answer-heading"><span className="admin-ai-avatar"><Icon name="sparkles" /></span><strong>AutoWise AI</strong></div>
              <div className="admin-ai-answer-content"><div className="admin-ai-context" aria-label="Phạm vi đã sử dụng">{message.context.map(item => <span key={item}>{item}</span>)}</div>
                <AnswerContent content={message.reply.answer} natural />
                <div className="admin-ai-answer-meta"><span className={message.reply.grounded ? 'is-verified' : 'is-unverified'}><Icon name="check" />{message.reply.grounded ? 'Đã kiểm chứng với dữ liệu' : 'Chưa kiểm chứng'}</span><time dateTime={message.reply.retrievedAt}>Tra cứu lúc {new Date(message.reply.retrievedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time></div>
                {message.reply.links.some(link => link.path.startsWith('/admin/')) && <div className="admin-ai-records"><span>Bản ghi liên quan</span><div className="admin-ai-links">{message.reply.links.filter(link => link.path.startsWith('/admin/')).map(link => <Link key={link.path} to={link.path}>{link.title}<Icon name="arrow" /></Link>)}</div></div>}
                <NextSteps context={{ ...message.reply, role: 'admin' }} busy={busy} onPrompt={step => {
                  if (step.scope && step.scope in scopes) { setScope(step.scope as Scope); setStatus(''); setDelayed(false); }
                  if (step.query !== undefined) setQuery(step.query);
                  if (step.prompt) setQuestion(step.prompt);
                  composer.current?.focus();
                }} />
              </div>
            </div>
          </article>)}
          {busy && <div className="admin-ai-pending"><div className="admin-ai-question"><span className="admin-ai-message-label">Bạn</span><p>{pending}</p></div><div className="admin-ai-thinking" role="status"><span className="admin-ai-avatar"><Icon name="sparkles" /></span><span>Đang tra cứu và kiểm chứng câu trả lời<span className="admin-ai-dots"><i /><i /><i /></span></span></div></div>}
        </div>
        <form onSubmit={send} className="admin-ai-composer">
          {error && <div className="admin-ai-error" role="alert"><strong>Chưa thể gửi câu hỏi</strong><p>{error} Câu hỏi được giữ lại để bạn thử lại.</p><NextSteps context={{ role: 'admin', status: 'error' }} /></div>}
          <div className="admin-ai-composer-context"><Icon name="filter" /><span>Đang tra cứu</span><div>{activeContext.map(item => <span key={item}>{item}</span>)}</div></div>
          <label htmlFor="admin-ai-question" className="admin-ai-sr-only">Câu hỏi cho trợ lý</label>
          <div className="admin-ai-input-box"><textarea ref={composer} id="admin-ai-question" rows={2} maxLength={2000} value={question} disabled={busy} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            placeholder="Hỏi về doanh thu, đơn hàng, khách hàng…" aria-describedby="admin-ai-composer-help" />
            <button type="submit" className="admin-ai-send" disabled={busy || !question.trim()} aria-label={busy ? 'Đang trả lời…' : 'Gửi câu hỏi'}><span>{busy ? 'Đang tra cứu' : 'Gửi câu hỏi'}</span><Icon name="arrow" /></button>
          </div>
          <div className="admin-ai-composer-footer"><p id="admin-ai-composer-help">Hội thoại chỉ lưu trong trang này.<span> Ctrl / ⌘ + Enter để gửi.</span></p><span aria-label={`${question.length} trên 2000 ký tự`}>{question.length.toLocaleString('vi-VN')} / 2.000</span></div>
        </form>
      </section>
    </div>
  </div>;
}
