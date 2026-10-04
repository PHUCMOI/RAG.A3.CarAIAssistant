# US-06 — Nghiệm thu local

Ngày: 2026-10-04. Kế hoạch được tạo trước khi sửa code: [plan.md](plan.md).

## Kết quả triển khai

- Outbox PostgreSQL được ghi cùng transaction nghiệp vụ và idempotency record. Notification có unique key `(UserId, EventKey, Type)`; worker ghi notification và trạng thái delivered atomically, chạy batch tối đa 50 mỗi 5 giây. Khóa order trước outbox để tương thích transaction đổi lịch.
- Producer cho trạng thái đơn, lịch giao, giao dịch xác nhận, checklist cần bổ sung, quyết định đề nghị và phản hồi công khai của nhân viên. Giữ tương thích sự kiện mua xe/lịch hẹn hiện có. Không dùng lý do nội bộ hoặc nội dung reply trong tiêu đề. Ghi chú nội bộ và reply của chính khách không tạo support notification.
- Reminder dùng version lịch riêng; sửa lịch giống dữ liệu hiện tại không phát lại. Đổi lịch/hủy/hoàn thành hủy reminder pending; worker kiểm lại owner, version, date, confirmed, bàn giao thực tế, trạng thái và tùy chọn trước gửi. Bật lại tùy chọn không tạo reminder bù.
- Vì lịch chỉ có ngày, mốc nhắc là 08:00 giờ Việt Nam ngày trước ngày giao. Chỉ xếp lịch khi mốc còn tương lai. Worker xử lý trong 5 phút từ mốc nhắc; quá cửa sổ hủy reminder. Không backfill lịch legacy; không email/SMS/push.
- Retry tối đa 5 lần, backoff 10/20/40/80 giây, lưu mã lỗi an toàn. Admin có GET `/api/orders-service/admin/notification-outbox/failures` (tối đa 100 bản ghi) và POST `/api/orders-service/admin/notification-outbox/{id}/retry`. Retry reminder vẫn kiểm tra lịch và cửa sổ gửi.
- `/account/notifications`: bật/tắt nhắc, làm mới, đọc/chưa đọc được lưu, giờ Việt Nam, link đối tượng và link chat. Chat link chỉ truyền orderId; backend xác minh quyền và mỗi lượt hỏi đọc lại dữ liệu hiện tại.

## Kiểm thử

| Tiêu chí | Bằng chứng |
|---|---|
| AC1 đúng khách, nội dung công khai, link đúng | BusinessProducersArePublicExactAndOnlyEmitRelevantChanges; smoke UI đủ 7 loại gồm order_created |
| AC2 durable, rollback, retry/restart, không duplicate | CommittedEventsSurviveRestartDeduplicateAndRollbackIsInvisible; FailuresHaveBoundedBackoffSafeErrorAndExplicitRetry; race hai worker; restart Docker và unique query |
| AC3 lịch đổi hủy reminder cũ | ReminderIsSingleAndOldScheduleIsCancelledWithoutAffectingBusinessNotices; CommittingScheduleChangeWhileWorkerWaitsCannotDeliverOldReminder |
| AC4 kết thúc/chưa xác nhận không nhắc | WorkerRevalidatesEveryInvalidReminderAndLateCreationNeverCatchesUp, thêm actual handover/date/version |
| AC5 tùy chọn và read tồn tại | Database kiểm context mới; UI toggle + reload và mark read + reload; business notification vẫn gửi khi tắt nhắc |
| AC6 timezone, lịch tạo muộn, bỏ mốc đã qua | VietnamDateAnchorAndScheduleVersionsAreStableOnNoOp; clock 2027 cố định, ranh giới ngày/năm UTC+7, quá cửa sổ 5 phút, tạo sau mốc không enqueue |
| AC7 chat dùng dữ liệu mới | Database đọc trạng thái mới; UI link từ notice “đã xác nhận” trả về preparing_vehicle sau admin cập nhật |
| AC8 nội bộ/quyền | SupportTests kiểm outbox trước/sau internal/public reply; HTTP người khác không thấy notice, read/order 404, chat reference bị từ chối, customer không truy cập admin outbox |
| AC9 phát theo sự kiện thay đổi | Schedule no-op giữ nguyên version, checklist needs_changes giống nhau không tạo event mới, payment pending/progress note không tạo các notice nghiệp vụ này |

- `dotnet test ... --no-restore --verbosity minimal` với CONTEXT_TEST_DATABASE và CONTEXT_HTTP_SMOKE=true: **118 tổng; 117 passed; 1 skipped** (test AWS trực tiếp cần opt-in). Chạy lại trên Docker mới với worker hoạt động: cùng kết quả.
- Build API: 0 warning/0 error. Frontend `tsc -b && vite build`: đạt. Docker publish Release và frontend image: đạt.
- Migration `20261004133456_ProactiveNotifications`: áp dụng database local; kiểm từ database rỗng `us06_migration_verify`, rollback về SupportTickets và áp dụng lại đạt; chỉ xóa database kiểm thử riêng sau hoàn tất.
- `node services/owner-features/tests/smoke_notifications_ui.cjs` (Playwright Edge): đạt. Kiểm desktop/mobile, không tràn ngang, không JS pageerror; tùy chọn demo được trả về giá trị trước smoke.
- Restart orders-api sau smoke: business outbox vẫn delivered, reminder tương lai vẫn pending, read persisted, duplicate groups = 0. Database unit test mở context mới cũng xác minh trạng thái bền vững.
- `git diff --check`: đạt (chỉ cảnh báo line-ending Windows).

## Fixture và ảnh

Smoke cuối tạo riêng order **AW-CF01C57B129B**, ID `cf01c57b-129b-4c1d-a413-c33a65b80fb5`, customer3; support ticket `c9338ce9-69e3-4325-87fe-87131fedcffe`, document `a187396c-793c-4990-809e-320e21b944c6`. Giữ các đối tượng smoke để xem lại; không sửa đơn demo có sẵn. Hai lần chạy đầu dừng vì selector kiểm thử không khớp markup, đã sửa selector và chạy toàn bộ thành công.

- [Thông báo desktop](ui-notifications-desktop.png)
- [Thông báo mobile](ui-notifications-mobile.png)
- [Chat đọc trạng thái mới từ link thông báo](ui-chat-fresh-mobile.png)

## Vận hành

Apply migration trước khi chạy phiên bản mới. Worker đăng ký trong API, tự chạy khi API khởi động. Kiểm API failures, sửa nguyên nhân rồi POST retry; khi database mất kết nối, event đã commit vẫn pending và worker thử lại batch sau. Notification legacy được giữ nguyên; lịch legacy không tự tạo reminder. US01–06 hoàn tất nghiệm thu local; chưa deploy production.
