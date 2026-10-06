import { NavLink } from "react-router-dom";
import { useRef, useState } from "react";

const links = [
  ["/", "Trang chủ"],
  ["/cars", "Dữ liệu xe"],
  ["/search-image", "Tìm bằng ảnh 📷"],
  ["/compare", "So sánh"],
  ["/dealers", "Đại lý"],
  ["/chat", "Trợ lý AI"],
  ["/account", "Tài khoản"],
];

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <header className="site-header" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
      <NavLink className="logo" to="/" aria-label="AutoWise home">
        <span>A</span>AutoWise
      </NavLink>
      <button ref={trigger} className="mobile-menu-button mini-button" aria-expanded={open} aria-controls="public-navigation" onClick={() => setOpen(!open)}> {open ? "Đóng menu" : "Mở menu"}</button>
      <nav id="public-navigation" className={`main-nav${open ? " mobile-open" : ""}`} aria-label="Điều hướng chính" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}>
            {label}
          </NavLink>
        ))}
      </nav>
      <NavLink className="header-cta" to="/account">
        Tài khoản <span>→</span>
      </NavLink>
    </header>
  );
}
