# Nghiệm thu US-04 — thanh toán chi tiết và hồ sơ

Ngày 2026-10-04. Hoàn tất local; chưa bắt đầu US-05.

## Kết quả

Chat trả các section thanh toán/hồ sơ trong cùng lượt. Thanh toán có giá chốt, cọc yêu cầu, tổng thu/hoàn đã xác nhận, thu ròng, còn phải trả và danh sách giao dịch phân trang. Tổng tính toàn bộ giao dịch confirmed bằng quy tắc Order.NetReceived/RemainingVnd, không phụ thuộc trang hoặc bộ lọc. Đơn cancelled hiển thị khoản còn giữ/đã hoàn, không nhắc trả tiếp.

Giao dịch hiển thị thu/hoàn, số tiền, reference, pending/confirmed/failed, thời điểm ghi nhận/xác nhận và lý do từ chối đã lưu. Payment mới có CreatedAt; FailPayment lưu FailureReason. Dữ liệu cũ thiếu thời điểm/lý do không được backfill bằng suy đoán.

Câu hỏi có “mã giao dịch …”, ngày dd/MM/yyyy hoặc yyyy-MM-dd, “hôm nay”/“hôm qua” lọc theo dữ liệu đã lưu và ngày Việt Nam. Nhiều kết quả yêu cầu chọn reference; không khớp nói chưa tìm thấy. Không suy ra giao dịch tồn tại hoặc mục đích cọc từ lời khách; model không tính tiền.

Checklist riêng từng đơn có tên giấy tờ, bắt buộc/tùy chọn, missing/pending/valid/needs_changes, ghi chú khách, updatedAt/version/updatedBy. Admin thêm/sửa trên trang đơn với kiểm soát version, idempotency và khóa đơn để giới hạn 100 mục. Needs_changes bắt buộc có ghi chú bổ sung. Không seed danh sách giấy tờ chung, không upload/OCR.

## API và quyền

- `GET /my/orders/{id}/payment-details?page=1&pageSize=10&reference=...&date=yyyy-MM-dd`: summary toàn bộ confirmed, trang giao dịch và trạng thái khớp. Page size 1–20.
- `GET /my/orders/{id}/payments/{paymentId}`: đọc giao dịch thực, kiểm tra cả owner đơn và payment thuộc đơn.
- `GET /my/orders/{id}/documents?page=1&pageSize=10`: checklist và tổng requiredOutstanding của toàn bộ checklist. Page size 1–20.
- Admin có GET payment-details/documents tương ứng.
- `PUT /admin/orders/{id}/documents/{itemId}`: `{ version, name, required, status, customerNote }`; version=0 khi thêm, version hiện tại khi sửa. CSRF, role Admin, Idempotency-Key và optimistic concurrency áp dụng.

Mọi API customer đọc lại quyền lúc mở hoặc chuyển trang; khác owner trả 404. Customer gọi endpoint admin trả 403. Không nhận file URL từ model/client.

Hiện repository **chưa có kho chứng từ đã lưu và được cấp quyền**. Vì vậy `documentUrl=null`, UI nói chưa có chứng từ, không tạo link giả; đường dẫn document không tồn tại trả 404. AC6 được kiểm tra ở mức API đọc giao dịch có owner và không có đường tải chứng từ công khai. Chưa có file thật để nghiệm thu tải file; đây là giới hạn nguồn dữ liệu, upload/OCR nằm ngoài spec US-04.

## Migration

`20261004125508_OrderDocumentChecklist` thêm bảng `orders_service.order_document_checklist`, index theo order/name, FK order/admin, status check constraint và concurrency token. Thay đổi metadata Payment nằm trong Order JSONB nên không thêm cột payment.

- Áp dụng lên PostgreSQL local thành công; migration history xác nhận bản mới.
- Database kiểm thử riêng `us04_migration_verify`: chạy toàn bộ migrations từ DB rỗng, rollback về ConversationContext, áp dụng lại US-04 đều thành công; đã xóa DB kiểm thử sau xác minh. Không rollback database demo.
- `dotnet-ef migrations has-pending-model-changes`: không có thay đổi model chưa có migration.

## Kiểm thử

| Tiêu chí | Bằng chứng |
|---|---|
| AC1 trạng thái/thu/hoàn | Unit và UI với confirmed receipt/refund, failed có lý do, pending riêng |
| AC2 chỉ confirmed tính tổng | 600.000 thu − 100.000 hoàn = 500.000 ròng; các pending/failed 1.000 không tính |
| AC3 đơn hủy | Unit giữ dữ liệu thu/hoàn thực tế, Remaining=0 và không có hướng dẫn trả tiếp |
| AC4 checklist | missing/needs_changes, ghi chú ảnh mờ, requiredOutstanding toàn bộ; cập nhật valid giảm số thiếu |
| AC5 thiếu nguồn | Đơn mới checklist rỗng có thông báo; mọi documentUrl=null và không có link file |
| AC6 quyền đọc | Tài khoản khác đọc payment/details/checklist 404; customer sửa hồ sơ 403; document route vắng 404 |
| AC7 phân trang | UI 13 giao dịch, trang đầu 10/trang sau 3; summary vẫn 500.000; pageSize=21 trả 422; checklist test pageSize=1 với tổng 2 |
| AC8 mới nhất | Confirm refund/admin sửa hồ sơ -> lượt hỏi mới thấy tiền và trạng thái mới |

Chạy test suite với CONTEXT_TEST_DATABASE=PostgreSQL local và CONTEXT_HTTP_SMOKE=true:

```powershell
dotnet test services/owner-features/tests/AutoWise.OwnerFeatures.Tests/AutoWise.OwnerFeatures.Tests.csproj --no-restore --verbosity minimal
```

Kết quả cuối: **105 test, 104 pass, 0 fail, 1 skip**. Skip là ContextLiveBedrockTests.LiveContextAndSummary cần opt-in AWS trực tiếp. HTTP regression chạy API Docker đang bật Bedrock/context; không dùng thành công fallback để khẳng định mọi lượt inference AWS thành công.

OrderEvidenceTests kiểm tra payment metadata, summary/refund/paging/filter, legacy null, cancelled, checklist PostgreSQL, version/replay/rollback và owner. Suite đồng thời chạy regression US-01–03 và context.

`node services/owner-features/tests/smoke_order_evidence_ui.cjs`: pass Edge headless desktop 1440×1000/mobile 390×844, admin UI thêm/sửa, phân trang, lọc/ambiguity, freshness, quyền và không tràn ngang/lỗi JavaScript. Script tạo order riêng cho customer3, không chỉnh đơn demo có sẵn.

Lượt smoke cuối: order **AW-9A5257B94CEA**, session **8eee52b5-647e-471d-ad83-7dcbc9c2e3f3**. Tổng thu 600.000 VND, hoàn 100.000 VND, thu ròng 500.000 VND; giấy tờ CCCD đã được admin kiểm tra valid.

Docker API Release publish và frontend `tsc -b && vite build` thành công, giữ override Bedrock/context hiện có. `git diff --check`: pass.

## Hình đã kiểm tra

- Thanh toán: [desktop](ui-payment-desktop.png), [mobile](ui-payment-mobile.png).
- Checklist: [desktop](ui-desktop.png), [mobile](ui-mobile.png).

Đã cập nhật Docker local. Không triển khai production hoặc bắt đầu US-05.
