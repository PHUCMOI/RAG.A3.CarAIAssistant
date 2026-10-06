# Tổng quan tài khoản

- Thay lưới liên kết rời rạc bằng lời chào cá nhân, lối tắt hồ sơ, ba chỉ số và các khối chức năng theo nhu cầu.
- Đơn hàng: gọi /my/orders?page=1&pageSize=3; số tổng lấy totalCount, không lấy độ dài preview. Hiển thị tối đa 3 đơn theo thứ tự API với mã, xe, trạng thái, ngày tạo và tổng giá trị; liên kết tới chi tiết và danh sách đầy đủ.
- Thông báo: dùng /my/notifications/unread-count. Xe yêu thích: dùng danh sách /my/favorites. Không tạo số liệu giả hoặc suy diễn lịch hẹn.
- Mỗi nguồn dữ liệu có loading/error/retry riêng; zero được hiển thị rõ. Khi chưa có đơn, gợi ý khám phá xe. Retry một chỉ số không tải lại toàn bộ trang.
- Gom lối tắt yêu cầu mua/thay đổi, lịch hẹn, thông báo/hỗ trợ; thêm khối trợ lý AI và bảo mật. Thanh navigation tài khoản có kiểu dáng nhẹ, dùng icon chevron chung; giữ phân quyền và các route hiện có.

## Kiểm tra

- Build đạt; 46 test FE đạt, gồm tổng từ API, dữ liệu rỗng và retry độc lập.
- Test trình duyệt desktop cho tổng quan, điều hướng header tài khoản và cache sau logout đạt.
- BE local customer: 21 đơn, 1 thông báo chưa đọc, 0 xe yêu thích; preview 3 đơn; không có lỗi JavaScript hoặc tràn ngang ở 1440px. Đã xem ảnh chụp toàn trang.
- Chưa nghiệm thu mobile trong đợt này. Không sửa backend hoặc thêm API.

Chưa commit/push.
