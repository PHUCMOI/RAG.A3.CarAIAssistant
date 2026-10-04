# Nghiệm thu ngữ cảnh hội thoại C#/Bedrock

Ngày: 2026-10-04. Trạng thái: hoàn tất local.

Chỉ triển khai code C#, không sửa image_service hoặc thêm thay đổi frontend cho feature context. UI hiện có được giữ nguyên; reload tải danh sách, mở lại session phục hồi messages và đơn đã chọn. Ảnh: [ui-reopen.png](ui-reopen.png).

## Kết quả cuối

`dotnet test services/owner-features/AutoWise.OwnerFeatures.sln --no-restore` với CONTEXT_TEST_DATABASE, CONTEXT_LIVE_BEDROCK và CONTEXT_HTTP_SMOKE bật: **58 passed, 0 failed, 0 skipped**. Docker rebuild code cuối và cả bốn dịch vụ đang chạy. Solution build 0 warning/error; EF không có pending model changes. Frontend build và smoke_orders.py pass. smoke_assistant.py baseline pass khi Bedrock/context tắt; nhãn intent legacy với Bedrock bật có dao động, không tính đó là bằng chứng pass context.

## Đối chiếu tiêu chí spec

| Tiêu chí | Bằng chứng |
|---|---|
| 1. Bedrock thật | ContextHttpSmokeTests chạy đủ chuỗi mục 3; sáu lượt provider valid=True, request ID bên dưới. |
| 2. Tiếp nối, đổi đơn, clarification | ContextDatabaseTests kiểm tra current/previous, UI selected-order echo, thiếu đơn, mã và OrderId mâu thuẫn, trả mã để tiếp tục pending intent. |
| 3. Dữ liệu mới | Cập nhật tiền bằng DbContext độc lập giữa các lượt; câu sau dùng DB mới. Builder không gửi câu trả lời nghiệp vụ cũ làm dữ liệu hiện tại. |
| 4. Cách ly/injection | DB test user/đơn/session ngoài quyền; live test injection ở cả history và summary; C# kiểm tra ownership và enum/route. |
| 5. Hội thoại dài | Live AWS summary thành công và hỏi tiếp payment/previous; unit test summary failure giữ summary cũ và ID đã xác minh. |
| 6. CSRF/replay/race | HTTP thiếu CSRF bị 400; DB replay/body conflict, hai DbContext cùng version chỉ một commit, lỗi SaveChanges rollback toàn bộ; regression orders pass. |
| 7. Tương thích | Context={} phục hồi SelectedOrderId/topic; giới hạn 100 lượt; HTTP session mới rỗng và logout trả 401; browser mở lại session phục hồi lịch sử/đơn. Source UI giữ draft khi lỗi/conflict, unmount khi logout. |
| 8. Build/test/docs | 58/58 pass không skip, Docker build, EF check, regression DB, tài liệu runtime trong docs/features/order-assistant/bedrock-csharp.md. |

## Request ID từ Docker sau rebuild cuối

| Intent | AWS request ID | Input/output tokens |
|---|---|---|
| status | ab1dcc75-6648-47fc-a71c-fb9d23a0b487 | 321/47 |
| payment | a1411c5d-db9d-4caf-925a-eaf976f24f0f | 368/47 |
| delivery | 5fee9ec0-638e-4c34-af09-ea460a7e2d1b | 415/47 |
| delivery, đổi đơn | 6ed63bff-5dce-46c8-a94e-b27575c2e58a | 472/47 |
| payment, đơn trước | 44219179-9fae-4bde-a74d-36dedd36fc36 | 526/47 |
| security navigation | e56c21b4-9395-48d9-98a1-0b1cd7d0d1e3 | 578/47 |

## Vận hành và giới hạn

Migration chỉ thêm Context JSONB mặc định {} vào orders_service.chat_sessions, không đổi Payload. Feature flag mặc định tắt; Docker local bật bằng override tạm ngoài repo. Tắt ContextEnabled để quay lại luồng trước mà giữ dữ liệu. Không deploy production.

Ngân sách dùng byte UTF-8 làm proxy bảo thủ, không phải tokenizer chính xác; usage thực được ghi từ AWS. Summary tăng dần tối đa hai lượt cũ mỗi lần, lưu tối đa 800 ký tự và coverage version. C# tiếp tục dựng câu trả lời từ DB; LLM phân loại ý định/tham chiếu, không tự thay đổi giao dịch. Test live có opt-in, phát sinh chi phí AWS và hội thoại demo. Credentials nằm ngoài repo; key từng gửi trong chat cần thu hồi/thay mới.
