# Kiểm thử chat nhiều chủ đề — 07/10/2026

Môi trường: Edge có cửa sổ, frontend và API Docker thật; tài khoản customer2 và guest. Không mock API.

## Issue đã sửa

1. Gửi ảnh rồi hỏi “So sánh xe đó với Toyota RAV4” trả needs_clarification: frontend giới hạn carIds ở một xe, loại xe so sánh còn lại. Đã giữ tên xe trong câu hỏi ngữ cảnh nhưng không giới hạn carIds cho so sánh. Tái kiểm tra trả status ok và evidence cho cả CR-V/RAV4.
2. Sau khi hỏi đơn hàng, “xe đó bảo hành bao lâu?” có thể bị phân luồng sang đơn. Đã ưu tiên tham chiếu xe/ảnh khi không có dấu hiệu đơn rõ ràng; test hồi quy xác nhận.

## Kiểm tra

- Customer/guest: hỏi xe rõ tên, hỏi tiếp “xe đó”, gửi ảnh và hỏi tiếp xe trong ảnh.
- Customer: hỏi đơn chưa có ngữ cảnh, trả lời mã đơn, hỏi thanh toán không nhắc mã.
- Đổi sang tư vấn xe rồi quay lại lịch giao của đơn lúc nãy.
- Guest hỏi đơn: yêu cầu đăng nhập.
- Build production đạt; 57 test frontend đạt.
- Các báo cáo JSON, screenshot và trace ở frontend/test-results/live-mixed-chat, live-mixed-extra; ca ảnh/so sánh ở integrated-image-chat.cjs.

Giới hạn: kiểm tra dùng mẫu xe có trong dataset. Chưa kiểm tra mọi cách diễn đạt tiếng Việt, nhiều xe cùng một ảnh hoặc chất lượng tư vấn cho mẫu xe ngoài catalogue. Ngữ cảnh xe hiện theo kết quả catalogue trong tab; chưa đồng bộ lịch sử xe/ảnh giữa thiết bị.
