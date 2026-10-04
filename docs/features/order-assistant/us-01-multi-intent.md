# US-01 — Hỏi nhiều nội dung về cùng một đơn

Trạng thái: đã triển khai và nghiệm thu local ngày 2026-10-04. Thứ tự: 1. Phụ thuộc: nền tảng assistant hiện tại.

Tài liệu thực hiện: [plan.md](us-01/plan.md), [verification.md](us-01/verification.md).

## User story

Là khách hàng, tôi muốn hỏi nhiều nội dung về một đơn trong cùng tin nhắn để nhận đủ thông tin mà không phải hỏi riêng từng câu.

Ví dụ: “Đơn AW-001 đang đến đâu, còn phải trả bao nhiêu và khi nào nhận xe?”

## Phạm vi

Hỗ trợ status, payment, delivery, car và warranty trong cùng lượt, tối đa năm intent duy nhất. Một lượt chỉ xử lý một đơn. Nhiều mã đơn phải hỏi chọn đơn; chưa triển khai so sánh nhiều đơn hoặc thực hiện thay đổi.

## Luồng xử lý

1. Phân loại danh sách intent, loại trùng và kiểm tra enum tại backend.
2. Xác định đơn theo mã rõ ràng, lựa chọn hiện tại hoặc ngữ cảnh đã kiểm tra quyền.
3. Nếu đơn/chủ đề mơ hồ, lưu câu hỏi cần làm rõ cùng toàn bộ intent đang chờ.
4. Truy vấn từng nguồn và trả các phần theo thứ tự nội dung được hỏi.
5. Ghi kết quả tool và cập nhật ngữ cảnh chỉ cho phần tra cứu thành công.

## Thiết kế triển khai

- Mở rộng resolver từ intent đơn thành danh sách intent có kiểm tra schema; giữ fallback rule khi Bedrock lỗi.
- Bổ sung `sections` tùy chọn cho message: topic, content, resultStatus, retrievedAt và detailUrl do server dựng.
- Giữ `content` chứa câu trả lời đầy đủ để tương thích UI/session cũ.
- Lưu danh sách chủ đề đang trao đổi; câu “còn đơn X thì sao?” kế thừa danh sách đó khi rõ nghĩa, nếu mơ hồ thì hỏi lại.
- Giữ endpoint gửi chat hiện tại; không tạo endpoint cho từng intent.

## Acceptance criteria

- AC1: Câu hỏi ba nội dung trả đủ ba phần cho đúng đơn, không bỏ payment hoặc delivery.
- AC2: Chưa xác định được đơn thì hỏi chọn đơn; sau khi chọn, tiếp tục đầy đủ các intent đang chờ.
- AC3: “Còn bảo hành thì sao?” dùng đúng đơn đang trao đổi và chủ đề mới.
- AC4: Một nguồn lỗi không làm mất kết quả nguồn khác; phần lỗi ghi chưa xác minh.
- AC5: Mã đơn không thuộc khách không trả dữ liệu và không tiết lộ chủ sở hữu.
- AC6: Intent trùng không tạo phần trả lời trùng; output model sai định dạng dùng fallback an toàn.
- AC7: Replay cùng requestId không tạo thêm lượt; version conflict giữ nguyên draft ở UI.

## Các bước và nghiệm thu

1. Mở rộng hợp đồng resolver/context và đọc tương thích session cũ.
2. Thêm orchestration nhiều tool và fallback từng phần.
3. Render sections, liên kết và thời điểm tra cứu trong UI.
4. Kiểm thử AC1–AC7, bao gồm đổi đơn, hai mã đơn, nguồn Python lỗi và Bedrock lỗi; chạy regression assistant/context và build frontend.

Bàn giao: backend/UI hoạt động, hợp đồng được ghi lại và bằng chứng kiểm thử. US-02 sử dụng cấu trúc sections của US này.
