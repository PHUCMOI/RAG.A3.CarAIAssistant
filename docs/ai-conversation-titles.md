# Tên hội thoại bằng AI

Sau lượt hỏi đầu tiên, frontend gọi `POST /api/orders-service/assistant/sessions/{id}/title`. Backend lấy tối đa ba câu hỏi đầu và tên xe đã nhận diện, che mã đơn/email/chuỗi số dài, rồi gọi mô hình AI qua `/api/chat/title`. Không gửi ảnh hay các thẻ dữ liệu thanh toán tới bước đặt tên.

Tên tiếng Việt tối đa 80 ký tự được lưu vào `chat_sessions.Context.title`, kèm `titleGenerated`. Danh sách session và GET session trả tên cho sidebar. Không cần migration. Hội thoại cũ được đặt tên khi người dùng mở lại. Một khi AI đã đặt tên thành công, các lượt hỏi sau không đổi tên hoặc gọi lại mô hình.

Việc đặt tên chạy sau khi câu trả lời đã hiển thị, không thay đổi version hội thoại. Nếu mô hình không sẵn sàng, giữ nhãn chung “Hội thoại trợ lý” và thử lại khi mở hoặc gửi lượt sau. Endpoint luôn kiểm tra chủ sở hữu session; ghi metadata dùng cùng khóa giao dịch với tin nhắn để giữ nguyên context đơn và bản nháp.

Môi trường Docker demo đã bật Bedrock cho Python API bằng cấu hình AWS profile `rag-a3` có sẵn:

```powershell
docker compose -f docker-compose.yml -f docker-compose.bedrock.yml up -d --no-deps api
```

Luồng đặt tên luôn khởi tạo Bedrock riêng, không phụ thuộc `LLM_PROVIDER` hoặc `RAG_ENABLED`. Override trên cung cấp AWS profile/credentials cho container; không dùng Ollama hoặc câu hỏi đầu làm tên thay thế khi Bedrock lỗi.

Đã xác minh mô hình Bedrock thật và Edge có giao diện: hội thoại cũ có tên “So sánh các mẫu xe SUV và MPV”; hội thoại mới tự có tên “Hỏi số tiền còn phải thanh toán”. Tên xuất hiện trong sidebar và còn sau reload. Các test kiểm tra schema/AI lỗi, lưu và đọc lại tên, quyền sở hữu và chỉ tạo tên thành công một lần đều đạt.
