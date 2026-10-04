# Bedrock cho trợ lý C#

## Ngữ cảnh hội thoại (feature context)

Bật `Bedrock__ContextEnabled=true` để dùng lịch sử, bộ nhớ đơn hiện tại/đơn
trước, chủ đề và câu hỏi đang cần làm rõ. Mặc định false để rollback về luồng
trước. Khi Bedrock tắt/lỗi, resolver context dùng rule và bộ nhớ đã kiểm tra quyền.
Messages và SelectedOrderId giữ hợp đồng cũ; mở lại session trong UI hiện có
phục hồi đơn được chọn. Không có thay đổi frontend/image_service trong feature.

Migration `20261003170327_ConversationContext` thêm cột Context JSONB trong
orders_service.chat_sessions. Payload list ChatTurn và dữ liệu cũ giữ nguyên.
Summary nằm trong Context, có mốc coverage và summary version; tóm tắt tăng
dần tối đa hai lượt cũ mỗi lần, không thay thế dữ liệu giao dịch hiện tại.
Mỗi lượt phải truy vấn lại DB theo principal; Haiku chỉ phân loại/ref resolution.

Cấu hình bổ sung: HistoryWindow=8, InputBudget=6000, OutputBudget=200,
SummaryEnabled=true, SummaryOutputBudget=800. Builder dùng số byte UTF-8
làm proxy bảo thủ, dành 1500 cho system prompt; đây không phải tokenizer chính
xác. Usage token thực tế được ghi từ response AWS. Summary lưu tối đa 800 ký
tự để nhỏ hơn ngân sách output. Đầu vào quá lớn khi cấu hình budget thấp trả
validation error, không cắt câu hỏi mới hay mất draft.

Chạy Docker local chỉ đổi cấu hình runtime, không cần sửa compose gốc:

```powershell
$contextOverridePath = Join-Path $env:TEMP 'rag-a3-context-compose.yml'
Set-Content -LiteralPath $contextOverridePath -Value "services:`n  orders-api:`n    environment:`n      Bedrock__ContextEnabled: 'true'"
docker compose -f docker-compose.yml -f docker-compose.bedrock.yml -f $contextOverridePath up --build -d orders-api
```

Kiểm thử bằng C# (các nhóm opt-in cần DB local, Docker và AWS credentials):

```powershell
$env:CONTEXT_TEST_DATABASE = 'Host=localhost;Database=car_rag;Username=car_rag;Password=car_rag_dev'
$env:CONTEXT_LIVE_BEDROCK = 'true'
$env:CONTEXT_HTTP_SMOKE = 'true'
$env:AWS_PROFILE = 'rag-a3'
dotnet test services/owner-features/AutoWise.OwnerFeatures.sln
```

HTTP smoke dùng tài khoản demo, thêm hội thoại giả, cần container bật context và
Bedrock. Database test tạo user/đơn riêng rồi cleanup. Live test sử dụng một số
request tính phí để xác minh summary/context, không chạy khi thiếu opt-in.
Chi tiết bằng chứng: docs/features/assistant-context/verification.md.

Region: `us-east-1`. Inference profile: `us.anthropic.claude-haiku-4-5-20251001-v1:0`.

Bedrock nhận diện ý định orders và điều hướng tài khoản. C# kiểm tra ownership,
tra cứu và tạo câu trả lời từ dữ liệu thật. Chưa dùng LLM để viết lại câu trả lời
theo văn phong tự do. Khi bật ContextEnabled, model dùng lịch sử để giải ý định và tham chiếu. Không cho model tự ghi dữ liệu giao dịch.
Intent và route có allowlist. Provider lỗi/timeout/output không hợp lệ dùng rule
hiện có. Request đã replay không gọi model lại. Hai request đồng thời vẫn có thể
gọi model, nhưng khóa/version hiện có bảo vệ việc lưu hội thoại.

Mặc định Bedrock tắt. Để bật cho backend chạy trực tiếp trên Windows:

1. Vô hiệu hóa/xóa mọi key đã chia sẻ trong chat và tạo credentials mới.
2. Cấu hình AWS profile `rag-a3` riêng trên máy, ngoài repository.
3. Thử model trong Playground và hoàn tất quyền truy cập Anthropic.
4. Trong PowerShell:

```powershell
$env:AWS_PROFILE = 'rag-a3'
$env:AWS_REGION = 'us-east-1'
$env:Bedrock__Enabled = 'true'
dotnet run --project services/owner-features/src/AutoWise.OwnerFeatures.Api
```

SDK dùng credential chain mặc định; không lưu key trong appsettings hoặc frontend.
Local cần DB và Python API đang chạy theo cấu hình hiện có. Docker không tự kế
thừa profile Windows. Có thể dùng override compose bên ngoài repository để mount
thư mục AWS credentials read-only vào home của user container và đặt AWS_PROFILE,
Bedrock__Enabled. Trên AWS dùng IAM role thay cho key dài hạn.

IAM cần `bedrock:InvokeModel` trên inference profile và foundation model ở các
region đích của US cross-region profile. Không cần streaming permission hiện tại.

## Chạy Docker với Bedrock

Lưu credentials mới trong `%USERPROFILE%\.aws\credentials` với profile `[rag-a3]`.
Không dùng credentials đã lộ trong chat. Sau đó chạy:

```powershell
docker compose -f docker-compose.yml -f docker-compose.bedrock.yml up --build -d orders-api
```

Override bật Bedrock và mount duy nhất file credentials read-only vào container.
Sau khi cập nhật file credentials, restart orders-api để SDK đọc lại:

```powershell
docker compose -f docker-compose.yml -f docker-compose.bedrock.yml restart orders-api
```

Log `Bedrock inference completed` kèm request ID chứng minh lời gọi provider đã
thành công; `intent resolution unavailable` nghĩa là đang dùng fallback.

Kiểm tra `/account/assistant`: hỏi danh sách đơn, số tiền còn phải trả, lịch bàn
giao, hoặc mở trang đổi mật khẩu. Bedrock lỗi thì log chỉ ghi loại lỗi; không ghi
prompt/credentials. Vì fallback có thể trả lời thành công, cần kiểm tra log và
Bedrock metrics để xác nhận inference thật đã chạy.

Đã xác minh một lời gọi AWS thật ngày 2026-10-03: điều hướng trang đổi mật khẩu,
log nhận request ID từ Bedrock. Lời gọi orders tiếp theo bị AWS từ chối do chưa
hoàn tất Anthropic use case details (hoặc cần chờ 15 phút sau khi gửi form).
Credentials không nằm trong repository; key từng chia sẻ trong chat cần thu hồi
và thay thế sau kiểm thử.

Cập nhật 2026-10-04: quyền Anthropic đã hoạt động; 58/58 test pass với PostgreSQL, HTTP Docker và Bedrock thật (không skip). Xem verification.md cho request ID và phạm vi nghiệm thu.
