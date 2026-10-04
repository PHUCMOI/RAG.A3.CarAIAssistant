# Nghiệm thu US-05 — chuyển hỗ trợ cho nhân viên

Ngày 2026-10-04. Hoàn tất local; chưa bắt đầu US-06.

## Kết quả

Khách nhắn yêu cầu nhân viên hoặc dùng nút Chuẩn bị phiếu hỗ trợ (điền câu hỏi để gửi). Chat tạo bản nháp support dùng action/version/idempotency của US-03. Không cần có đơn. Vấn đề rõ trong câu hỏi được đưa vào tóm tắt để khách sửa; yêu cầu chung hỏi mô tả thêm. Hai lượt tra cứu liên tiếp gặp lỗi hoặc thiếu dữ liệu hiển thị đề xuất chuyển hỗ trợ, không tự tạo phiếu.

Draft có chủ đề, tóm tắt, liên kết đơn/giao dịch/đề nghị tùy chọn và ngữ cảnh gửi kèm. Khách lưu, kiểm tra, sửa/bỏ rồi xác nhận riêng. Draft hết hạn sau 30 phút. Xác nhận tạo ticket new, mã ST, audit và cập nhật session trong cùng transaction. Replay/race trả cùng ticket; nhắn đồng ý không gửi.

Ticket có owner, session, liên kết đã kiểm tra, subject/summary, status, assignedTo, timestamps/version; reply lưu author/role/content/time/visibility; audit lưu actor/action/version/time. Admin nhận chính mình, gửi phản hồi công khai hoặc ghi chú nội bộ, giải quyết và đóng. Khách xem/trả lời trong tài khoản; phản hồi khi resolved mở lại in_progress. Closed không nhận phản hồi mới. Không hứa SLA hoặc gửi email/live chat/ứng dụng bên ngoài.

## Quyền và ngữ cảnh

- Customer chỉ đọc/ghi ticket của mình; account khác trả 404. Route admin yêu cầu role Admin, customer gọi trả 403; mutation kiểm tra CSRF, version và Idempotency-Key.
- Edit/confirm kiểm tra owner đơn, payment thuộc đúng đơn, change request thuộc owner và khớp đơn nếu có. Không có đơn vẫn được gửi; payment phải có đơn liên quan.
- Snapshot dựng bởi server từ tối đa 3 lượt gần nhất trong chính session đã kiểm tra owner. Chỉ gồm thời điểm, topics và result statuses; không sao chép raw câu hỏi/câu trả lời, model summary, số tiền, thông tin đăng nhập hoặc ghi chú nội bộ. Khách xem trước snapshot này. Session cũ thiếu section có thể không có snapshot; không lấy text tự do để bù.
- Subject/summary/reply lọc các mẫu mật khẩu, OTP, bearer/API key/token phổ biến; UI nhắc không nhập bí mật. Đây không phải bộ nhận diện mọi loại thông tin nhạy cảm. Bảo vệ snapshot dựa trên allowlist metadata, độc lập với regex.
- API khách loại internal replies **trước** phân trang/count. Chat không đọc replies hoặc notes; chỉ điều hướng sang trang phiếu. Admin response không dùng làm response replay của customer vì idempotency scope theo actor.

## API và UI

- Draft: `POST /assistant/sessions/{id}/draft-actions`, type=support, action edit/discard/confirm như US-03. Edit bổ sung subject, reason (summary), linkedOrderId, paymentId, changeRequestId. Snapshot chỉ từ server.
- `GET /my/support-tickets?page=1&pageSize=20`: list owner, tối đa 20 mỗi trang.
- `GET /my/support-tickets/{id}?page=1`: chi tiết và trang public replies (20).
- `POST /my/support-tickets/{id}/replies`: version/content, không cho internal=true.
- Admin có GET list/detail và POST replies tương ứng, thêm internal visibility.
- `POST /admin/support-tickets/{id}/actions`: version/action accept/resolve/close.
- UI: `/account/support-tickets`, `/account/support-tickets/:id`, `/admin/support-tickets`, `/admin/support-tickets/:id`; có menu, list, chi tiết, tải lại, phân trang và phản hồi.
- Giới hạn 20 drafts/session, 200 replies/ticket. Transition: new → in_progress → resolved → closed; resolved + customer reply → in_progress. Mỗi mutation khóa ticket và kiểm tra version.

## Migration và kiểm thử

Migration `20261004131616_SupportTickets` thêm support_tickets/replies/audits trong orders_service, FK/index, status check constraint, JSONB snapshot và version concurrency. PaymentId là tham chiếu vào Order JSONB, kiểm tra tại application thay vì FK SQL.

Đã áp dụng PostgreSQL local; history xác nhận migration. Database riêng `us05_migration_verify`: migrate từ rỗng, rollback về OrderDocumentChecklist, áp dụng lại đều pass; đã xóa database kiểm thử. `has-pending-model-changes`: không còn thay đổi model chưa có migration. Không rollback database demo.

| Tiêu chí | Bằng chứng |
|---|---|
| AC1 không cần đơn | PostgreSQL và UI gửi phiếu với OrderId=null |
| AC2 xác nhận | Draft chưa đủ dữ liệu confirm 422; hai lỗi tra cứu chỉ đề xuất; ticket chỉ xuất hiện sau confirm |
| AC3 vấn đề/ngữ cảnh/link | UI edit/preview; test liên kết owner order/payment/change, từ chối foreign/unknown; issue rõ được prefill |
| AC4 replay/race | Hai DbContext confirm đồng thời và HTTP retry/double-key chỉ một ticket |
| AC5 hành trình | UI admin accept/public reply/resolve, khách reply mở lại, admin close; closed reply 422 |
| AC6 privacy | Owner khác 404, customer admin route 403; internal reply chỉ admin, count khách không lộ notes |
| AC7 snapshot | Chỉ metadata allowlist từ session owner; test raw password trong lượt trước không xuất hiện trong snapshot |
| AC8 không hứa SLA | Thông báo chỉ tiếp nhận/trạng thái và “chưa có thời gian xử lý cam kết” |

Chạy suite với CONTEXT_TEST_DATABASE=PostgreSQL local và CONTEXT_HTTP_SMOKE=true:

```powershell
dotnet test services/owner-features/tests/AutoWise.OwnerFeatures.Tests/AutoWise.OwnerFeatures.Tests.csproj --no-restore --verbosity minimal
```

Kết quả cuối: **111 test, 110 pass, 0 fail, 1 skip**. Skip ContextLiveBedrockTests.LiveContextAndSummary cần opt-in AWS trực tiếp. HTTP regression chạy Docker bật Bedrock/context; không dùng thành công fallback để khẳng định mọi lời gọi AWS thành công.

SupportTests kiểm tra rules/secrets, PostgreSQL draft/link ownership, race/replay, notes visibility, transition/version, reopening, đề xuất không tự gửi và audit. Suite có regression US-01–04/context.

HTTP regression chuyển sang HttpCustomerFixture tạo customer/đơn riêng từ fixture demo và tự dọn sau test, tránh làm đầy 50 hội thoại tài khoản demo; không xóa hội thoại demo hiện có. Đã sửa trường hợp provider đề nghị clarification dù topic và tham chiếu local đã rõ: explicit topics dùng clarification/reference của quy tắc local, vẫn kiểm tra owner/ambiguity sau đó.

`node services/owner-features/tests/smoke_support_ui.cjs`: pass Edge headless desktop 1440×1000/mobile 390×844. Không lỗi JavaScript hoặc tràn ngang. Lượt cuối ticket **ST-ACA98018B451**, ID **aca98018-b451-4084-8a4f-3dcf038b1761**, session **d0c02d63-3982-4480-85e5-a7e32800c1a8**; ticket đã closed sau nghiệm thu, thuộc customer3.

API Release publish và frontend `tsc -b && vite build`: pass. `git diff --check`: pass. Đã khởi động lại Docker đang tắt và cập nhật local, giữ override Bedrock/context. Không triển khai production.

## Hình đã kiểm tra

[Bản nháp](ui-draft-desktop.png) · [Khách desktop](ui-customer-desktop.png) · [Khách mobile](ui-customer-mobile.png) · [Admin](ui-admin-desktop.png).
