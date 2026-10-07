import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './chat.css'
import { ImageIcon } from '../../shared/components/ImageIcon'

export function ChatLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else if (dialog.current?.open) dialog.current.close()
  }, [open])
  return <div className="assistant-shell">
    <aside className="assistant-sidebar">{sidebar}</aside>
    <dialog ref={dialog} className="assistant-history-dialog" aria-label="Lịch sử hội thoại" onClose={() => { setOpen(false); trigger.current?.focus() }} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <button className="assistant-close" aria-label="Đóng lịch sử" onClick={() => setOpen(false)}>×</button>
      <div className="assistant-sidebar" onClick={e => { if ((e.target as HTMLElement).closest('[data-close-history]')) setOpen(false) }}>{sidebar}</div>
    </dialog>
    <section className="assistant-workspace" aria-label="Trợ lý AutoWise">
      <header className="assistant-header"><button ref={trigger} className="assistant-history-toggle" onClick={() => setOpen(true)} aria-label="Lịch sử" aria-haspopup="dialog" aria-expanded={open}>☰ <span>Lịch sử</span></button><div><strong>AutoWise Assistant</strong><small>Tư vấn xe · Hỗ trợ đơn hàng</small></div><Link to="/search-image" className="assistant-image-link"><ImageIcon /><span>Tìm xe bằng ảnh</span><span aria-hidden="true">↗</span></Link></header>
      {children}
    </section>
  </div>
}

export function ChatSidebar({ busy, onNew, children, customer = false }: { busy: boolean; onNew: () => void; children?: ReactNode; customer?: boolean }) {
  return <><button className="assistant-new" disabled={busy} onClick={onNew} data-close-history>+ Hội thoại mới</button><span className="assistant-sidebar-label">HỘI THOẠI</span><div className="assistant-history-list">{Children.toArray(children).length ? children : <p>Chưa có hội thoại.<br />Bắt đầu bằng một câu hỏi bên cạnh.</p>}</div><div className="assistant-sidebar-footer"><span className="assistant-avatar">A</span><div><strong>Trợ lý của bạn</strong><small>Tư vấn xe lưu trong tab này.</small><Link to={customer ? '/account/orders' : '/login?returnTo=%2Fchat'}>{customer ? 'Xem đơn của tôi →' : 'Đăng nhập tài khoản →'}</Link></div></div></>
}

export function ChatWelcome({ onPrompt, busy, customer = false }: { onPrompt: (value: string, topic?: 'cars' | 'orders') => void; busy: boolean; customer?: boolean }) {
  const prompts = [
    ['↗', 'Tìm chiếc xe phù hợp', 'Tư vấn SUV 5 chỗ dưới 1 tỷ'],
    ['⇄', 'So sánh trước khi chọn', 'So sánh Honda CR-V và Mazda CX-5'],
    ['⌖', 'Tìm đại lý gần bạn', 'Đại lý Toyota tại Hà Nội'],
    ['◷', customer ? 'Theo dõi đơn hàng' : 'Tìm hiểu bảo hành', customer ? 'Tiến độ đơn hàng của tôi thế nào?' : 'Xe Toyota được bảo hành như thế nào?'],
  ]
  return <div className="assistant-welcome"><span className="assistant-welcome-mark">A<span>✦</span></span><h1>Trợ lý AI của bạn.</h1><p>Bạn đang tìm chiếc xe nào?<br />Cùng AutoWise tìm lựa chọn phù hợp và giải đáp mọi thắc mắc.</p><div className="assistant-prompts">{prompts.map(([icon, title, question]) => <button key={title} disabled={busy} onClick={() => onPrompt(question, customer && title === 'Theo dõi đơn hàng' ? 'orders' : 'cars')}><span>{icon}</span><strong>{title}</strong><small>{question}</small></button>)}</div><Link className="assistant-welcome-image" to="/search-image"><ImageIcon /><span>Chưa biết tên xe? Tìm bằng ảnh</span><span aria-hidden="true">↗</span></Link></div>
}

export function ThinkingMessage({ question }: { question: string }) {
  return <>{question && <article className="order-chat-message user"><strong>Bạn</strong><p>{question}</p></article>}<div className="assistant-thinking" role="status"><span className="assistant-avatar">A</span><span>Đang tìm câu trả lời<span className="assistant-dots">…</span></span></div></>
}
