# Plan — US-05: Chuyển hỗ trợ cho nhân viên

Ngày 2026-10-04. Trạng thái: hoàn tất local. Tạo trước khi sửa code US-05.
Spec: [US-05](../us-05-human-handoff.md).

- Thêm ticket/reply/audit trong orders_service, code ST từ ID, owner/session, đơn/giao dịch/change request tùy chọn, subject/summary, status/version/assignedTo/timestamps. Migration có FK/check constraints.
- Tái sử dụng draft/actions US-03 với type=support, 30 phút, session/draft version và idempotency. Không có đơn vẫn gửi được. Chủ đề/tóm tắt khách sửa/lưu và xem trước; xác nhận mới tạo ticket.
- Liên kết tùy chọn được chọn trong form từ nguồn tài khoản; xác minh owner đơn, payment thuộc đơn, change request thuộc owner/đơn lúc edit và confirm. Không cho client cung cấp snapshot/session khác.
- Snapshot tối đa 3 lượt liên quan chỉ có thời điểm và topic/tool/result do server dựng, không sao chép nội dung chat tự do, summary model, số tiền, credentials hay ghi chú nội bộ. Khách xem snapshot trước khi gửi. Tóm tắt/reply loại mẫu mật khẩu/OTP/token phổ biến; UI nhắc không đưa thông tin bí mật.
- Khi khách yêu cầu nhân viên, tạo draft chủ động (chưa tạo ticket); sau 2 lượt tra cứu lỗi liên tiếp hoặc dữ liệu thiếu, đề xuất nút chuẩn bị phiếu, không tự gửi.
- Trạng thái new → in_progress → resolved → closed. Admin nhận chính mình, phản hồi công khai hoặc ghi chú nội bộ; khách trả lời resolved mở lại in_progress, closed không nhận reply. Mỗi mutation khóa ticket/version/idempotency; audit ghi cùng transaction.
- UI /account/support-tickets và /admin/support-tickets, chi tiết /:id, phân trang list/replies, khách chỉ owner/public replies, admin thấy internal. Chat chỉ điều hướng list; không đưa reply/internal notes vào model.
- Chưa có SLA: chỉ báo trạng thái, không tự hứa thời gian. Không gửi email/live chat/ứng dụng bên ngoài.

## Các bước

- [x] 1. Contracts, rules, entity/migration và store.
- [x] 2. Draft support/chat đề xuất + action confirm atomic.
- [x] 3. API và UI customer/admin.
- [x] 4. PostgreSQL tests AC1–AC8, race/version/privacy/ownership.
- [x] 5. Migration, build, UI/API smoke, regression và verification.
