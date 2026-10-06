import { Link } from 'react-router-dom';
import { useOrdersSession } from '../orders/Session';
import { statuses, type Page as OrderPage } from '../orders/api';
import { useData } from './shared';
import { formatVnd } from '../../shared/formatting/currency';
import { formatDate } from '../../shared/formatting/date';
import './account-home.css';

type IconName = 'orders' | 'bell' | 'heart' | 'calendar' | 'chat' | 'request' | 'profile' | 'shield';
const paths: Record<IconName, string> = {
  orders: 'M8 3h8v4H8z M8 5H5v16h14V5h-3 M9 12h6 M9 16h4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  calendar: 'M5 5h14v16H5z M8 3v4 M16 3v4 M5 10h14 M8 14h2 M14 14h2 M8 17h2',
  chat: 'M4 4h16v12H9l-5 4V4Z M8 8h8 M8 12h5',
  request: 'M5 4h14v16H5z M8 8h8 M8 12h5 M13 17h8 M17 13v8',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M4 21v-2a8 8 0 0 1 16 0v2',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z m-4 9 3 3 5-6',
};
function Icon({ name }: { name: IconName }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>; }
function DataProblem({ retry }: { retry: () => void }) { return <div className="account-data-problem" role="alert">Chưa tải được dữ liệu. <button type="button" onClick={retry}>Thử lại</button></div>; }

export function AccountHome() {
  const { user } = useOrdersSession();
  const orders = useData<OrderPage>('/my/orders?page=1&pageSize=3');
  const notices = useData<{ count: number }>('/my/notifications/unread-count');
  const favorites = useData<unknown[]>('/my/favorites');
  const metrics = [
    { title: 'Đơn mua xe', icon: 'orders' as const, value: orders.data?.totalCount, state: orders, to: '/account/orders', caption: 'Theo dõi giao dịch của bạn' },
    { title: 'Thông báo chưa đọc', icon: 'bell' as const, value: notices.data?.count, state: notices, to: '/account/notifications', caption: notices.data?.count === 0 ? 'Bạn đã xem hết thông báo' : 'Xem cập nhật từ AutoWise' },
    { title: 'Xe yêu thích', icon: 'heart' as const, value: Array.isArray(favorites.data) ? favorites.data.length : undefined, state: favorites, to: '/account/favorites', caption: 'Những mẫu xe bạn đã lưu' },
  ];
  return <div className="page account-home">
    <header className="account-home-intro"><div><span className="account-home-kicker">KHÔNG GIAN CỦA BẠN</span><h1>Xin chào, {user?.displayName || 'bạn'}.</h1><p>Theo dõi hành trình mua xe, mọi thông tin ở cùng một nơi.</p></div><Link className="account-profile-link" to="/account/profile"><span className="account-home-avatar" aria-hidden="true">{user?.displayName?.trim().charAt(0).toUpperCase() || 'A'}</span><span><strong>Hồ sơ của bạn</strong><small>Cập nhật thông tin cá nhân</small></span><span aria-hidden="true">↗</span></Link></header>
    <div className="account-metrics">{metrics.map(metric => <section className="account-metric" key={metric.to} aria-label={metric.title}><div className="account-metric-heading"><span className="account-feature-icon"><Icon name={metric.icon} /></span><Link to={metric.to} aria-label={`Xem ${metric.title.toLowerCase()}`}><span aria-hidden="true">↗</span></Link></div><h2>{metric.title}</h2>{metric.state.error ? <DataProblem retry={metric.state.reload} /> : <><strong className="account-metric-value" aria-busy={!metric.state.data}>{metric.value ?? '—'}</strong><p>{metric.state.data ? metric.caption : 'Đang tải…'}</p></>}</section>)}</div>
    <div className="account-overview-grid">
      <section className="account-orders-panel" aria-labelledby="account-orders-title"><div className="account-panel-heading"><div><h2 id="account-orders-title">Đơn hàng của bạn</h2><p>Tóm tắt tối đa 3 đơn hàng.</p></div><Link to="/account/orders">Xem tất cả <span aria-hidden="true">↗</span></Link></div>
        {orders.error ? <DataProblem retry={orders.reload} /> : !orders.data ? <div className="account-order-loading" role="status">Đang tải đơn hàng…</div> : !orders.data.items.length ? <div className="account-orders-empty"><span className="account-feature-icon"><Icon name="orders" /></span><h3>Bắt đầu hành trình mua xe</h3><p>Bạn chưa có đơn hàng. Khám phá xe hoặc gửi yêu cầu để được tư vấn.</p><Link className="button" to="/cars">Khám phá xe <span aria-hidden="true">→</span></Link></div> : <ul className="account-recent-orders">{orders.data.items.slice(0, 3).map(order => <li key={order.id}><Link to={`/account/orders/${encodeURIComponent(order.id)}`}><div className="account-order-top"><span className="account-order-code">{order.code}</span><span className={`account-order-status ${order.status === 'completed' ? 'completed' : order.status === 'cancelled' ? 'cancelled' : ''}`}>{statuses[order.status] || 'Chưa rõ trạng thái'}</span></div><h3>{order.carName || 'Chưa có tên xe'}</h3><div className="account-order-bottom"><span>{formatDate(order.createdAt)}</span><strong>{formatVnd(order.totalVnd)}</strong><span aria-hidden="true">→</span></div></Link></li>)}</ul>}
      </section>
      <aside className="account-side-panels"><section className="account-ai-panel"><span className="account-feature-icon"><Icon name="chat" /></span><span className="account-home-kicker">TRỢ LÝ AUTOWISE</span><h2>Cần một người đồng hành?</h2><p>Hỏi về xe, thanh toán hoặc lịch bàn giao ngay trong hội thoại.</p><Link to="/chat">Trò chuyện với trợ lý <span aria-hidden="true">→</span></Link></section><section className="account-security-panel"><Icon name="shield" /><div><h3>Bảo vệ tài khoản</h3><p>Quản lý mật khẩu và thông tin đăng nhập.</p><Link to="/account/security">Mở cài đặt bảo mật ↗</Link></div></section></aside>
    </div>
    <section className="account-quick-section" aria-labelledby="account-quick-title"><div className="account-panel-heading"><div><h2 id="account-quick-title">Bạn muốn làm gì tiếp theo?</h2><p>Các thao tác thường dùng trong hành trình mua xe.</p></div></div><div className="account-quick-grid">
      {([
        ['request', 'Yêu cầu & thay đổi', 'Gửi nhu cầu mua xe hoặc theo dõi đề nghị liên quan đến đơn hàng.', [['/account/purchase-requests', 'Yêu cầu mua xe'], ['/account/change-requests', 'Đề nghị thay đổi']]],
        ['calendar', 'Lịch hẹn của bạn', 'Xem lịch tư vấn, lái thử và các cuộc hẹn đã đăng ký.', [['/account/appointments', 'Quản lý lịch hẹn']]],
        ['chat', 'Thông báo & hỗ trợ', 'Cập nhật thông tin mới và theo dõi phản hồi từ nhân viên.', [['/account/notifications', 'Xem thông báo'], ['/account/support-tickets', 'Phiếu hỗ trợ']]],
      ] as [IconName, string, string, [string, string][]][]).map(([icon, title, description, links]) => <article key={title} className="account-quick-card"><span className="account-feature-icon"><Icon name={icon} /></span><h3>{title}</h3><p>{description}</p><div>{links.map(([to, label]) => <Link to={to} key={to}>{label}<span aria-hidden="true">↗</span></Link>)}</div></article>)}
    </div></section>
  </div>;
}
