# Plan — US-04: Thanh toán chi tiết và hồ sơ

Ngày 2026-10-04. Trạng thái: hoàn tất local. Tạo trước khi sửa code US-04.
Spec: [US-04](../us-04-payments-documents.md).

## Quyết định từ hiện trạng

- Payment đã lưu pending/confirmed/failed trong Order JSONB. Giữ nguyên quy tắc NetReceived/Remaining, bổ sung CreatedAt và FailureReason cho giao dịch mới; giao dịch cũ thiếu thời điểm phải hiển thị chưa ghi nhận, không đoán.
- Read model thanh toán trả summary toàn bộ confirmed receipts/refunds và một trang giao dịch tối đa 20. Thu/hoàn và trạng thái tách biệt, số tổng do backend tính. Đơn cancelled chỉ thông báo khoản còn giữ/đã hoàn.
- Câu hỏi chỉ định mã giao dịch hoặc ngày rõ/hôm qua theo giờ Việt Nam sẽ lọc từ dữ liệu đã lưu. Không có giao dịch nói chưa thấy; nhiều giao dịch cùng khớp yêu cầu chọn mã, không tự chọn hay khẳng định khoản cọc đã nhận.
- Thêm bảng order_document_checklist trong orders_service, FK order, version, loại/tên, required, status (missing/pending/valid/needs_changes), customerNote, updatedAt/updatedBy. Không seed checklist chung. Admin thêm/cập nhật từng mục, optimistic concurrency và idempotency, giới hạn 100 mục/đơn. Không upload/OCR.
- Chưa có kho chứng từ hoặc quyền chia sẻ file: mọi giao dịch trả documentUrl=null và nói chưa có chứng từ. Không tạo link file giả hoặc nhận URL tùy ý. API đọc chi tiết giao dịch và checklist kiểm tra owner ở mỗi lần mở; URL không tồn tại trả 404.
- Tích hợp documents intent, multi-section payment/documents, context recovery và Bedrock allowlist. Chat chỉ đọc; admin dùng chức năng hiện có để confirm/fail và giao diện mới để duy trì checklist.
- UI chat và chi tiết đơn có summary, danh sách phân trang, giấy tờ cần bổ sung; admin duy trì checklist trên trang đơn. Trang tiếp theo lấy dữ liệu mới, có thời điểm tra cứu riêng.

## Các bước

- [x] 1. Hợp đồng/snapshot, metadata payment và checklist entity/migration.
- [x] 2. Read API principal-scoped, admin checklist mutation có version/idempotency.
- [x] 3. Chat payment/document tools, lọc giao dịch/clarification, context và allowlist.
- [x] 4. UI chat/đơn, phân trang, admin cập nhật hồ sơ.
- [x] 5. PostgreSQL migration và test AC1–AC8, regression US-01–03.
- [x] 6. Docker build, desktop/mobile/API smoke, verification và cập nhật spec.

## Nghiệm thu

Chỉ confirmed ảnh hưởng tiền; tổng không phụ thuộc trang. Không suy đoán checklist, giao dịch hay chứng từ. Tài khoản khác không đọc được dữ liệu đơn/giao dịch/checklist; customer không ghi hồ sơ. Lượt hỏi mới phản ánh cập nhật admin. Hoàn tất US-04 trước US-05.
