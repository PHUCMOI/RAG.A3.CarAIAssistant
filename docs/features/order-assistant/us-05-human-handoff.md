# US-05 — Chuyển hỗ trợ cho nhân viên

Trạng thái: hoàn tất local ngày 2026-10-04. Thứ tự: 5. Phụ thuộc: US-01 đến US-04.
Kế hoạch: [plan](us-05/plan.md). Bằng chứng: [nghiệm thu](us-05/verification.md).

## User story

Là khách hàng, tôi muốn chuyển vấn đề cho nhân viên kèm thông tin đã trao đổi để không phải kể lại từ đầu.

Ví dụ: “Tôi đã chuyển tiền nhưng chưa cập nhật, nhờ nhân viên kiểm tra.”

## Phạm vi

Phiếu hỗ trợ nội bộ, màn hình khách xem và admin tiếp nhận/phản hồi. Chưa tích hợp live chat, email hoặc ứng dụng nhắn tin ngoài hệ thống.

## Luồng

1. Khách yêu cầu gặp nhân viên, hoặc assistant đề xuất khi không giải quyết được/hai lượt liên tiếp gặp lỗi tra cứu.
2. Hỏi bổ sung vấn đề; liên kết đơn/giao dịch/request khi có và kiểm tra quyền từng đối tượng.
3. Hiển thị tóm tắt và cho khách sửa/xác nhận bằng cơ chế draft của US-03.
4. Tạo phiếu và phần lịch sử liên quan; trả mã, trạng thái và link.
5. Admin nhận, cập nhật trạng thái, phản hồi; khách xem kết quả trong tài khoản.

## Thiết kế triển khai

- Entity đề xuất SupportTicket: owner, code, subject, summary, liên kết nghiệp vụ, status, assignedTo, timestamps, version.
- Status: new → in_progress → resolved → closed; cho phép resolved → in_progress nếu khách phản hồi trước khi đóng.
- Replies lưu author, nội dung, thời điểm và visibility; ghi chú nội bộ chỉ admin thấy.
- Lưu snapshot các lượt hội thoại liên quan, không sao chép toàn bộ lịch sử không cần thiết; loại thông tin bí mật.
- Tái sử dụng draft/idempotency/audit; không hứa SLA nếu chưa cấu hình quy trình thực tế.
- API khách giới hạn owner; admin theo quyền nghiệp vụ hiện có. Route cụ thể chốt theo router hiện tại.

## Acceptance criteria

- AC1: Khách yêu cầu hỗ trợ được bất kỳ lúc nào, kể cả chưa có đơn.
- AC2: Đề xuất chuyển tiếp không tự tạo phiếu; phải có xác nhận.
- AC3: Phiếu có vấn đề, tóm tắt và liên kết đúng; khách xem/sửa tóm tắt trước khi gửi.
- AC4: Replay và double-click chỉ tạo một phiếu.
- AC5: Admin tiếp nhận/phản hồi; khách đọc và trả lời được trong tài khoản.
- AC6: Người khác không đọc phiếu; ghi chú nội bộ không xuất hiện ở API/chat khách.
- AC7: Lịch sử đính kèm không lấy từ session của khách khác hoặc chứa thông tin bí mật.
- AC8: Nếu chưa có SLA, trả trạng thái tiếp nhận mà không tự hứa thời gian xử lý.

## Các bước và nghiệm thu

1. Thêm ticket/reply/audit, transition rules và phân quyền.
2. Tích hợp draft chat, tạo phiếu và tra cứu trạng thái.
3. Tạo UI khách/admin và cảnh báo chuyển tiếp khi phù hợp.
4. Kiểm thử AC1–AC8, transition cạnh tranh/version conflict và DB migration; regression các US trước.

Bàn giao: hành trình gửi → tiếp nhận → phản hồi → khách xem, làm nguồn sự kiện cho US-06.
