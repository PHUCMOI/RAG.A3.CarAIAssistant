# US-06 — Thông báo và nhắc việc chủ động

Trạng thái: đề xuất, chưa triển khai. Thứ tự: 6. Phụ thuộc: US-01 đến US-05.

## User story

Là khách hàng, tôi muốn được thông báo khi đơn thay đổi quan trọng hoặc có việc cần làm để không phải liên tục mở chat kiểm tra.

Ví dụ: “Yêu cầu đổi lịch đã duyệt. Lịch nhận xe mới là…”

## Phạm vi

Tái sử dụng notification store/UI trong customer account. Thêm sự kiện và nhắc bàn giao trong ứng dụng; email/SMS/push bên ngoài chưa thuộc phạm vi.

Sự kiện: trạng thái đơn, lịch bàn giao, giao dịch xác nhận, hồ sơ cần bổ sung, kết quả yêu cầu thay đổi/hủy và phản hồi hỗ trợ dành cho khách.

## Thiết kế và luồng

1. Transaction cập nhật nghiệp vụ lưu event/outbox cùng dữ liệu; worker đọc và tạo notification.
2. Khóa duy nhất recipient + eventId + notificationType ngăn trùng khi retry.
3. Nhắc bàn giao mặc định đề xuất trước 24 giờ; chỉ lịch xác nhận trong tương lai và đơn chưa completed/cancelled đủ điều kiện.
4. Khi lịch đổi/hủy, vô hiệu reminder cũ và tính lại theo schedule version. Worker kiểm tra trạng thái/lịch/version lần cuối trước khi gửi.
5. Lưu timestamp UTC; tính và hiển thị giờ Việt Nam theo Asia/Ho_Chi_Minh.
6. Link mở đúng đối tượng hoặc chat với tham chiếu; chat kiểm tra quyền và truy vấn lại dữ liệu hiện tại.

Khách bật/tắt nhắc việc; thông báo nghiệp vụ vẫn theo chính sách notification hiện có. Không đưa ghi chú nội bộ vào nội dung. Worker có retry giới hạn, ghi nhận lỗi và cơ chế chạy lại, không mất sự kiện khi service restart.

## Acceptance criteria

- AC1: Mỗi sự kiện thuộc phạm vi tạo thông báo cho đúng khách, có nội dung và link chính xác.
- AC2: Retry/restart không tạo thông báo trùng hoặc làm mất event đã commit.
- AC3: Thay đổi lịch khiến reminder cũ mất hiệu lực; lịch mới được tính lại.
- AC4: Đơn completed/cancelled hoặc chưa có lịch xác nhận không được nhắc nhận xe.
- AC5: Khách tắt nhắc việc thì worker không gửi reminder; trạng thái đã đọc được lưu.
- AC6: Reminder đúng múi giờ, kiểm thử ranh giới ngày và lịch được tạo sát thời điểm giao; không gửi bù reminder đã quá hạn.
- AC7: Mở chat từ thông báo dùng dữ liệu mới, không dùng nội dung thông báo làm sự thật hiện tại.
- AC8: Phản hồi nội bộ của ticket không tạo thông báo khách; link vẫn kiểm tra quyền khi mở.
- AC9: Thông báo nghiệp vụ phát sinh theo sự kiện; không tạo thông báo lặp khi dữ liệu không đổi.

## Các bước và nghiệm thu

1. Đối chiếu notification store/settings, thêm outbox và event producer tại các luồng US trước.
2. Worker tạo notification, lên lịch reminder, retry/dedup và kiểm tra schedule version.
3. UI lựa chọn nhắc việc, đã đọc và mở đối tượng/chat.
4. Kiểm thử AC1–AC9 bằng clock kiểm soát được; kiểm thử transaction rollback, restart, đổi lịch cạnh tranh và regression US-01–05.

Bàn giao: sự kiện → notification và lịch → reminder hoạt động bền vững; tài liệu cấu hình worker cùng bằng chứng nghiệm thu.
