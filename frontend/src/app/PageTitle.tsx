import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const titles: [string, string][] = [
  ['/admin/assistant', 'Trợ lý AI quản trị'],
  ['/admin/login', 'Đăng nhập quản trị'],
  ['/admin/orders/new', 'Tạo đơn hàng'],
  ['/admin/orders', 'Quản lý đơn hàng'],
  ['/admin/purchase-requests', 'Yêu cầu mua xe'],
  ['/admin/change-requests', 'Yêu cầu thay đổi đơn'],
  ['/admin/appointments', 'Quản lý lịch hẹn'],
  ['/admin/customers', 'Quản lý khách hàng'],
  ['/admin/support-tickets', 'Phiếu hỗ trợ'],
  ['/admin', 'Quản trị'],
  ['/account', 'Tài khoản của tôi'],
  ['/login', 'Đăng nhập'],
  ['/cars', 'Khám phá xe'],
  ['/compare', 'So sánh xe'],
  ['/dealers', 'Tìm đại lý'],
  ['/search-image', 'Tìm xe bằng ảnh'],
  ['/chat', 'Trợ lý AI'],
  ['/sources', 'Nguồn tham khảo'],
];

export function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = titles.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1];
    document.title = title ? `${title} · AutoWise` : 'AutoWise · Tư vấn và khám phá ô tô';
  }, [pathname]);
  return null;
}
