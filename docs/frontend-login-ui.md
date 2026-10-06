# Giao diện đăng nhập

- Bố cục desktop hai cột, thống nhất màu xanh và typography của các trang public. Form riêng cho khách hàng và quản trị.
- Email, mật khẩu có label và autocomplete; hiện/ẩn mật khẩu bằng nút có trạng thái aria-pressed. Không thay đổi mật khẩu khi gửi lại.
- Lỗi xác thực hiển thị trong form và nhận focus sau khi render. Lỗi dịch vụ có thao tác thử lại kết nối. Khóa gửi trùng khi request đang chạy.
- Giữ cookie, CSRF, API xác thực và routing theo vai trò. Chỉ chấp nhận returnTo nội bộ thuộc account/chat; giữ câu hỏi chat đang chờ.
- Giữ thông báo đổi mật khẩu, trạng thái đã đăng nhập và đăng xuất. Bỏ hướng dẫn demo khỏi giao diện sản phẩm; không thêm chức năng đăng ký/quên mật khẩu chưa có API.

## Kiểm tra

- Build production đạt; 40 test FE đạt.
- Hai test trình duyệt Edge ở 1440px đạt: hiện/ẩn, lỗi, focus, gửi lại; đăng nhập từ câu hỏi guest quay lại chat và giữ câu hỏi.
- Unit test bổ sung: giữ thông tin khi lỗi, retry, chặn gửi trùng, từ chối redirect ngoài, routing admin.
- Smoke test với BE local: tài khoản customer demo đăng nhập thành công và chuyển tới /account.
- Đã xem ảnh chụp desktop; chưa nghiệm thu mobile cho đợt tối ưu này. Routing admin kiểm tra bằng mock; chưa kiểm tra đăng nhập admin với BE trong đợt này.

Các thay đổi chỉ thuộc frontend, chưa commit/push.
