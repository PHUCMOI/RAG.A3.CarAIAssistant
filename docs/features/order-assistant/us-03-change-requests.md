# US-03 — Tạo yêu cầu thay đổi trong chat

Trạng thái: hoàn tất local ngày 2026-10-04. Thứ tự: 3. Phụ thuộc: US-01, US-02.
Kế hoạch: [plan](us-03/plan.md). Bằng chứng: [nghiệm thu](us-03/verification.md).

## User story

Là khách hàng, tôi muốn gửi yêu cầu đổi lịch bàn giao hoặc hủy đơn qua trợ lý để không phải chuyển nhiều màn hình.

Ví dụ: “Tôi muốn đổi lịch nhận xe sang ngày 15/10/2026.”

## Phạm vi

Tạo yêu cầu chờ admin xét duyệt bằng module change requests hiện có. Trợ lý không tự hủy đơn, đổi lịch đã xác nhận hay hoàn tiền. Chưa bao gồm đổi giá hoặc đặt đơn mới.

## Luồng

1. Xác định loại yêu cầu và đơn; kiểm tra quyền và trạng thái hợp lệ.
2. Thu thập ngày/giờ mong muốn cho đổi lịch, lý do cho cả hai loại; hỏi rõ ngày tương đối hoặc mơ hồ.
3. Lưu draft phía server và hiển thị tóm tắt, nút sửa, hủy và xác nhận gửi.
4. Khi xác nhận, backend kiểm tra lại quyền, version, điều kiện nghiệp vụ và nội dung draft.
5. Tạo yêu cầu một lần, trả mã/trạng thái/liên kết. Admin xử lý theo luồng hiện có.

## Thiết kế triển khai

- Tái sử dụng application service tạo change request, không gọi vòng HTTP nội bộ hoặc sao chép business rules.
- Draft có ID, owner, session, order, type, payload, version và hạn sử dụng; thời hạn mặc định đề xuất 30 phút.
- Action xác nhận mang draftId, draftVersion và requestId; không dùng một câu “đồng ý” không rõ tham chiếu để ghi dữ liệu.
- Đổi nội dung tạo version mới; xác nhận version cũ hoặc draft hết hạn yêu cầu xem lại.
- Idempotency bằng khóa duy nhất ở backend; replay trả yêu cầu đã tạo.
- Lưu audit người gửi, thời điểm và nội dung; tạo request/audit trong transaction.

## Acceptance criteria

- AC1: Thiếu ngày hoặc lý do thì hỏi bổ sung; không tạo request sớm.
- AC2: Chỉ tạo sau thao tác xác nhận cụ thể cho draft đang hiển thị.
- AC3: Khách sửa hoặc bỏ draft được; draft bỏ/hết hạn không tạo request.
- AC4: Đơn đổi trạng thái trước khi xác nhận phải được kiểm tra lại và giải thích nếu không còn hợp lệ.
- AC5: Retry, double-click hoặc replay không tạo yêu cầu trùng.
- AC6: Thành công trả mã và trạng thái chờ xử lý; admin thấy và xử lý được yêu cầu.
- AC7: Không trực tiếp sửa lịch, trạng thái, thanh toán; yêu cầu không hỗ trợ được giải thích và dẫn tới hỗ trợ.
- AC8: Người khác không xem hoặc xác nhận được draft/request của khách.

## Các bước và nghiệm thu

1. Đối chiếu enum/change request service hiện có, chốt validation đổi lịch và hủy đơn.
2. Thêm draft, action xác nhận và audit/idempotency.
3. UI thẻ tóm tắt, sửa/hủy/xác nhận và liên kết kết quả.
4. Kiểm thử AC1–AC8, race khi đơn đổi trạng thái và lỗi mạng; kiểm tra migration với DB thực nếu thêm bảng.

Bàn giao: hành trình chat → request → admin xử lý; regression US-01/02 đạt.
