import { Link } from 'react-router-dom';
import type { CatalogContext } from './storage';
import './next-steps.css';

export type NextStep = { label: string; prompt?: string; path?: string; scope?: string; query?: string };
type Progress = { nextActions?: { actor: string; content: string; detailUrl: string }[] };
export type NextStepContext = {
  role: 'guest' | 'customer' | 'admin'; status?: string; uncertain?: boolean; requiresLogin?: boolean; orderCode?: string | null; catalog?: boolean;
  question?: string;
  detailUrl?: string | null; contexts?: CatalogContext[];
  sections?: { topic: string; detailUrl?: string | null; progress?: Progress | null; documents?: { requiredOutstanding: number } | null }[] | null;
  data?: { scope?: string; totalCount?: number; items?: { code?: string; remainingVnd?: number; orderStatusLabel?: string }[] };
  links?: { title: string; path: string }[];
};

function allowedPath(path: string, role: NextStepContext['role']) {
  if (path.includes('..') || path.includes('\\') || path.includes('//')) return false;
  return role === 'admin' ? /^\/admin\/(orders|customers|support-tickets|assistant)(?:[/?][A-Za-z0-9_?=&%/-]*)?$/.test(path)
    : /^\/(?:cars(?:\/[A-Za-z0-9_-]+)?|compare|dealers|login(?:\?returnTo=%2Fchat)?|account\/(?:orders|support-tickets|purchase-requests|change-requests|appointments)(?:[/?][A-Za-z0-9_?=&%/-]*)?)$/.test(path)
      && (role !== 'guest' || !path.startsWith('/account/'));
}

// Suggestions are navigation or draft questions. No suggestion calls a write API.
// Rules use structured tool results; arbitrary model prose is never interpreted as an action.
export function nextSteps(context: NextStepContext): NextStep[] {
  const { role, status } = context;
  const steps: NextStep[] = [];
  const order = context.orderCode ? `đơn ${context.orderCode}` : 'đơn hàng của tôi';
  if (status === 'error') {
    const question = context.question || '';
    const catalogue = role !== 'admin' && !/đơn hàng|mã đơn/i.test(question)
      && /ngân sách|tài chính|chỗ ngồi|số ghế|chọn xe|tìm xe|xe nào|so sánh/i.test(question);
    return [{ label: 'Kiểm tra thông báo lỗi, điều chỉnh đầu vào hoặc kết nối rồi thử lại câu hỏi được giữ.' },
      { label: catalogue ? 'Khám phá xe trong catalogue' : role === 'admin' ? 'Mở danh sách đơn để tra cứu trực tiếp' : role === 'customer' ? 'Mở đơn hàng để kiểm tra trực tiếp' : 'Khám phá xe trong catalogue',
        path: catalogue ? '/cars' : role === 'admin' ? '/admin/orders' : role === 'customer' ? '/account/orders' : '/cars' }].filter(s => !s.path || s.path === '/cars' || allowedPath(s.path, role));
  }
  if (status === 'forbidden') {
    return role === 'admin' ? [{ label: 'Đăng nhập lại bằng tài khoản quản trị', path: '/admin/login' }]
      : [{ label: role === 'customer' ? 'Tra cứu đơn thuộc tài khoản của bạn' : 'Tư vấn xe theo ngân sách', prompt: role === 'customer' ? 'Những đơn hàng nào của tôi đang được xử lý?' : 'Tôi cần chọn xe theo ngân sách và nhu cầu sử dụng.' }];
  }
  if (status === 'needs_clarification' || status === 'no_data' || status === 'partial') {
    steps.push({ label: role === 'admin' ? 'Bổ sung mã bản ghi hoặc điều chỉnh bộ lọc và khoảng ngày.'
      : context.requiresLogin ? 'Đăng nhập để tra cứu thông tin thuộc tài khoản.'
      : role === 'guest' || context.catalog ? 'Bổ sung tên mẫu xe hoặc làm rõ thông tin bạn muốn đối chiếu.'
      : 'Bổ sung mã đơn và thông tin đang còn thiếu.' });
  }
  if (context.uncertain) steps.push({ label: 'Gửi ảnh rõ hơn hoặc cung cấp tên mẫu xe để đối chiếu; ảnh chưa xác minh chiếc xe thực tế.' });
  if (role === 'guest' && context.requiresLogin) steps.unshift({ label: 'Đăng nhập để tra cứu đơn thuộc tài khoản của bạn', path: '/login?returnTo=%2Fchat' });
  if (role === 'admin') {
    const data = context.data;
    if (data?.scope === 'orders') {
      const outstanding = data.items?.find(item => typeof item.code === 'string' && item.code.length > 0 && (item.remainingVnd ?? 0) > 0);
      if (outstanding) steps.push({ label: `Kiểm tra thanh toán ${outstanding.code}`, prompt: `Kiểm tra thanh toán và số tiền còn phải thu của đơn ${outstanding.code}.`, scope: 'orders', query: outstanding.code });
      steps.push({ label: 'Mở đơn để kiểm tra trước khi cập nhật; gợi ý chưa thực hiện thay đổi.', path: context.links?.find(link => /^\/admin\/orders\/[A-Za-z0-9-]+$/.test(link.path))?.path || '/admin/orders' });
    } else if (data?.scope === 'revenue') {
      steps.push({ label: 'Đối chiếu số liệu với đơn và giao dịch đã xác nhận', path: '/admin/orders' },
        { label: 'Kiểm tra tiến độ đơn', prompt: 'Liệt kê các đơn hiện tại để kiểm tra tiến độ.', scope: 'orders', query: '' });
    } else if (data?.scope === 'support') {
      steps.push({ label: 'Mở phiếu để kiểm tra nội dung và quyết định phản hồi', path: context.links?.find(link => /^\/admin\/support-tickets\/[A-Za-z0-9-]+$/.test(link.path))?.path || '/admin/support-tickets' });
    } else if (data?.scope === 'customers') {
      steps.push({ label: 'Mở danh sách khách để kiểm tra thông tin', path: '/admin/customers' });
    } else steps.push({ label: 'Kiểm tra đơn trễ lịch hoặc cần xử lý', path: '/admin/orders?delayed=true' },
      { label: 'Tra cứu doanh thu và dòng tiền', prompt: 'Doanh thu và tiền thu ròng trong kỳ là bao nhiêu?', scope: 'revenue', query: '' });
    if (data?.totalCount === 0) steps.unshift({ label: 'Thử mã/từ khóa khác hoặc xóa bộ lọc để mở rộng kết quả.' });
  } else {
    const sections = context.sections || [];
    for (const section of sections) {
      if (role === 'customer' && section.topic === 'change_request' && section.detailUrl
        && /^\/account\/change-requests\?requestId=[A-Za-z0-9-]+$/.test(section.detailUrl) && allowedPath(section.detailUrl, role))
        steps.push({ label: 'Xem đề nghị đang chờ xử lý', path: section.detailUrl });
      for (const action of section.progress?.nextActions || []) {
        if (/customer|khách|khach/i.test(action.actor) && allowedPath(action.detailUrl, role)) steps.push({ label: action.content, path: action.detailUrl });
      }
      if (section.documents && section.documents.requiredOutstanding > 0) steps.push({ label: 'Kiểm tra các giấy tờ còn thiếu và hướng dẫn bổ sung', path: section.detailUrl || '/account/orders' });
    }
    if (role === 'customer' && (context.orderCode || sections.length || context.detailUrl?.startsWith('/account/'))) {
      steps.push({ label: 'Kiểm tra bước tiếp theo của đơn', prompt: `Tôi cần làm gì tiếp theo với ${order}?` },
        { label: 'Mở thông tin để kiểm tra trước khi gửi yêu cầu', path: context.detailUrl || sections.find(section => section.detailUrl)?.detailUrl || '/account/orders' });
    }
    for (const car of (context.contexts || []).slice(0, 2)) steps.push({ label: `Xem thông tin ${car.displayName}`, path: `/cars/${encodeURIComponent(car.carId)}` });
    if (!steps.some(step => step.prompt || step.path)) steps.push({ label: 'Làm rõ nhu cầu chọn xe', prompt: 'Giúp tôi chọn xe theo ngân sách, số chỗ và nhu cầu sử dụng.' });
    if (role === 'customer' && !steps.some(step => step.path)) steps.push({ label: 'Xem các đơn của tôi', path: '/account/orders' });
  }
  const safe = steps.filter(step => !step.path || allowedPath(step.path, role));
  if (!safe.some(step => step.path || step.prompt)) safe.push({ label: role === 'admin' ? 'Tra cứu tổng quan quản trị' : role === 'customer' ? 'Tra cứu các đơn của tôi' : 'Làm rõ nhu cầu chọn xe',
    prompt: role === 'admin' ? 'Tóm tắt tình hình đơn hàng và phiếu hỗ trợ hiện tại.' : role === 'customer' ? 'Những đơn hàng nào của tôi đang được xử lý?' : 'Giúp tôi chọn xe theo ngân sách, số chỗ và nhu cầu sử dụng.', scope: role === 'admin' ? 'overview' : undefined });
  return safe.filter((step, index) => safe.findIndex(other => other.label === step.label && other.path === step.path && other.prompt === step.prompt) === index).slice(0, 4);
}

export function NextSteps({ context, busy = false, onPrompt }: { context: NextStepContext; busy?: boolean; onPrompt?: (step: NextStep) => void }) {
  return <section className="assistant-next-steps" aria-label="Bước tiếp theo">
    <strong>Bước tiếp theo</strong>
    <ul>{nextSteps(context).map((step, index) => <li key={index}>{step.path ? <Link to={step.path}>{step.label}</Link> : step.prompt && onPrompt ? <button type="button" disabled={busy} onClick={() => onPrompt(step)}>{step.label}</button> : <span>{step.label}</span>}</li>)}</ul>
    <small>Gợi ý để bạn xem lại hoặc soạn câu hỏi. Thay đổi dữ liệu cần xác nhận riêng.</small>
  </section>;
}
