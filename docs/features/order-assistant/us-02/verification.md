# Nghiệm thu — US-02: Tiến độ và bước tiếp theo

Ngày: 2026-10-04. Trạng thái: hoàn tất local.
Spec: [US-02](../us-02-progress-next-steps.md). Plan được tạo trước khi sửa code: [plan.md](plan.md).

## Kết quả

- C# suite cuối: **93 passed, 0 failed, 1 skipped**, tổng 94 test; bật CONTEXT_TEST_DATABASE và CONTEXT_HTTP_SMOKE.
- Test PostgreSQL thật xác minh progress/payment cùng đơn, dữ liệu mới sau cập nhật bằng DbContext riêng, quyền, replay và lưu/mở lại sections.
- HTTP regression context và US-01 chạy trên Docker đã rebuild với cấu hình Bedrock/context hiện có.
- Playwright Edge + API: **pass** admin nhập thông tin chờ, xác nhận lịch, đổi lịch về dự kiến, cập nhật trạng thái, customer tra tiến độ/payment, mở lại phiên và mobile.
- Frontend TypeScript/Vite build và Docker publish/build thành công. Không thêm migration vì các trường mới nằm trong Payload JSONB hiện có.
- Test live AWS chuyên biệt về summary/multilingual chưa bật, không tính là đã qua.

## Đối chiếu acceptance criteria

| Tiêu chí | Bằng chứng |
|---|---|
| AC1: sáu trạng thái | OrderProgressTests kiểm tra nhãn, mô tả và hướng dẫn cho đủ sáu trạng thái. |
| AC2: chỉ mốc có căn cứ | Unit kiểm tra đơn không History có timeline rỗng dù trạng thái cao; legacy chuyển trạng thái được đọc có kiểm soát, event không nhận diện bị bỏ; DB/UI kiểm tra các event thực tế đã lưu. |
| AC3: bên thực hiện và bước dự kiến | NextActions ghi actor customer/dealer và link server dựng; UI tách “Các mốc đã ghi nhận” với “Bước tiếp theo (chưa phải mốc đã hoàn tất)”. |
| AC4: dự kiến/xác nhận | Unit legacy không mặc định xác nhận; domain Schedule cần confirmed rõ ràng. UI admin xác nhận lịch rồi đổi ngày không chọn xác nhận lại; chat trả planned mới thay cho confirmed cũ. |
| AC5: nguyên nhân có nguồn, bảo vệ nội bộ | Chỉ CustomerWaitingReason đi vào progress. Unit/DB/UI không lộ Detail/Actor; lý do audit progress_note được che tại API danh sách/chi tiết khách, admin vẫn đọc được audit; notification mới của note không chứa audit. |
| AC6: trạng thái kết thúc | Unit completed/cancelled không hướng dẫn tiếp tục mua hoặc thúc trả tiền; waitingReason cũ không được hiển thị, lịch hủy không còn áp dụng. |
| AC7: phối hợp thanh toán và dữ liệu mới | DB đọc progress/payment cùng Order, mỗi section có retrievedAt/link đúng. Cập nhật status/date/amount làm lượt sau phản ánh dữ liệu mới; UI xác nhận tiền vẫn còn phải trả khi xe ready. |

## Hợp đồng và cách dùng

Giữ intent và topic `status` của US-01, dùng tool `GetMyOrderProgress`. ChatSection thêm `progress` tùy chọn gồm status/statusLabel/description, timeline, nextActions, waitingReason, schedule và historyNotice. Sections/message cũ vẫn hiển thị như trước. Content chứa câu trả lời đầy đủ cho client chưa render progress.

- Timeline dùng event created/status/delivery/delivery_actual đã lưu, có At và source=order_history. Không dựng mốc từ CreatedAt hoặc trạng thái đơn nếu thiếu event.
- Event mới có trường cấu trúc FromStatus/ToStatus, PlannedDate, ActualHandoverAt và DeliveryScheduleConfirmed; event cũ chỉ được đọc theo định dạng xác định, bỏ lý do tự do.
- Thông tin hiện tại lấy lại từ Order mỗi lượt; không dùng lịch sử chat làm dữ liệu nghiệp vụ mới.
- Mốc thời gian hiển thị theo Việt Nam (UTC+7/Asia/Ho_Chi_Minh). Ngày dự kiến là DateOnly, không chuyển lệch ngày bởi timezone.

### API admin

`PUT /api/orders-service/admin/orders/{id}/delivery`: thêm `confirmed` tùy chọn, mặc định false. Xác nhận lưu DeliveryConfirmedAt. Mỗi lần lưu lại lịch phải chọn xác nhận rõ ràng; không chọn thì xóa xác nhận trước đó. Giữ business rules bàn giao thực tế hiện có.

`PUT /api/orders-service/admin/orders/{id}/progress-note`: body `{ version, customerWaitingReason, reason }`, dùng CSRF, quyền Admin và Idempotency-Key như mutation hiện có. customerWaitingReason tối đa 500 ký tự, null/trống để xóa. reason là audit bắt buộc, không đưa vào assistant hoặc notification của note. Chuyển trạng thái xóa CustomerWaitingReason; đơn kết thúc không sửa note.

UI admin có form “Thông tin chờ dành cho khách” và checkbox “Đại lý xác nhận lịch bàn giao này”.

## Bằng chứng UI và giới hạn

Ảnh: [desktop](ui-desktop.png), [mobile](ui-mobile.png). Script tạo đơn demo riêng `AW-467D12CAE02C` cho customer2, không sửa đơn demo hiện có. Đơn/phiên test được giữ để có thể xem lại; đơn cuối ở ready_for_handover với lịch dự kiến 16/10/2026, chưa thanh toán.

Timeline và nội dung chat không hiển thị ghi chú nội bộ. Các định dạng lịch sử không nhận diện được không được diễn giải thành mốc; giao diện luôn nói lịch sử có thể chưa đầy đủ. Không dự đoán ngày giao, không nhắc tự động và chưa triển khai US-03.

## Chạy lại

```powershell
$env:CONTEXT_TEST_DATABASE = 'Host=localhost;Port=5432;Database=car_rag;Username=car_rag;Password=car_rag_dev'
$env:CONTEXT_HTTP_SMOKE = 'true'
dotnet test services/owner-features/tests/AutoWise.OwnerFeatures.Tests/AutoWise.OwnerFeatures.Tests.csproj --no-restore --verbosity minimal

# Trỏ NODE_PATH tới bundled Node packages nếu Playwright chưa có trong module path.
node services/owner-features/tests/smoke_order_progress_ui.cjs
npm run build --prefix frontend
```
