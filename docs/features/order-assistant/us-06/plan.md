# US-06 — Thông báo chủ động

## Phạm vi và thứ tự triển khai

1. Thêm transactional outbox, loại thông báo, liên kết chat, tùy chọn nhắc lịch và migration. Mỗi sự kiện có khóa duy nhất theo khách + event + loại; ghi cùng transaction nghiệp vụ.
2. Chuyển các producer hiện có sang outbox; thêm sự kiện trạng thái đơn, lịch giao, giao dịch xác nhận, hồ sơ cần bổ sung, quyết định đề nghị và phản hồi hỗ trợ công khai. Nội dung lấy từ trường công khai, không lấy lý do nội bộ/history hoặc nội dung ghi chú hỗ trợ.
3. Worker xử lý batch có khóa hàng, tạo notification và đánh dấu outbox trong cùng transaction. Retry backoff tối đa 5 lần; lưu mã lỗi an toàn, API admin đọc lỗi và chạy lại. Không phát thông báo lặp khi dữ liệu nghiệp vụ không đổi.
4. Nhắc lịch dùng version lịch riêng. Vì mô hình chỉ có ngày giao, quy ước nhắc lúc 08:00 Asia/Ho_Chi_Minh ngày trước ngày giao (24 giờ trước mốc 08:00 ngày giao). Chỉ xếp lịch nếu mốc nhắc còn ở tương lai; không gửi bù lịch tạo muộn. Worker chỉ gửi trong cửa sổ 5 phút và kiểm tra lại order/date/version/confirmed/trạng thái/tùy chọn ngay trước khi phát. Lịch cũ bị hủy khi đổi/hủy, không quét phát lặp định kỳ. Không tự backfill lịch legacy.
5. UI có bật/tắt nhắc lịch, làm mới, đánh dấu đã đọc và link chat gắn orderId. Chat xác minh quyền và đọc lại dữ liệu hiện tại, không dùng nội dung thông báo làm bằng chứng.
6. Kiểm thử clock cố định, timezone, rollback, dedup/restart/retry, đổi lịch/hủy/tùy chọn/quyền truy cập/public reply. Chạy regression, build API/frontend, kiểm migration và smoke UI; ghi kết quả vào verification.md và cập nhật README.

## Chính sách vận hành

- Chỉ in-app; không email, SMS hoặc push.
- Thông báo nghiệp vụ vẫn hoạt động khi tắt nhắc lịch. Bật lại không gửi bù các mốc nhắc đã qua.
- Worker dùng UTC; ngày kinh doanh và hiển thị dùng Asia/Ho_Chi_Minh.
- Admin retry không bỏ qua kiểm tra hiệu lực của reminder. Worker lỗi không làm mất sự kiện đã commit.
- Giữ nguyên dữ liệu demo và thay đổi US01–05; dùng fixture riêng cho kiểm thử.

## Trạng thái

- [x] Đọc spec và khảo sát producer/transaction/UI hiện tại.
- [x] Schema, outbox, worker và producer.
- [x] API/UI tùy chọn và liên kết chat.
- [x] Kiểm thử, migration, build, smoke và tài liệu kết quả.
