# Bedrock cho trợ lý C#

## US-02: tiến độ và bước tiếp theo

Intent/topic status hiện gọi GetMyOrderProgress. Backend dựng progress từ trạng thái và lịch sử đơn đã kiểm tra quyền, gồm timeline, bước tiếp theo theo customer/dealer, lịch dự kiến/xác nhận và thông tin chờ dành cho khách. Model không dựng timeline, tự đoán lý do chờ hoặc ngày giao. Phiên cũ vẫn hỗ trợ tool GetMyOrderStatus và sections không có progress.

Admin xác nhận lịch bằng trường confirmed trong endpoint delivery; mỗi lần đổi lịch cần xác nhận lại. Thông tin chờ nhập riêng qua progress-note, không lấy từ Detail/Actor nội bộ. Xem [plan US-02](us-02/plan.md) và [nghiệm thu](us-02/verification.md).

## US-01: nhiều chủ đề trong một lượt

Hợp đồng classifier mới trả `intents` (1–5 nhãn), `orderReference`, `needsClarification` và `clarificationKind`. Parser vẫn đọc hợp đồng `intent` đơn cũ. Chỉ các chủ đề status/payment/delivery/car/warranty được kết hợp; navigation/list/readonly phải đứng riêng. JSON sai hoặc provider lỗi dùng rule fallback.

Tin nhắn assistant thêm `sections` tùy chọn với topic, content, resultStatus (success/missing/error), retrievedAt và detailUrl. Content vẫn có câu trả lời đầy đủ. Context thêm LastBusinessIntents/PendingIntents trong JSONB hiện có, không cần migration.

Chủ đề rõ ràng trong câu hỏi được ưu tiên; câu đổi đơn “còn đơn ... thì sao?” kế thừa danh sách chủ đề của lượt thành công gần nhất. Phần tra cứu lỗi không ghi thành chủ đề thành công. Nhiều mã đơn khác nhau yêu cầu chọn một đơn và giữ đủ các chủ đề đang chờ.

Multi-intent và pending topics hoạt động khi ContextEnabled=false. Cờ này tiếp tục điều khiển lịch sử/summary và tham chiếu đơn trước; không còn tắt khả năng trả lời nhiều chủ đề. Khi Enabled=false, không gọi AWS. Điều hướng tài khoản có rule fallback để hoạt động khi AWS lỗi/throttling.

Xem [kế hoạch US-01](us-01/plan.md) và [nghiệm thu](us-01/verification.md).

## Ngữ cảnh hội thoại (feature context)

Bật `Bedrock__ContextEnabled=true` để dùng lịch sử, bộ nhớ đơn hiện tại/đơn
trước, chủ đề và câu hỏi đang cần làm rõ. Mặc định false để rollback về luồng
trước về lịch sử/summary và tham chiếu đơn trước. Khi Bedrock tắt/lỗi, resolver context dùng rule và bộ nhớ đã kiểm tra quyền.
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
Chi tiết bằng chứng: docs/features/order-assistant/context/verification.md.

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

US-03 bổ sung draft đổi lịch/hủy đơn và action xác nhận riêng, độc lập với provider. Model không được gửi đề nghị từ câu đồng ý; confirm chạy validation/transaction C# và không gọi Bedrock. Draft lưu trong Context JSONB, không đưa trường draft vào context prompt. Xem [nghiệm thu US-03](us-03/verification.md).

US-04 bổ sung documents intent vào allowlist và hỗ trợ section payment/documents cùng lượt. Dữ liệu giao dịch/checklist lấy từ C# theo owner; số tổng do Order tính, không dùng summary/model làm nguồn tiền hoặc hồ sơ. Xem [nghiệm thu US-04](us-04/verification.md), gồm migration và giới hạn nguồn chứng từ.

US-05 nhận yêu cầu nhân viên bằng quy tắc local và tạo draft support; chỉ action xác nhận mới gửi ticket. Snapshot metadata dựng trong C#, notes/replies nội bộ không đưa vào context model. Xem [nghiệm thu US-05](us-05/verification.md).

US-06 dùng transactional outbox và worker C# để tạo thông báo in-app/nhắc lịch, không gọi model để quyết định phát thông báo. Link chat chỉ mang orderId, xác minh owner và đọc lại dữ liệu mỗi lượt. Apply migration ProactiveNotifications trước khi chạy API mới; xem [nghiệm thu US-06](us-06/verification.md) cho mốc nhắc, retry và API quản trị lỗi.
