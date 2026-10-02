import { NavLink } from "react-router-dom";

const links = [
  ["/", "Trang chủ"],
  ["/cars", "Dữ liệu xe"],
  ["/compare", "So sánh"],
  ["/dealers", "Đại lý"],
  ["/chat", "Trợ lý AI"],
  ["/login", "Đơn hàng"],
];

export function AppHeader() {
  return (
    <header className="site-header">
      <NavLink className="logo" to="/" aria-label="AutoWise home">
        <span>A</span>AutoWise
      </NavLink>
      <nav className="main-nav" aria-label="Điều hướng chính">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {label}
          </NavLink>
        ))}
      </nav>
      <NavLink className="header-cta" to="/chat">
        Hỏi AutoWise <span>→</span>
      </NavLink>
    </header>
  );
}
