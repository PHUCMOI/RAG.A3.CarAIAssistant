import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useOrdersSession } from '../../features/orders/Session';
import { request } from '../../features/orders/api';
import './header.css';
import { ChevronDown } from './ChevronDown';
type LinkItem = readonly [string, string];
const publicLinks: LinkItem[] = [['/', 'Trang chủ'], ['/cars', 'Khám phá xe'], ['/compare', 'So sánh'], ['/dealers', 'Đại lý'], ['/chat', 'Trợ lý AI']];
const requests: LinkItem[] = [['/admin/purchase-requests', 'Yêu cầu mua xe'], ['/admin/change-requests', 'Đề nghị thay đổi']];
const care: LinkItem[] = [['/admin/appointments', 'Lịch hẹn'], ['/admin/support-tickets', 'Phiếu hỗ trợ']];
const account: LinkItem[] = [['/account', 'Tổng quan tài khoản'], ['/account/orders', 'Đơn hàng của tôi'], ['/account/favorites', 'Xe yêu thích'], ['/account/profile', 'Thông tin cá nhân'], ['/account/security', 'Bảo mật']];
export function AppHeader({ admin = false }: { admin?: boolean }) {
  const { user, refresh } = useOrdersSession();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(null); setMobile(false); }, [pathname, search]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(null); setMobile(false); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const matches = (path: string) => path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');
  const close = () => { setOpen(null); setMobile(false); };
  async function logout() {
    if (busy) return;
    setError(''); setBusy(true);
    try { await request('/auth/logout', 'POST'); await refresh(); close(); navigate(admin ? '/admin/login' : '/login', { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể đăng xuất. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  function group(id: string, label: ReactNode, items: LinkItem[], personal = false) {
    const expanded = open === id;
    const active = items.some(([to]) => matches(to));
    return <div className={`header-group${personal ? ' header-personal' : ''}`} onKeyDown={event => {
      if (event.key === 'Escape' && expanded) { event.stopPropagation(); setOpen(null); event.currentTarget.querySelector('button')?.focus(); }
    }}>
      <button type="button" className={`header-group-trigger${active ? ' active' : ''}`} aria-label={personal ? admin ? 'Quản trị viên' : 'Tài khoản' : undefined} aria-expanded={expanded} aria-controls={`header-${id}`} onClick={() => setOpen(expanded ? null : id)}>
        {label}<ChevronDown className="header-chevron" />
      </button>
      <div className="header-dropdown" id={`header-${id}`} hidden={!expanded}>
        {personal && <div className="header-user-summary"><strong>{user?.displayName}</strong><small>{admin ? 'Quản trị viên' : 'Tài khoản khách hàng'}</small></div>}
        {items.map(([to, name]) => <NavLink key={to} to={to} end={to === '/account'} onClick={close}>{name}</NavLink>)}
        {personal && <button className="header-logout" disabled={busy} onClick={() => void logout()}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>}
      </div>
    </div>;
  }
  return <>
    <header ref={root} className={`site-header app-header${admin ? ' admin-header' : ''}`} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(null); setMobile(false); }
    }} onKeyDown={event => { if (event.key === 'Escape' && mobile) { close(); mobileTrigger.current?.focus(); } }}>
      <NavLink className="logo" to={admin ? user ? '/admin/orders' : '/admin/login' : '/'} aria-label={admin ? 'AutoWise quản trị' : 'AutoWise trang chủ'} onClick={close}><span>A</span>AutoWise{admin && <small className="header-admin-badge">Quản trị</small>}</NavLink>
      {(!admin || user) && <>
        <button ref={mobileTrigger} className="mobile-menu-button mini-button" aria-expanded={mobile} aria-controls="header-navigation" onClick={() => setMobile(!mobile)}>{mobile ? 'Đóng menu' : 'Mở menu'}</button>
        <nav id="header-navigation" className={`main-nav${mobile ? ' mobile-open' : ''}`} aria-label={admin ? 'Điều hướng quản trị' : 'Điều hướng chính'}>
          {admin ? <><NavLink to="/admin/orders" onClick={close}>Đơn hàng</NavLink>{group('requests', 'Yêu cầu', requests)}{group('care', 'Chăm sóc', care)}<NavLink to="/admin/customers" onClick={close}>Khách hàng</NavLink></> : publicLinks.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} onClick={close}>{label}</NavLink>)}
        </nav>
        <div className="header-actions">{user ? group('account', <><span className="header-avatar" aria-hidden="true">{user.displayName?.trim().charAt(0).toUpperCase() || 'A'}</span><span className="header-account-label">{admin ? 'Quản trị viên' : 'Tài khoản'}</span></>, admin ? [] : account, true) : <NavLink className="header-cta" to="/login" onClick={close}>Đăng nhập <span aria-hidden="true">→</span></NavLink>}</div>
      </>}
    </header>
    {error && <div className="header-session-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => void logout()}>Thử lại đăng xuất</button></div>}
  </>;
}
