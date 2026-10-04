# Nghiệm thu — US-01

Ngày: 2026-10-04. Trạng thái: hoàn tất local.
Spec: [US-01](../us-01-multi-intent.md). Plan được tạo trước khi sửa code: [plan.md](plan.md).

## Kết quả

- C# test suite: **76 passed, 0 failed, 1 skipped**, tổng 77 test. Bật CONTEXT_TEST_DATABASE và CONTEXT_HTTP_SMOKE.
- PostgreSQL integration chạy thật trên database local; test tạo dữ liệu riêng và xóa dữ liệu đó khi kết thúc.
- HTTP regression context và HTTP multi-intent chạy trên Docker đã rebuild, với Bedrock/context bật.
- Playwright trên Edge: **pass** clarification, đủ ba sections, mở lại phiên, hỏi tiếp bảo hành, giữ draft khi 409, gửi lại và mobile không tràn ngang.
- Frontend TypeScript/Vite build và Docker publish/build thành công. Không cần migration vì hợp đồng mới nằm trong JSONB hiện có.
- Test live AWS chuyên biệt cho summary/multilingual chưa bật (CONTEXT_LIVE_BEDROCK); không tính test đó là đã qua.

## Acceptance criteria

| Tiêu chí | Bằng chứng |
|---|---|
| AC1: đủ nhiều nội dung | MultiIntentTests kiểm tra thứ tự và cả năm chủ đề; DB/HTTP/UI kiểm tra status/payment/delivery trong cùng lượt. |
| AC2: giữ đủ câu hỏi sau chọn đơn | DB/HTTP/UI hỏi ba chủ đề khi chưa có đơn rồi gửi mã; DB kiểm tra hai mã đơn và xác nhận cả đơn mới lẫn đơn đang chọn, ở cả hai chế độ context. |
| AC3: hỏi tiếp đúng đơn/chủ đề | DB/HTTP/UI hỏi bảo hành; DB/HTTP đổi đơn kế thừa các chủ đề mới nhất. |
| AC4: nguồn lỗi độc lập | DB giả lập catalogue xe lỗi nhưng payment/warranty/delivery vẫn trả; missing warranty có resultStatus=missing. Chỉ success được nhớ vào danh sách chủ đề. |
| AC5: quyền truy cập | DB kiểm tra mã đơn người khác và session người khác; regression context kiểm tra ID ngoài quyền, references đã lưu và thông tin không bị lộ. |
| AC6: trùng/model lỗi | Unit kiểm tra enum/schema/giới hạn, loại trùng, invalid JSON và provider lỗi; DB model cố ý trả dư chủ đề vẫn bị backend giới hạn theo câu hỏi và lượt thành công gần nhất. |
| AC7: replay/version/draft | DB và HTTP replay không thêm lượt; regression DB kiểm tra race và rollback; UI giả lập 409, giữ nguyên câu hỏi rồi gửi lại thành công. |

## Hợp đồng sau triển khai

ChatMessage thêm `sections` tùy chọn. Mỗi section gồm topic, content, resultStatus, retrievedAt và detailUrl. Content vẫn chứa toàn bộ câu trả lời cho client cũ; message cũ không có sections tiếp tục hiển thị bình thường.

Context giữ trường đơn và thêm LastBusinessIntents/PendingIntents. Parser đọc được classifier kiểu intent đơn cũ và kiểu intents mới. Lịch sử gửi tới model chỉ chứa câu hỏi, metadata tool/chủ đề thành công; không gửi lại giá/trạng thái/ngày từ câu trả lời cũ làm sự thật.

Multi-intent và pending topics hoạt động cả khi ContextEnabled=false. Khi tắt Bedrock, không gọi AWS. Các chủ đề được rule nhận diện rõ ràng ưu tiên hơn suy luận model; các câu còn lại dùng model/fallback. Một lượt chỉ một đơn; không thực hiện mutation.

## Vận hành và giới hạn

Đã quan sát AWS throttling khi kiểm thử đồng thời; fallback local giữ được các chủ đề hỗ trợ. Kiểm thử không bảo đảm mọi cách diễn đạt tự nhiên đều được phân loại đúng. Chưa mở rộng sang US-02 hoặc các tính năng ghi dữ liệu.

Ảnh smoke UI: [desktop](ui-desktop.png), [mobile](ui-mobile.png). Các phiên HTTP/UI demo vẫn được lưu để có thể mở lại; test không sửa đơn hoặc giao dịch demo.

## Chạy lại

```powershell
$env:CONTEXT_TEST_DATABASE = 'Host=localhost;Port=5432;Database=car_rag;Username=car_rag;Password=car_rag_dev'
$env:CONTEXT_HTTP_SMOKE = 'true'
dotnet test services/owner-features/tests/AutoWise.OwnerFeatures.Tests/AutoWise.OwnerFeatures.Tests.csproj --no-restore --verbosity minimal

# Nếu Playwright chưa nằm trong Node module path, trỏ NODE_PATH tới runtime được load_workspace_dependencies trả về.
node services/owner-features/tests/smoke_multi_intent_ui.cjs

# Build UI từ thư mục frontend.
npm run build --prefix frontend
```
