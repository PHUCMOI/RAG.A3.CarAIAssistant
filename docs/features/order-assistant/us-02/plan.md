# Plan — US-02: Tiến độ và bước tiếp theo

Ngày: 2026-10-04. Trạng thái: hoàn tất local. Bằng chứng: [verification.md](verification.md).
Spec: [US-02](../us-02-progress-next-steps.md). Phụ thuộc: US-01 đã nghiệm thu.

## Hiện trạng và quyết định

- Order đã lưu History trong Payload JSONB: created/status/delivery/delivery_actual. Event cũ có Detail tự do chứa lý do/actor nội bộ; không đưa nguyên văn vào assistant.
- PlannedDate hiện chỉ là lịch dự kiến; chưa có dữ liệu xác nhận lịch hay thông tin chờ dành riêng cho khách.
- Tái sử dụng intent status và section topic=status để giữ tương thích US-01; bổ sung Progress tùy chọn với timeline, nextActions, thông tin lịch và waitingReason. Tool mới là GetMyOrderProgress; vẫn phục hồi được tool GetMyOrderStatus của phiên cũ.
- Lịch sử mới thêm trường cấu trúc cho chuyển trạng thái/lịch. Đọc event status cũ chỉ khi Detail là mã trạng thái hợp lệ hoặc có cấu trúc chuyển trạng thái đã biết; loại phần lý do. Event không nhận diện được không dựng thành mốc hoàn tất.
- Thêm DeliveryScheduleConfirmed/DeliveryConfirmedAt và CustomerWaitingReason vào Order JSON. Lịch cập nhật mặc định chưa xác nhận; admin phải chọn xác nhận rõ ràng. Lý do chờ có endpoint/form admin riêng, được xóa khi chuyển trạng thái để tránh thông tin cũ.
- Không cần migration schema: dữ liệu bổ sung nằm trong Payload/session JSONB. Không backfill lịch sử hoặc xác nhận lịch cho đơn cũ.
- Các trạng thái kết thúc chỉ hướng dẫn kiểm tra chứng từ/hỗ trợ nếu cần; không thúc thanh toán hoặc tiếp tục mua xe. Trạng thái không chứng minh đã trả đủ; số tiền vẫn dùng backend.

## Các bước triển khai

- [x] 1. Hợp đồng read model progress và bảng hướng dẫn sáu trạng thái; timeline đã ghi nhận, lịch dự kiến/xác nhận và thông tin thiếu.
- [x] 2. Bổ sung trường JSON, ghi event cấu trúc; admin cập nhật xác nhận lịch và lý do chờ dành cho khách.
- [x] 3. Tích hợp status → GetMyOrderProgress; nhận diện “bước tiếp theo”, “cần làm gì”, giải thích trạng thái; giữ đa chủ đề/ngữ cảnh.
- [x] 4. UI timeline, bước tiếp theo có bên thực hiện/link; hỗ trợ message cũ và Content fallback.
- [x] 5. Kiểm thử AC1–AC7: sáu trạng thái, legacy thiếu lịch sử, ghi chú riêng tư, đổi lịch/xóa xác nhận, dữ liệu mới, quyền, replay, phối hợp payment.
- [x] 6. Chạy regression C#/PostgreSQL, frontend build, Docker/API/UI smoke; tạo verification.md và cập nhật trạng thái tài liệu.

## Nghiệm thu

Timeline chỉ gồm event được lưu, không vẽ các bước đã hoàn tất từ trạng thái. Lịch cũ không mặc định là xác nhận. Chỉ CustomerWaitingReason được hiển thị, không Detail/Actor. Mỗi bước tiếp theo ghi rõ customer/dealer và có link do server dựng. US-03 chưa triển khai trong đợt này.
