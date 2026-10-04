# Nghiệm thu US-03 — yêu cầu đổi lịch / hủy đơn trong chat

Ngày: 2026-10-04. Hoàn tất local; chưa bắt đầu US-04.

## Kết quả

- Chat nhận `hủy đơn` / `đổi lịch` có hoặc không dấu, tạo draft server cho đơn thuộc tài khoản. Ngày tương đối không được suy đoán; form hỏi ngày cụ thể và lý do.
- Form hiển thị đơn, trạng thái/lịch lúc lưu, ngày/giờ mong muốn, lý do và hạn 30 phút. Khách sửa/lưu, bỏ hoặc bấm xác nhận riêng. Nhắn `đồng ý` chỉ hướng dẫn xem bản nháp.
- Tạo yêu cầu pending qua core dùng chung với CustomerAccountStore.Change. Session và yêu cầu cùng transaction; session lock + order lock, version và pending guard chống tranh chấp. Không sửa đơn, lịch, giao dịch hay hoàn tiền.
- Trả mã CR và link lọc chính xác requestId. Admin đọc ngày/giờ Việt Nam và lý do trong module đề nghị hiện có, rồi xử lý như trước.
- Không thay đổi schema: draft/audit nằm trong Context JSONB; ngày/giờ đề nghị được server dựng vào Reason; CR suy ra từ ID. Tối đa 20 bản nháp mỗi hội thoại, mở bản nháp mới sẽ bỏ bản nháp chưa gửi trước đó.

## Hợp đồng

`GET /assistant/sessions/{id}` bổ sung `draft` tùy chọn; session cũ không có draft vẫn hoạt động.

`POST /assistant/sessions/{id}/draft-actions` nhận:

```json
{
  "requestId": "UUID",
  "version": 3,
  "draftId": "UUID",
  "draftVersion": 2,
  "action": "confirm"
}
```

`action=edit` thêm `reason` (1–800 ký tự), `date` (`yyyy-MM-dd`, bắt buộc nếu đổi lịch), `time` (`HH:mm`, tùy chọn). `discard` không tạo yêu cầu. Confirm dùng nội dung server, bỏ qua các trường nội dung client. Owner và CSRF áp dụng như API customer hiện có.

RequestId replay trả kết quả đã commit. Cùng draft/version đã gửi với requestId khác trả cùng yêu cầu; draft cũ đã sửa/bỏ/hết hạn bị chặn. Khi orderVersion thay đổi, xác nhận trả 409; khách kiểm tra đơn và lưu lại draft để cập nhật snapshot trước khi xác nhận. Đơn completed/cancelled bị từ chối. Không tự kéo dài expiry khi chat hoặc confirm.

## Kiểm thử

| Tiêu chí | Bằng chứng |
|---|---|
| AC1 thiếu thông tin | Draft không ready; confirm 422; ngày mai và ngày không hợp lệ không được parse; không có ChangeRecord |
| AC2 xác nhận riêng | Chat đồng ý không tạo yêu cầu; API action mới tạo pending |
| AC3 sửa/bỏ/hết hạn | Edit tăng version; version cũ 409; discard/expired 422; UI hiển thị hết hạn |
| AC4 đơn thay đổi | Đổi orderVersion -> 409 và không tạo yêu cầu; lưu lại lấy trạng thái mới; cancelled -> 422 |
| AC5 idempotency | Hai DbContext xác nhận đồng thời trả cùng request; retry cùng requestId và khác requestId không thêm bản ghi/turn |
| AC6 mã/link/admin | CR, lọc requestId, admin queue, mở liên kết và khôi phục session qua UI smoke |
| AC7 không tự sửa đơn | Version, status, PlannedDate và NetReceived không đổi sau gửi; cả cancel và reschedule tạo đề nghị |
| AC8 quyền | Tài khoản khác action 404; list theo requestId người khác trả rỗng; lookup order/session đều principal-scoped |

Chạy C# với CONTEXT_TEST_DATABASE trỏ PostgreSQL local và CONTEXT_HTTP_SMOKE=true:

```powershell
dotnet test services/owner-features/tests/AutoWise.OwnerFeatures.Tests/AutoWise.OwnerFeatures.Tests.csproj --no-restore --verbosity minimal
```

Kết quả: **99 test, 98 pass, 0 fail, 1 skip**. Skip là ContextLiveBedrockTests.LiveContextAndSummary yêu cầu opt-in AWS trực tiếp; HTTP regressions chạy qua API Docker đang bật Bedrock/context. Không dùng thành công của fallback để khẳng định mọi lượt gọi AWS thành công.

- AssistantDraftTests: parser và vòng đời PostgreSQL, race/replay, quyền, version, expiry, pending, cancel/reschedule, rollback khi validation lỗi.
- Regression US-01/02 và context chạy trong cùng suite.
- Docker build API Release thành công; frontend `tsc -b && vite build` thành công. Rebuild giữ cả override Bedrock và context hiện có.
- `node services/owner-features/tests/smoke_assistant_drafts_ui.cjs`: pass Edge headless desktop 1440×1000, mobile 390×844; không lỗi JavaScript hoặc tràn ngang. Tạo order riêng cho customer3, không chỉnh đơn demo có sẵn.
- Lượt smoke cuối: order `AW-8D40EC4AA417`, session `f69fa681-7aaa-4035-a6f0-596b9f97e0e8`, request `CR-E668B7F7493F` đang pending để xem local.
- `git diff --check`: pass.

## Giao diện đã kiểm tra

[Desktop](ui-desktop.png) · [Mobile](ui-mobile.png).

US-03 chỉ gửi đề nghị cho admin. Ngày/giờ đang là nội dung đề nghị, chưa phải lịch đã được đại lý xác nhận. Không có migration, triển khai production hoặc thay đổi quy trình duyệt trong US này.
