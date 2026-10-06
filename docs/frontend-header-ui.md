# Header customer và admin

## Điều hướng

- Customer/guest: Trang chủ, Khám phá xe, So sánh, Đại lý, Trợ lý AI. Bỏ mục Tài khoản bị lặp giữa navigation và nút bên phải.
- Guest có nút Đăng nhập. Customer có avatar, tên trong dropdown và lối tắt tới tổng quan, đơn hàng, xe yêu thích, hồ sơ, bảo mật, đăng xuất.
- Admin: Đơn hàng; Yêu cầu (mua xe, thay đổi đơn); Chăm sóc (lịch hẹn, phiếu hỗ trợ); Khách hàng. Menu quản trị viên chứa tên và đăng xuất.
- Dữ liệu và Cấu hình RAG hiện chỉ có trang khung, nên không xuất hiện trên header. Giữ các route hiện có; không triển khai thêm chức năng hoặc sửa phân quyền.

## Hành vi

- Header cùng chiều cao 72px và cách hiển thị mục đang chọn. Nhóm admin được đánh dấu theo cả route con.
- Chỉ mở một dropdown; đóng khi chọn liên kết, đổi URL, click bên ngoài hoặc focus rời header. Escape trả focus về nút mở dropdown.
- Nút mở nhóm có aria-expanded/aria-controls. Giữ menu thu gọn dưới 900px với thao tác Escape.
- Logout dùng API/CSRF và refresh session hiện có; khi lỗi giữ phiên, hiển thị thông báo và nút thử lại.

## Kiểm tra

- Build production đạt; 43 test FE đạt.
- Toàn bộ 13 test Edge desktop 1440px đạt, bao gồm điều hướng nhóm, trạng thái active, Escape/focus, đóng ngoài, tài khoản, auth guard, cache sau logout và các trang public/chat.
- Đã xem ảnh chụp header admin/customer. Chưa nghiệm thu mobile trong đợt này.
- BE local: đăng nhập customer và admin, mở menu cá nhân và đăng xuất thành công cho cả hai vai trò.

Chỉ sửa frontend; chưa commit/push.

## Sửa lỗi menu bị che trên trang tài khoản

- Header và account-nav cùng z-index 20 khiến account-nav vẽ phía trên phần đầu dropdown. Đặt stacking context của header ở 30 để toàn bộ menu nằm trên navigation phụ.
- Build đạt. Test Edge desktop kiểm tra elementFromPoint tại phần tên người dùng, click tổng quan và dropdown điều hướng tài khoản đều đạt; đã xem ảnh trang tài khoản sau sửa.

## Icon xổ xuống

- Thay ký tự ⌄ bằng component SVG ChevronDown nét mảnh, dùng chung trong header, navigation tài khoản và nhóm bộ lọc xe.
- Giữ xoay 180 độ theo trạng thái mở. Icon trang trí ẩn khỏi accessibility tree, không đổi label hoặc thao tác bàn phím.
