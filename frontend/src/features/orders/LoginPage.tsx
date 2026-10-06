import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, request, type User } from './api';
import { useOrdersSession } from './Session';
import './login.css';

export function LoginPage({ admin = false }: { admin?: boolean }) {
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '';
  const target = /^\/(?:account(?:\/|[?#]|$)|chat(?:[?#]|$))/.test(returnTo) && !returnTo.includes('\\') ? returnTo : '/account';
  const { user, refresh, error: serviceError } = useOrdersSession();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setError(''); setBusy(true);
    try {
      const result = await request<User>('/auth/login', 'POST', { email: String(form.get('email')).trim(), password: form.get('password') });
      setVisible(false);
      await refresh();
      navigate(result.role === 'Admin' ? '/admin/orders' : target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.' : err instanceof Error ? err.message : 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try { await request('/auth/logout', 'POST'); setVisible(false); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể đăng xuất. Hãy thử lại.'); }
    finally { setBusy(false); }
  }
  return <div className="page login-page">
    <section className="login-intro" aria-labelledby="login-intro-title">
      <span className="login-eyebrow">AUTOWISE · {admin ? 'QUẢN TRỊ' : 'TÀI KHOẢN CỦA BẠN'}</span>
      <h2 id="login-intro-title">{admin ? <>Quản lý tập trung.<br /><em>Vận hành rõ ràng.</em></> : <>Hành trình mua xe.<br /><em>Luôn trong tầm tay.</em></>}</h2>
      <p>{admin ? 'Truy cập công cụ quản lý đơn hàng, lịch hẹn và yêu cầu hỗ trợ.' : 'Đăng nhập để theo dõi đơn hàng và trao đổi với trợ lý AI về chiếc xe của bạn.'}</p>
      <div className="login-benefits">
        {(admin ? [['01', 'Đơn hàng & giao dịch', 'Theo dõi tiến độ và thông tin thanh toán.'], ['02', 'Lịch hẹn & hỗ trợ', 'Tiếp nhận yêu cầu từ khách hàng.']] : [['01', 'Theo dõi đơn mua xe', 'Xem thanh toán, tiến độ và lịch bàn giao.'], ['02', 'Trợ lý AI đồng hành', 'Tra cứu thông tin đơn hàng ngay trong hội thoại.']]).map(([number, title, description]) => <div key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></div>)}
      </div>
      {!admin && <Link className="login-explore" to="/cars">Tiếp tục khám phá xe <span aria-hidden="true">↗</span></Link>}
    </section>
    <section className="login-card" aria-labelledby="login-title">
      <span className="login-mark" aria-hidden="true">A</span>
      <h1 id="login-title">{user ? 'Bạn đã đăng nhập' : admin ? 'Đăng nhập quản trị' : 'Chào mừng trở lại'}</h1>
      <p className="login-description">{user ? `Xin chào, ${user.displayName}.` : 'Sử dụng email và mật khẩu tài khoản AutoWise.'}</p>
      {params.get('passwordChanged') === '1' && <p className="login-notice" role="status">Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.</p>}
      {serviceError && <div className="login-notice" role="alert">{serviceError} <button type="button" onClick={() => void refresh()}>Thử lại kết nối</button></div>}
      {user ? <div className="login-account-actions"><Link className="button" to={user.role === 'Admin' ? '/admin/orders' : target}>Tiếp tục vào tài khoản →</Link><button className="button secondary" disabled={busy} onClick={() => void logout()}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></div> : <form className="login-form" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" name="email" type="email" autoComplete="username" placeholder="ban@example.com" required readOnly={busy} />
        <label htmlFor="login-password">Mật khẩu</label>
        <div className="login-password"><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu của bạn" required readOnly={busy} /><button type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ẩn' : 'Hiện'}</button></div>
        {error && <div className="login-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
        <button className="button login-submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}<span aria-hidden="true">{busy ? '…' : '→'}</span></button>
        <p className="login-credentials-help">Nếu chưa có tài khoản hoặc quên mật khẩu, hãy liên hệ nhân viên phụ trách đơn hàng để được hỗ trợ.</p>
      </form>}
      {user && error && <div className="login-error" role="alert">{error}</div>}
      {!admin && <p className="login-guest-note">Bạn vẫn có thể <Link to="/chat">tư vấn xe với trợ lý AI</Link> mà chưa cần đăng nhập.</p>}
    </section>
  </div>;
}
