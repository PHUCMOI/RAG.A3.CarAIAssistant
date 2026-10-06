# Giao diện trợ lý — 06/10/2026

- Bố cục chung cho guest/customer: sidebar lịch sử, khung hội thoại cuộn độc lập và ô nhập luôn ở đáy màn hình.
- Màn hình bắt đầu có câu hỏi gợi ý; bấm gợi ý chỉ điền nội dung, không tự gửi.
- Chủ đề và đơn hàng nằm trong thanh công cụ; giữ luồng tạo phiếu hỗ trợ và xác nhận thay đổi đơn hiện có.
- Hiển thị câu hỏi đang gửi và trạng thái chờ; lỗi giữ nội dung, cho gửi lại bằng cơ chế requestId/version cũ.
- Mobile mở lịch sử bằng dialog, hỗ trợ Escape và trả focus về nút mở. Liên kết đăng nhập luôn có ở ô chat guest.
- Giữ sessionStorage theo tài khoản, nguồn và thẻ dữ liệu từ API. Không thêm đổi tên/xóa phiên server hoặc upload ảnh.

Kiểm tra tự động dùng API mock cho retry, refresh, đăng nhập, logout, drawer lịch sử và vị trí ô nhập ở 375/768/1440 px. Đây không phải nghiệm thu toàn bộ nghiệp vụ BE; cần kiểm tra thêm thẻ thanh toán, hồ sơ, phiếu hỗ trợ và xác nhận thay đổi đơn với dữ liệu thực.

Kết quả: build đạt, 24 test Vitest đạt, 9 test trình duyệt chat đạt. Đã xem ảnh kiểm tra mobile và desktop; `/chat` tại localhost:5173 trả HTTP 200.

## Tối ưu FE desktop

- Gợi ý tự chọn đúng chủ đề xe/đơn hàng; không tự gửi.
- Cho soạn tiếp khi đang chờ, chỉ khóa nút gửi. Câu trả lời về không xóa bản nháp mới; retry câu cũ cũng giữ nội dung khác đang soạn.
- Câu hỏi lỗi nằm trong hội thoại với trạng thái chưa gửi và nút retry. Retry đơn hàng vẫn giữ requestId/version hiện có.
- Retry lịch sử/đơn hàng giữ nguyên màn hình hội thoại và ô nhập, chỉ hiện trạng thái đang cập nhật.
- Ô nhập tự giãn tối đa 132 px, có bộ đếm từ 800/1.000 ký tự. Nút tới tin mới nằm trong vùng hội thoại để không chồng lên ô nhập.
- Câu trả lời hỗ trợ Markdown cơ bản: tiêu đề, danh sách, đậm, inline code, bảng. HTML và liên kết tùy ý không được thực thi. Có sao chép kèm phản hồi thành công/lỗi.
- Nguồn dùng nhãn dễ hiểu và vẫn liên kết đúng ID API; không tự tạo tên nguồn. Lịch sử nhóm theo ngày, phiên đang mở có nhãn từ câu hỏi đầu khi có dữ liệu; phiên khác dùng nhãn tra cứu và thời gian vì API danh sách chỉ trả ID/thời gian.
- Chưa nâng cấp bố cục mobile, streaming hoặc quản lý phiên server.

Kiểm tra đợt này: 30 test FE và 4 luồng chat desktop với API mock đạt, build đạt. Kiểm tra bàn phím ảo và nghiệp vụ đơn hàng với BE thực vẫn là phần nghiệm thu riêng.
