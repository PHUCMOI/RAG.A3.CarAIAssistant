# Plan — US-03: Tạo yêu cầu trong chat

Ngày: 2026-10-04. Trạng thái: hoàn tất local. Đã tạo file này trước khi sửa code US-03.
Spec: [US-03](../us-03-change-requests.md). Phụ thuộc: US-01/02 đã nghiệm thu.

## Hiện trạng và quyết định

- CustomerAccountStore.Change đang khóa đơn, kiểm tra quyền/trạng thái và giới hạn một yêu cầu pending mỗi đơn. Admin quyết định approved/rejected; không tự sửa lịch, hủy đơn hoặc hoàn tiền.
- Tách phần tạo ChangeRecord trong transaction thành service dùng chung cho endpoint hiện có và action xác nhận của assistant; không lặp business rules hoặc gọi vòng HTTP nội bộ.
- Draft và audit lưu trong Context JSONB của session hiện có, dưới khóa session. Draft có owner/session/order, loại cancel/reschedule, ngày/giờ, lý do, version, orderVersion, expiresAt (30 phút), trạng thái và liên kết request khi gửi. Không thêm bảng/migration.
- Chat chỉ thu thập/chuẩn bị draft. Xác nhận, sửa và bỏ draft là endpoint action riêng mang requestId, sessionVersion, draftId, draftVersion. Không thực thi từ câu “đồng ý”.
- Ngày phải rõ dd/MM/yyyy hoặc yyyy-MM-dd, không suy đoán ngày tương đối/mơ hồ; thời gian tùy chọn HH:mm, không tự đặt giờ. Form trong chat cho khách sửa và bổ sung thông tin còn thiếu trước khi xác nhận.
- Lưu ngày/giờ mong muốn vào Reason của module yêu cầu hiện có theo định dạng do server dựng, kèm lý do khách; admin đọc được trong UI hiện có. Mã CR được suy ra từ ID, không cần cột mới. Link requestId lọc đúng yêu cầu của khách.
- Confirm dùng JourneyTransactions.Run: replay theo user/requestId, khóa session rồi khóa đơn, kiểm tra lại orderVersion/quyền/trạng thái và pending request; request, audit và session commit cùng transaction.
- Khi đơn đổi version, khách phải sửa/lưu lại draft và xem nội dung mới trước khi xác nhận; đơn kết thúc không thể gửi. Bản nháp bỏ/hết hạn hoặc version cũ không tạo request.
- Các yêu cầu mutation khác vẫn chỉ được giải thích và dẫn đến trang yêu cầu/liên hệ đại lý; US-05 hỗ trợ nhân viên chưa có.

## Các bước

- [x] 1. Hợp đồng draft/actions/audit và parser ngày/lý do; kiểm thử hết hạn bằng timestamp lưu trong DB.
- [x] 2. Refactor service Change dùng chung; draft prepare/edit/discard/confirm và transaction/replay.
- [x] 3. Tích hợp chat chuẩn bị draft, API actions và link yêu cầu chính xác.
- [x] 4. UI thông tin thiếu, tóm tắt, sửa/bỏ/xác nhận, trạng thái hết hạn/gửi thành công; UI admin/customer hiện có đọc yêu cầu.
- [x] 5. Test AC1–AC8 với PostgreSQL: thiếu dữ liệu, expired, stale version, đổi trạng thái, người khác, double-click/race/replay, rollback; đơn/thanh toán không bị sửa.
- [x] 6. Regression C#/PostgreSQL, frontend build, Docker/UI/API smoke, verification.md và cập nhật spec.

## Nghiệm thu

Chỉ button/action xác nhận hợp lệ mới tạo một yêu cầu pending. Đổi/hủy chỉ là đề nghị chờ admin; không thực hiện nghiệp vụ trên đơn. Retry sau mất response trả lại request đã tạo. Mọi trường hợp không hợp lệ không để lại request/audit submitted. Hoàn tất US-03 trước khi bắt đầu US-04.
