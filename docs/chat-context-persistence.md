# Context hội thoại thống nhất

Khách hàng đăng nhập dùng cùng một session cho câu hỏi xe, ảnh và đơn hàng.

- PostgreSQL `orders_service.chat_sessions.Payload` lưu các lượt hỏi/đáp, context xe (`carId`, `displayName`, nguồn), kết quả nhận diện và ảnh đã gửi. `Context` tiếp tục giữ đơn hiện tại, đơn trước, ý định chờ làm rõ và bản nháp.
- API mới: `POST /api/orders-service/assistant/sessions/{id}/catalogue-messages`. Backend gọi dịch vụ tư vấn xe hoặc nhận diện ảnh rồi lưu kết quả. Frontend không tự cung cấp câu trả lời hay context tin cậy.
- Context xe được lấy từ lượt trả lời có xe gần nhất. Câu hỏi nối tiếp thêm tên xe; so sánh không giới hạn truy vấn vào một xe. Context đơn vẫn được giữ khi chuyển sang xe/ảnh; dữ liệu đơn được tra cứu lại mỗi lượt.
- GET session trả về toàn bộ lịch sử. Tải lại tab khôi phục session đang mở; trên thiết bị/phiên mới chọn hội thoại trong lịch sử sau khi đăng nhập cùng tài khoản.
- Request ID chống trùng khi gửi lại; version và khóa giao dịch chống ghi đè khi nhiều tab gửi đồng thời. Session chỉ thuộc khách hàng đã tạo nó. Dịch vụ tư vấn lỗi không lưu lượt trả lời dở dang.
- sessionStorage chỉ giữ ID đang mở và câu hỏi đang soạn. Khách chưa đăng nhập vẫn giữ lịch sử cục bộ trong tab. Các câu hỏi xe/ảnh cũ chỉ có trong bộ nhớ tab chưa được tự động nhập vào database.

Ảnh hiện lưu dạng data URL trong JSONB, giới hạn 10 MB mỗi ảnh. Khi triển khai quy mô lớn nên chuyển ảnh sang object storage; không cần migration cho các trường JSON mới. Giới hạn 100 lượt/session vẫn áp dụng cho tổng lượt xe, ảnh và đơn hàng.

## Kiểm chứng

- Frontend: 57 test đạt; hai browser test desktop về tải lại/đăng xuất và soạn tin khi chờ phản hồi đạt.
- Backend: 117 test đạt, gồm integration PostgreSQL xác nhận context xe và ảnh tồn tại khi đọc lại, replay không gọi provider lần nữa, phiên bản cũ bị từ chối và không đọc session của khách khác.
- Docker và Edge có giao diện: ảnh Honda CR-V → hỏi giá → so sánh Toyota RAV4 → hỏi đơn chưa rõ → chọn mã bằng tin nhắn → hỏi thanh toán → tải lại → hỏi xe trong ảnh.
- Phiên Edge mới không có sessionStorage: đăng nhập lại, chọn session cũ, xác nhận đủ 14 tin nhắn và ảnh; hỏi tiếp về xe trong ảnh vẫn nhận đúng Honda CR-V.
