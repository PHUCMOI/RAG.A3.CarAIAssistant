# Hỏi đơn hàng trực tiếp trong chat

- Customer có thể hỏi trạng thái, thanh toán hoặc lịch giao mà không chọn dropdown trước.
- Nếu chưa xác định đơn trong hội thoại, trợ lý hỏi mã đơn, kể cả tài khoản chỉ có một đơn; không tự chọn thay khách hàng.
- Trợ lý liệt kê tối đa 20 mã đơn gần nhất để khách trả lời trong chat; không tự chọn đơn gần nhất.
- Những lượt sau tiếp tục dùng đơn của hội thoại. Mã AW-... gõ trực tiếp được ưu tiên hơn lựa chọn frontend; “đơn trước” được backend giải quyết theo ngữ cảnh.
- Không còn thanh chọn chủ đề/đơn hàng hoặc thông báo hướng dẫn trên đầu chat. Chủ đề được nhận diện tự động; liên kết từ chi tiết đơn vẫn mang ngữ cảnh đơn.
- Tất cả truy vấn giới hạn theo khách hàng đăng nhập; mã đơn không hợp lệ không được thay bằng một đơn khác.
- Khách chưa có đơn nhận thông báo chưa có đơn. Khách chưa đăng nhập vẫn cần đăng nhập để tra cứu.

Kiểm tra: test PostgreSQL cho hỏi lại khi chưa rõ đơn, hỏi tiếp, nhiều đơn/làm rõ bằng mã, phân quyền và cả hai chế độ context; test frontend cho mã đơn gõ trực tiếp ưu tiên hơn đơn từ liên kết.
